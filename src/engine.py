import time
import logging
from typing import List, Dict, Any, Tuple
from src.config import config
from src.retriever import HybridRetriever, Chunk
from src.reranker import Reranker
from src.query_expansion import QueryExpander
from src.hallucination_guard import HallucinationGuard
from src.llm_client import LocalLLMClient

logger = logging.getLogger("VigilantRAG")
logging.basicConfig(level=logging.INFO)

class VigilantRAGEngine:
    def __init__(self):
        self.retriever = HybridRetriever()
        self.reranker = Reranker()
        self.query_expander = QueryExpander()
        self.hallucination_guard = HallucinationGuard()
        self.llm = LocalLLMClient()

    def query(self, user_query: str, config_overrides: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Runs the self-correcting RAG pipeline on a user query.
        
        Returns:
            Dictionary containing final answer and detailed step-by-step execution telemetry.
        """
        start_time = time.time()
        
        # Apply temporary configuration overrides if any
        active_config = config
        if config_overrides:
            active_config = config.copy(update=config_overrides)
            
        telemetry = {
            "original_query": user_query,
            "final_query": user_query,
            "retrieval_attempts": [],
            "query_expansion_triggered": False,
            "generation_attempts": [],
            "hallucination_blocked_count": 0,
            "success": False,
            "execution_time_sec": 0.0
        }

        current_query = user_query
        retrieval_success = False
        top_chunks: List[Dict[str, Any]] = []

        # --- STAGE 1: Retrieval Loop (with Query Expansion) ---
        for attempt in range(active_config.max_query_expansion_retries + 1):
            attempt_log = {
                "attempt": attempt,
                "query": current_query,
                "dense_hits": 0,
                "sparse_hits": 0,
                "total_candidates": 0,
                "top_score": 0.0,
                "chunks": [],
                "status": "pending"
            }
            
             # 1. Hybrid Search
            candidates = self.retriever.search(
                current_query, 
                top_k_dense=active_config.top_k_dense, 
                top_k_sparse=active_config.top_k_sparse
            )
            
            # [SaaS Limit] If limit_document_id is set (Free plan: single doc search restriction)
            if config_overrides and config_overrides.get("limit_document_id"):
                doc_id_limit = config_overrides["limit_document_id"]
                candidates = [c for c in candidates if c["chunk"].doc_id == doc_id_limit]
            
            # Count source types for telemetry
            dense_count = sum(1 for c in candidates if "dense" in c["sources"])
            sparse_count = sum(1 for c in candidates if "sparse" in c["sources"])
            attempt_log["dense_hits"] = dense_count
            attempt_log["sparse_hits"] = sparse_count
            attempt_log["total_candidates"] = len(candidates)

            # 2. Re-ranking (Bypassed if use_reranking is False in Free plan)
            if config_overrides and config_overrides.get("use_reranking") is False:
                # Bypass Cross-Encoder. Direct sort chunks by dense score
                reranked = [
                    {
                        "chunk": item["chunk"],
                        "cross_score": item.get("dense_score", 0.0), # Fallback mockup score
                        "dense_score": item.get("dense_score", 0.0),
                        "sparse_score": item.get("sparse_score", 0.0),
                        "sources": item.get("sources", ["dense"])
                    }
                    for item in candidates[:active_config.top_n_final]
                ]
            else:
                # Standard Cross-Encoder Reranker execution
                reranked = self.reranker.rerank(current_query, candidates, top_n=active_config.top_n_final)

            # 3. Evaluate Retrieval Relevance
            top_score = reranked[0]["cross_score"] if reranked else -1.0
            attempt_log["top_score"] = top_score
            
            if top_score >= active_config.relevance_threshold:
                attempt_log["status"] = "relevant"
                telemetry["retrieval_attempts"].append(attempt_log)
                top_chunks = reranked
                retrieval_success = True
                break
            else:
                attempt_log["status"] = "irrelevant"
                telemetry["retrieval_attempts"].append(attempt_log)
                
                # If we have retries left, trigger Query Expansion
                if attempt < active_config.max_query_expansion_retries:
                    telemetry["query_expansion_triggered"] = True
                    logger.info(f"Retrieval top score {top_score:.3f} below threshold {active_config.relevance_threshold}. Triggering query expansion...")
                    
                    # Expand query using LLM (if model is initialized) or fall back to thesaurus
                    # To pass the LLM generator dynamically:
                    def llm_gen(p, temp, sys):
                        return self.llm.generate(p, temp, sys)
                    
                    current_query = self.query_expander.expand_llm(current_query, llm_gen)
                    logger.info(f"Query expanded to: '{current_query}'")
                else:
                    logger.warning("Query expansion retry limit reached. Proceeding with best available chunks.")
                    top_chunks = reranked

        telemetry["final_query"] = current_query
        
        # If absolutely no chunks were found (database is empty)
        if not top_chunks:
            telemetry["execution_time_sec"] = time.time() - start_time
            return {
                "answer": "I don't have any documents indexed yet. Please upload or ingest some documents first.",
                "telemetry": telemetry
            }

        # Combine texts from top 5 chunks to serve as context (Premise)
        context_text = "\n\n".join([f"Document [{item['chunk'].doc_title}]: {item['chunk'].text}" for item in top_chunks])

        # --- STAGE 2: Generation & Hallucination Guard Loop ---
        final_answer = ""
        current_temp = active_config.temperature_default
        
        # Default strict system prompt
        system_prompt = (
            "You are a factual assistant. Answer the query ONLY using the provided context. "
            "If the answer cannot be found in the context, say 'I cannot find the answer in the provided context'. "
            "Do not use external knowledge or make up facts."
        )

        for attempt in range(active_config.max_hallucination_retries + 1):
            gen_log = {
                "attempt": attempt,
                "temperature": current_temp,
                "system_prompt": system_prompt,
                "response_draft": "",
                "nli_scores": {},
                "status": "pending"
            }
            
            # Format Prompt
            generation_prompt = (
                f"Context information is below.\n"
                f"---------------------\n"
                f"{context_text}\n"
                f"---------------------\n"
                f"Given the context information above, answer the query.\n"
                f"Query: {telemetry['original_query']}\n"
                f"Answer:"
            )
            
            # 1. Generate Response
            draft = self.llm.generate(generation_prompt, temperature=current_temp, system_prompt=system_prompt)
            gen_log["response_draft"] = draft
            
            # 2. Audit Response via NLI Guard (Bypassed if use_nli_guard is False in Free plan)
            if config_overrides and config_overrides.get("use_nli_guard") is False:
                # Bypass DeBERTa NLI checks. Auto-verify the draft response
                is_hallucination = False
                nli_scores = {"entailment": 1.0, "contradiction": 0.0, "neutral": 0.0}
            else:
                # Standard DeBERTa validation audit execution
                is_hallucination, nli_scores = self.hallucination_guard.evaluate_response(context_text, draft)
            
            gen_log["nli_scores"] = nli_scores
            
            if not is_hallucination:
                final_answer = draft
                telemetry["success"] = True
                gen_log["status"] = "passed"
                telemetry["generation_attempts"].append(gen_log)
                break
            else:
                telemetry["hallucination_blocked_count"] += 1
                gen_log["status"] = "hallucinated"
                telemetry["generation_attempts"].append(gen_log)
                
                # Adjust generation constraints for next try
                if attempt < active_config.max_hallucination_retries:
                    # Switch to a higher temperature to explore alternative wordings,
                    # and tighten the system prompt to enforce strict context alignment.
                    current_temp = active_config.temperature_retry
                    system_prompt = (
                        "CRITICAL: You generated information not present in the context. "
                        "You must ONLY use the provided context. If the query cannot be answered exactly "
                        "using the context, say 'I cannot find the answer in the provided context'. "
                        "DO NOT make up facts. Answer strictly and factually."
                    )
                else:
                    logger.warning("Max hallucination retries reached. Returning the most factual fallback statement.")
                    final_answer = (
                        "I cannot answer this question with absolute certainty based on the provided documents. "
                        "My NLI guard detected a potential hallucination in the drafted response."
                    )

        telemetry["execution_time_sec"] = time.time() - start_time
        
        return {
            "answer": final_answer,
            "telemetry": telemetry
        }
