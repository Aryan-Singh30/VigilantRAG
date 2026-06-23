import os
import pickle
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from rank_bm25 import BM25Okapi
from pydantic import BaseModel
from typing import List, Dict, Any, Tuple, Optional
from src.config import config

class Document(BaseModel):
    id: str
    title: str
    text: str
    metadata: Dict[str, Any] = {}

class Chunk(BaseModel):
    id: str
    doc_id: str
    doc_title: str
    text: str
    chunk_index: int
    metadata: Dict[str, Any] = {}

class HybridRetriever:
    def __init__(self):
        # Create data directory if it doesn't exist
        os.makedirs(config.data_dir, exist_ok=True)
        
        self.dense_index_path = os.path.join(config.data_dir, "dense_index.faiss")
        self.chunks_path = os.path.join(config.data_dir, "chunks.pkl")
        self.documents_path = os.path.join(config.data_dir, "documents.pkl")
        
        # In-memory stores
        self.documents: Dict[str, Document] = {}
        self.chunks: List[Chunk] = []
        
        # Dense Model
        self.dense_model = None  # Lazy loaded
        self.dense_index = None
        
        # Sparse Model
        self.bm25 = None
        self.bm25_tokenized_corpus = []

        # Load existing database if available
        self.load()

    def _get_dense_model(self) -> SentenceTransformer:
        if self.dense_model is None:
            # Load SentenceTransformer Bi-Encoder
            self.dense_model = SentenceTransformer(config.dense_model_name)
        return self.dense_model

    def chunk_text(self, text: str, title: str, doc_id: str, metadata: dict = None) -> List[Chunk]:
        """Splits raw text into overlapping chunks of configurable size."""
        if metadata is None:
            metadata = {}
            
        chunks = []
        words = text.split()
        
        # Simple word-based chunker with overlap
        chunk_size_words = int(config.chunk_size / 6)  # Approx 6 chars per word
        overlap_words = int(config.chunk_overlap / 6)
        
        if chunk_size_words <= 0:
            chunk_size_words = 80
        if overlap_words < 0:
            overlap_words = 10
            
        step = chunk_size_words - overlap_words
        if step <= 0:
            step = chunk_size_words
            
        i = 0
        chunk_idx = 0
        while i < len(words):
            chunk_words = words[i:i + chunk_size_words]
            chunk_text = " ".join(chunk_words)
            
            chunk_id = f"{doc_id}_chunk_{chunk_idx}"
            chunks.append(Chunk(
                id=chunk_id,
                doc_id=doc_id,
                doc_title=title,
                text=chunk_text,
                chunk_index=chunk_idx,
                metadata=metadata
            ))
            
            chunk_idx += 1
            i += step
            if i >= len(words) and len(chunk_words) < chunk_size_words:
                break
                
        # If no chunks were created (e.g. empty document)
        if not chunks:
            chunks.append(Chunk(
                id=f"{doc_id}_chunk_0",
                doc_id=doc_id,
                doc_title=title,
                text=text,
                chunk_index=0,
                metadata=metadata
            ))
            
        return chunks

    def tokenize_text(self, text: str) -> List[str]:
        """Simple tokenizer for BM25 (lowercase, alphanumeric split)."""
        return [w.strip().lower() for w in text.split() if w.strip()]

    def build_indices(self):
        """Builds both FAISS and BM25 indices from the current in-memory chunks list."""
        if not self.chunks:
            self.dense_index = None
            self.bm25 = None
            return

        # 1. Build Dense Index (FAISS)
        texts = [chunk.text for chunk in self.chunks]
        model = self._get_dense_model()
        embeddings = model.encode(texts, show_progress_bar=False)
        
        # L2-normalize embeddings for cosine similarity using inner product
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        # Avoid division by zero
        norms = np.where(norms == 0, 1e-12, norms)
        normalized_embeddings = embeddings / norms
        
        dimension = normalized_embeddings.shape[1]
        self.dense_index = faiss.IndexFlatIP(dimension)
        self.dense_index.add(normalized_embeddings.astype('float32'))
        
        # 2. Build Sparse Index (BM25)
        self.bm25_tokenized_corpus = [self.tokenize_text(text) for text in texts]
        self.bm25 = BM25Okapi(self.bm25_tokenized_corpus)

    def ingest_document(self, doc_id: str, title: str, text: str, metadata: dict = None) -> int:
        """Chunks a document, adds to index, rebuilds indices, and persists to disk."""
        if metadata is None:
            metadata = {}
            
        # Create Document
        doc = Document(id=doc_id, title=title, text=text, metadata=metadata)
        self.documents[doc_id] = doc
        
        # Create Chunks
        new_chunks = self.chunk_text(text, title, doc_id, metadata)
        
        # Remove any existing chunks for this document ID (to allow overwriting)
        self.chunks = [c for c in self.chunks if c.doc_id != doc_id]
        self.chunks.extend(new_chunks)
        
        # Rebuild indices
        self.build_indices()
        
        # Save to disk
        self.save()
        
        return len(new_chunks)

    def delete_document(self, doc_id: str) -> bool:
        """Deletes a document and its chunks, then rebuilds indices."""
        if doc_id in self.documents:
            del self.documents[doc_id]
            self.chunks = [c for c in self.chunks if c.doc_id != doc_id]
            self.build_indices()
            self.save()
            return True
        return False

    def search(self, query: str, top_k_dense: int = None, top_k_sparse: int = None) -> List[Dict[str, Any]]:
        """Performs hybrid search. Retrieves top chunks from dense and sparse indexes, then merges/deduplicates."""
        if not self.chunks or (self.dense_index is None and self.bm25 is None):
            return []

        top_k_d = top_k_dense or config.top_k_dense
        top_k_s = top_k_sparse or config.top_k_sparse

        dense_results: List[Dict[str, Any]] = []
        sparse_results: List[Dict[str, Any]] = []

        # 1. Dense Search
        if self.dense_index is not None:
            model = self._get_dense_model()
            query_emb = model.encode([query], show_progress_bar=False)
            norm = np.linalg.norm(query_emb)
            if norm > 0:
                query_emb = query_emb / norm
            
            # Search FAISS
            k = min(top_k_d, len(self.chunks))
            distances, indices = self.dense_index.search(query_emb.astype('float32'), k)
            
            for score, idx in zip(distances[0], indices[0]):
                if idx != -1 and idx < len(self.chunks):
                    dense_results.append({
                        "chunk": self.chunks[idx],
                        "dense_score": float(score),
                        "source": "dense"
                    })

        # 2. Sparse Search
        if self.bm25 is not None:
            tokenized_query = self.tokenize_text(query)
            # Get BM25 scores
            scores = self.bm25.get_scores(tokenized_query)
            
            # Get top indices
            k = min(top_k_s, len(self.chunks))
            top_indices = np.argsort(scores)[::-1][:k]
            
            for idx in top_indices:
                score = scores[idx]
                if score > 0:  # Only retrieve matching words
                    sparse_results.append({
                        "chunk": self.chunks[idx],
                        "sparse_score": float(score),
                        "source": "sparse"
                    })

        # 3. Merge & Deduplicate
        merged_chunks: Dict[str, Dict[str, Any]] = {}
        
        # Process dense search
        for item in dense_results:
            c_id = item["chunk"].id
            merged_chunks[c_id] = {
                "chunk": item["chunk"],
                "dense_score": item["dense_score"],
                "sparse_score": 0.0,
                "sources": ["dense"]
            }
            
        # Process sparse search
        for item in sparse_results:
            c_id = item["chunk"].id
            if c_id in merged_chunks:
                merged_chunks[c_id]["sparse_score"] = item["sparse_score"]
                merged_chunks[c_id]["sources"].append("sparse")
            else:
                merged_chunks[c_id] = {
                    "chunk": item["chunk"],
                    "dense_score": 0.0,
                    "sparse_score": item["sparse_score"],
                    "sources": ["sparse"]
                }
                
        # Return candidate list (unranked, to be scored by Cross-Encoder)
        return list(merged_chunks.values())

    def save(self):
        """Persists the indices and data to disk."""
        # Save documents and chunks
        with open(self.documents_path, "wb") as f:
            pickle.dump(self.documents, f)
        with open(self.chunks_path, "wb") as f:
            pickle.dump(self.chunks, f)
            
        # Save FAISS Index
        if self.dense_index is not None:
            faiss.write_index(self.dense_index, self.dense_index_path)

    def load(self):
        """Loads indices and data from disk."""
        if os.path.exists(self.documents_path):
            with open(self.documents_path, "rb") as f:
                self.documents = pickle.load(f)
                
        if os.path.exists(self.chunks_path):
            with open(self.chunks_path, "rb") as f:
                self.chunks = pickle.load(f)
                
        if os.path.exists(self.dense_index_path) and self.chunks:
            self.dense_index = faiss.read_index(self.dense_index_path)
            
        # Re-build BM25 if there are chunks
        if self.chunks:
            texts = [chunk.text for chunk in self.chunks]
            self.bm25_tokenized_corpus = [self.tokenize_text(text) for text in texts]
            self.bm25 = BM25Okapi(self.bm25_tokenized_corpus)
