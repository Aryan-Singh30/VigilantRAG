import os
from pydantic import BaseModel, Field

class AppConfig(BaseModel):
    # Models
    dense_model_name: str = Field(default="sentence-transformers/all-MiniLM-L6-v2", description="Model for generating dense vector embeddings")
    cross_encoder_model_name: str = Field(default="cross-encoder/ms-marco-MiniLM-L-6-v2", description="Cross-encoder model for re-ranking search results")
    llm_model_name: str = Field(default="Qwen/Qwen2.5-0.5B-Instruct", description="Local LLM for answer generation (TinyLlama/TinyLlama-1.1B-Chat-v1.0 is another option)")
    nli_model_name: str = Field(default="cross-encoder/nli-deberta-v3-xsmall", description="Lightweight NLI model for the Hallucination Guard (or facebook/bart-large-mnli)")

    # Retrieval Thresholds and weights
    relevance_threshold: float = Field(default=0.4, description="Cross-Encoder score threshold. Scores below this trigger Query Expansion.")
    nli_threshold: float = Field(default=0.6, description="NLI entailment score threshold. Scores below this trigger regeneration.")
    
    # Retrieval Hyperparameters
    chunk_size: int = Field(default=500, description="Document chunk size in characters")
    chunk_overlap: int = Field(default=50, description="Overlapping characters between chunks")
    top_k_dense: int = Field(default=25, description="Number of candidate chunks to retrieve from FAISS")
    top_k_sparse: int = Field(default=25, description="Number of candidate chunks to retrieve from BM25")
    top_n_final: int = Field(default=5, description="Final number of re-ranked chunks to pass to the LLM")

    # Retry Policies
    max_query_expansion_retries: int = Field(default=2, description="Maximum query expansion retries before giving up")
    max_hallucination_retries: int = Field(default=2, description="Maximum response regeneration retries upon hallucination detection")

    # Generation Hyperparameters
    temperature_default: float = Field(default=0.2, description="Default generation temperature")
    temperature_retry: float = Field(default=0.7, description="Higher temperature used when a hallucination is detected to explore alternative outputs")

    # Local storage settings
    data_dir: str = Field(default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"), description="Directory to store ingested documents and cache")

    class Config:
        frozen = False

# Instantiate a global configuration object
config = AppConfig()
