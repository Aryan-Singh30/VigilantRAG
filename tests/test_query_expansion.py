import pytest
from src.query_expansion import QueryExpander

def test_thesaurus_expansion():
    expander = QueryExpander()
    
    # Simple query with keyword "remote"
    query = "remote developer options"
    expanded = expander.expand_thesaurus(query)
    
    assert "remote" in expanded
    # The thesaurus should have expanded synonyms (like "wfh", "telecommute", etc.)
    assert any(syn in expanded for syn in ["telecommute", "wfh", "offsite"])

def test_llm_expansion_callback():
    expander = QueryExpander()
    
    # Mock LLM generation function
    def mock_llm_generate(prompt, temperature, system_prompt):
        return "Rewritten query: telecommute coder jobs"
        
    query = "remote developer options"
    expanded = expander.expand_llm(query, mock_llm_generate)
    
    # The "Rewritten query:" prefix should be stripped, and it should return the mock value
    assert expanded == "telecommute coder jobs"
