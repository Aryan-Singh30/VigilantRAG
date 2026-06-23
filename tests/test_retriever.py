import pytest
import os
import shutil
from src.config import config
from src.retriever import HybridRetriever, Document, Chunk

@pytest.fixture(autouse=True)
def setup_test_data_dir():
    # Override configuration storage path to a test directory
    original_data_dir = config.data_dir
    test_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "test_data_cache")
    config.data_dir = test_dir
    os.makedirs(test_dir, exist_ok=True)
    
    yield
    
    # Teardown: Remove test files
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)
    config.data_dir = original_data_dir

def test_chunk_text():
    retriever = HybridRetriever()
    # Mock some parameters to make chunking test predictable
    config.chunk_size = 60
    config.chunk_overlap = 12
    
    text = "The quick brown fox jumps over the lazy dog. A quick brown fox was jumping over a lazy dog. Another quick brown fox did jump."
    chunks = retriever.chunk_text(text, "Fox Title", "doc_fox")
    
    assert len(chunks) > 0
    assert chunks[0].doc_id == "doc_fox"
    assert chunks[0].doc_title == "Fox Title"
    assert "quick" in chunks[0].text

def test_ingest_and_search():
    retriever = HybridRetriever()
    doc_id = "test_doc"
    title = "Test Policy Document"
    text = "Benefits plan allows workers to request visual health dental checkups. Dental visits are paid up to 100 dollars."
    
    # Ingest document
    chunk_count = retriever.ingest_document(doc_id, title, text)
    assert chunk_count > 0
    assert doc_id in retriever.documents
    assert len(retriever.chunks) == chunk_count
    
    # Search
    results = retriever.search("dental checkups")
    assert len(results) > 0
    
    # Verify shape of returned elements
    first_result = results[0]
    assert "chunk" in first_result
    assert first_result["chunk"].doc_id == "test_doc"
    assert "dense_score" in first_result
    assert "sparse_score" in first_result
    assert "sources" in first_result
