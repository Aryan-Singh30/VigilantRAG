import pytest
from src.reranker import Reranker
from src.retriever import Chunk

def test_reranker_sort():
    reranker = Reranker()
    
    # Create mock candidates
    chunk1 = Chunk(id="c1", doc_id="d1", doc_title="Title 1", text="The remote work policy allows employees to work offsite up to 3 days per week.", chunk_index=0)
    chunk2 = Chunk(id="c2", doc_id="d2", doc_title="Title 2", text="Our office serves freshly brewed coffee and espresso drinks every morning.", chunk_index=0)
    
    candidates = [
        {"chunk": chunk1, "dense_score": 0.5, "sparse_score": 1.0, "sources": ["dense", "sparse"]},
        {"chunk": chunk2, "dense_score": 0.2, "sparse_score": 0.0, "sources": ["dense"]}
    ]
    
    # Query is related to remote work
    query = "working from home policy"
    
    reranked = reranker.rerank(query, candidates, top_n=2)
    
    assert len(reranked) == 2
    # The chunk about remote work should be ranked higher
    assert reranked[0]["chunk"].id == "c1"
    assert "cross_score" in reranked[0]
    assert reranked[0]["cross_score"] > reranked[1]["cross_score"]
