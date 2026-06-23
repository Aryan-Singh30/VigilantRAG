import pytest
from fastapi.testclient import TestClient
import os
import shutil
from app import app
from src.config import config

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_data_dir():
    # Override configuration storage path to a test directory
    original_data_dir = config.data_dir
    test_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "test_api_cache")
    config.data_dir = test_dir
    os.makedirs(test_dir, exist_ok=True)
    
    # Reset retriever state to use test directory and clear any pre-loaded memory
    from app import engine
    engine.retriever.dense_index_path = os.path.join(test_dir, "dense_index.faiss")
    engine.retriever.chunks_path = os.path.join(test_dir, "chunks.pkl")
    engine.retriever.documents_path = os.path.join(test_dir, "documents.pkl")
    engine.retriever.documents = {}
    engine.retriever.chunks = []
    engine.retriever.dense_index = None
    engine.retriever.bm25 = None
    engine.retriever.bm25_tokenized_corpus = []
    
    yield
    
    # Teardown: Remove test files
    if os.path.exists(test_dir):
        shutil.rmtree(test_dir)
    config.data_dir = original_data_dir

def test_api_crud_workflow():
    # 1. Get empty documents list
    response = client.get("/api/documents")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
    
    # 2. Ingest document
    payload = {
        "doc_id": "api_test_doc",
        "title": "API Policy Guide",
        "text": "The salary for junior programmers is 60000 dollars annually. Senior programmers earn 120000 dollars."
    }
    response = client.post("/api/ingest", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    assert response.json()["chunks_created"] > 0
    
    # 3. Verify document exists in list
    response = client.get("/api/documents")
    assert response.status_code == 200
    docs = response.json()
    assert len(docs) == 1
    assert docs[0]["id"] == "api_test_doc"
    assert docs[0]["title"] == "API Policy Guide"
    
    # 4. Query
    query_payload = {
        "query": "How much does a junior programmer make?",
        "relevance_threshold": 0.3
    }
    response = client.post("/api/query", json=query_payload)
    assert response.status_code == 200
    res_data = response.json()
    assert "answer" in res_data
    assert "telemetry" in res_data
    assert "api_test_doc" in str(res_data["telemetry"]["retrieval_attempts"][0]["chunks"])
    
    # 5. Delete document
    response = client.delete("/api/documents/api_test_doc")
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    
    # 6. Verify empty list again
    response = client.get("/api/documents")
    assert len(response.json()) == 0
