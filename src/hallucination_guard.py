import numpy as np
from sentence_transformers import CrossEncoder
from typing import Dict, Any, Tuple
from src.config import config

class HallucinationGuard:
    def __init__(self):
        self.model = None  # Lazy loading
        self.label_mapping = {}

    def _get_model(self) -> CrossEncoder:
        if self.model is None:
            # Load CrossEncoder NLI model
            self.model = CrossEncoder(config.nli_model_name)
            
            # Extract label mappings dynamically from the underlying HuggingFace model
            try:
                hf_config = self.model.model.config
                id2label = hf_config.id2label
                # Normalize labels to lowercase for easy matching
                self.label_mapping = {v.lower(): k for k, v in id2label.items()}
            except Exception:
                # Fallback to standard MNLI indices if config lookup fails
                self.label_mapping = {
                    "contradiction": 0,
                    "entailment": 1,
                    "neutral": 2
                }
        return self.model

    def _softmax(self, x: np.ndarray) -> np.ndarray:
        """Applies softmax to logits to get probabilities."""
        e_x = np.exp(x - np.max(x, axis=-1, keepdims=True))
        return e_x / np.sum(e_x, axis=-1, keepdims=True)

    def evaluate_response(self, context: str, response: str) -> Tuple[bool, Dict[str, float]]:
        """
        Evaluates whether the generated response is entailed by the retrieved context.
        
        Args:
            context: Concatenated text of retrieved chunks (Premise).
            response: Generated LLM response (Hypothesis).
            
        Returns:
            Tuple of (is_hallucination_detected, scores_dictionary)
        """
        if not context.strip() or not response.strip():
            return False, {"entailment": 1.0, "contradiction": 0.0, "neutral": 0.0}

        model = self._get_model()

        # Pair: (Premise, Hypothesis)
        pair = (context, response)
        
        # Predict logits
        logits = model.predict([pair], show_progress_bar=False)[0]
        
        # Convert logits to probabilities
        probs = self._softmax(logits)

        # Map probabilities using the resolved label indices
        entailment_idx = self.label_mapping.get("entailment", 1)
        contradiction_idx = self.label_mapping.get("contradiction", 0)
        neutral_idx = self.label_mapping.get("neutral", 2)

        # Safely extract scores
        entailment_score = float(probs[entailment_idx]) if entailment_idx < len(probs) else 0.0
        contradiction_score = float(probs[contradiction_idx]) if contradiction_idx < len(probs) else 0.0
        neutral_score = float(probs[neutral_idx]) if neutral_idx < len(probs) else 0.0

        scores = {
            "entailment": entailment_score,
            "contradiction": contradiction_score,
            "neutral": neutral_score
        }

        # Flag as hallucination if entailment score is below threshold
        # or if contradiction score is higher than entailment and indicates meaningful contradiction
        is_hallucination = (entailment_score < config.nli_threshold) or (contradiction_score > entailment_score and contradiction_score > 0.15)

        return is_hallucination, scores
