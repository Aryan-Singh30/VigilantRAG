from sentence_transformers import CrossEncoder
from typing import List, Dict, Any
from src.config import config

class Reranker:
    def __init__(self):
        self.model = None  # Lazy loading

    def _get_model(self) -> CrossEncoder:
        if self.model is None:
            # Load CrossEncoder model
            self.model = CrossEncoder(config.cross_encoder_model_name)
        return self.model

    def rerank(self, query: str, candidates: List[Dict[str, Any]], top_n: int = None) -> List[Dict[str, Any]]:
        """
        Reranks a list of candidate chunks against the query using a Cross-Encoder.
        
        Args:
            query: The user's search query.
            candidates: A list of dicts, each containing a Chunk object under the key "chunk".
            top_n: Number of final chunks to return. Defaults to config.top_n_final.
            
        Returns:
            Sorted list of candidates with a 'cross_score' key, descending.
        """
        if not candidates:
            return []

        top_n = top_n or config.top_n_final
        model = self._get_model()

        # Build pairs: (query, text)
        pairs = [[query, item["chunk"].text] for item in candidates]
        
        # Predict relevance scores
        scores = model.predict(pairs, show_progress_bar=False)
        
        # Add score to each candidate
        reranked = []
        for i, item in enumerate(candidates):
            item_copy = item.copy()
            # Map score to float (predict returns numpy array of floats)
            item_copy["cross_score"] = float(scores[i])
            reranked.append(item_copy)
            
        # Sort descending by cross-encoder score
        reranked.sort(key=lambda x: x["cross_score"], reverse=True)
        
        # Cap at top_n
        return reranked[:top_n]
