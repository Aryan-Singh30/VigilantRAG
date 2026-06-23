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
            
            # Count source types for telemetry
            dense_count = sum(1 for c in candidates if "dense" in c["sources"])
            sparse_count = sum(1 for c in candidates if "sparse" in c["sources"])
            attempt_log["dense_hits"] = dense_count
            attempt_log["sparse_hits"] = sparse_count
            attempt_log["total_candidates"] = len(candidates)

            # 2. Re-ranking
            reranked = self.reranker.rerank(current_query, candidates, top_n=active_config.top_n_final)
            attempt_log["chunks"] = [
                {
                    "id": item["chunk"].id,
                    "doc_title": item["chunk"].doc_title,
                    "text": item["chunk"].text,
                    "cross_score": item["cross_score"],
                    "dense_score": item["dense_score"],
                    "sparse_score": item["sparse_score"],
                    "sources": item["sources"]
                }
                for item in reranked
            ]

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
        context_text = "\n\n".join([item["chunk"].text for item in top_chunks])

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
            
            # 2. Audit Response via NLI Guard
            is_hallucination, nli_scores = self.hallucination_guard.evaluate_response(context_text, draft)
            gen_log["nli_scores"] = nli_scores
            
            if not is_hallucination:
                gen_log["status"] = "verified"
                telemetry["generation_attempts"].append(gen_log)
                telemetry["success"] = True
                final_answer = draft
                break
            else:
                gen_log["status"] = "hallucinated"
                telemetry["generation_attempts"].append(gen_log)
                telemetry["hallucination_blocked_count"] += 1
                logger.warning(f"Hallucination detected in attempt {attempt} (Entailment: {nli_scores['entailment']:.3f}, Contradiction: {nli_scores['contradiction']:.3f}). Blocking response.")
                
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
