import re
from typing import List, Dict, Any, Callable, Optional
import nltk
from nltk.corpus import wordnet
from src.config import config

class QueryExpander:
    def __init__(self):
        # Local predefined synonym dictionary for common terms (domain-specific fallback)
        self.synonym_dict = {
            "remote work": ["telecommuting", "work from home", "wfh", "flexible location"],
            "remote": ["telecommute", "wfh", "offsite"],
            "benefits": ["perks", "healthcare", "insurance", "compensation", "allowance"],
            "vacation": ["leave", "holiday", "time off", "pto"],
            "illness": ["sick", "disease", "medical", "health"],
            "disease": ["infection", "defect", "spot", "blight", "rust", "pathogen"],
            "crop": ["plant", "leaf", "grain", "wheat", "rice", "agriculture"],
            "salary": ["pay", "compensation", "wages", "income"],
            "developer": ["programmer", "engineer", "coder", "software creator"],
            "security": ["safety", "auth", "login", "encryption"],
            "database": ["db", "storage", "index", "faiss", "sql"],
            "retrieve": ["search", "fetch", "find", "get"]
        }
        
        # Try downloading wordnet quietly
        try:
            nltk.download('wordnet', quiet=True)
            nltk.download('omw-1.4', quiet=True)
            self.wordnet_available = True
        except Exception:
            self.wordnet_available = False

    def _get_wordnet_synonyms(self, word: str) -> List[str]:
        """Fetches synonyms for a word using NLTK WordNet."""
        if not self.wordnet_available:
            return []
        
        synonyms = []
        try:
            for syn in wordnet.synsets(word):
                for lemma in syn.lemmas():
                    name = lemma.name().replace('_', ' ')
                    if name.lower() != word.lower() and name not in synonyms:
                        synonyms.append(name)
        except Exception:
            pass
        return synonyms[:3] # Limit to top 3 synonyms

    def expand_thesaurus(self, query: str) -> str:
        """
        Rewrites the query using rule-based/thesaurus-based synonym lookup.
        Extracts key words, finds synonyms, and appends them to the query.
        """
        query_lower = query.lower().strip()
        expanded_terms = []

        # Check for phrase-level matches in our custom dictionary first
        for phrase, synonyms in self.synonym_dict.items():
            if phrase in query_lower:
                expanded_terms.extend(synonyms)

        # Tokenize query into alphanumeric words to find individual word synonyms
        words = re.findall(r'\b\w+\b', query_lower)
        for word in words:
            # Skip very short words (stop words/prepositions)
            if len(word) <= 3:
                continue
                
            # Check local dictionary
            if word in self.synonym_dict:
                expanded_terms.extend(self.synonym_dict[word])
                
            # Check wordnet
            wn_syns = self._get_wordnet_synonyms(word)
            expanded_terms.extend(wn_syns)

        # Deduplicate terms and exclude words already in the original query
        original_words = set(words)
        unique_extensions = []
        for term in expanded_terms:
            term_lower = term.lower()
            if term_lower not in original_words and term_lower not in unique_extensions:
                unique_extensions.append(term)

        # Combine original query with the new search terms
        if unique_extensions:
            # Limit number of appended terms to prevent query dilution
            return f"{query} ({', '.join(unique_extensions[:4])})"
        return query

    def expand_llm(self, query: str, llm_generate_fn: Callable[[str, float, str], str]) -> str:
        """
        Uses the local LLM to rewrite the query with synonyms and alternate phrasing.
        
        Args:
            query: Original search query.
            llm_generate_fn: A function that takes (prompt, temperature, system_prompt) and returns generated text.
        """
        system_prompt = (
            "You are a search engine query optimizer. Your job is to rewrite the user's search query "
            "to make it more effective for document search. Output ONLY the rewritten search query. "
            "Do not include explanations, quotes, introduction, or formatting. Keep it concise."
        )
        
        prompt = (
            f"Rewrite this search query to include synonyms, alternate terms, and related keywords to improve retrieval:\n\n"
            f"Original query: {query}\n\n"
            f"Rewritten query:"
        )
        
        try:
            # We run the LLM query rewrite with a low temperature for stability
            rewritten = llm_generate_fn(prompt, 0.1, system_prompt)
            rewritten_clean = rewritten.replace('"', '').replace("'", "").strip()
            
            # If the LLM returned something sensible (not empty and not repeating the prompt)
            if rewritten_clean and len(rewritten_clean) > 3 and "Original query" not in rewritten_clean:
                # Remove prefix like "Rewritten query:" if the LLM output it
                rewritten_clean = re.sub(r'^(rewritten query|query|output):\s*', '', rewritten_clean, flags=re.IGNORECASE)
                return rewritten_clean
        except Exception as e:
            # Fallback to thesaurus if LLM rewrite fails
            pass
            
        return self.expand_thesaurus(query)
