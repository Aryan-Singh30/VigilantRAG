import os
import logging
from sentence_transformers import SentenceTransformer, CrossEncoder
from transformers import AutoTokenizer, AutoModelForCausalLM

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ModelDownloader")

def download_and_cache_models():
    # 1. Bi-Encoder
    bi_encoder_name = "sentence-transformers/all-MiniLM-L6-v2"
    logger.info(f"Downloading Bi-Encoder: {bi_encoder_name}")
    SentenceTransformer(bi_encoder_name)
    
    # 2. Cross-Encoder Re-ranker
    reranker_name = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    logger.info(f"Downloading Cross-Encoder Re-ranker: {reranker_name}")
    CrossEncoder(reranker_name)
    
    # 3. NLI Model
    nli_name = "cross-encoder/nli-deberta-v3-xsmall"
    logger.info(f"Downloading NLI model: {nli_name}")
    CrossEncoder(nli_name)
    
    # 4. Local LLM (Tokenizer and Causal LM)
    llm_name = "Qwen/Qwen2.5-0.5B-Instruct"
    logger.info(f"Downloading Local LLM tokenizer: {llm_name}")
    AutoTokenizer.from_pretrained(llm_name)
    logger.info(f"Downloading Local LLM weights: {llm_name}")
    AutoModelForCausalLM.from_pretrained(llm_name)
    
    logger.info("All models downloaded and cached successfully!")

if __name__ == "__main__":
    download_and_cache_models()
