import pytest
from src.hallucination_guard import HallucinationGuard

def test_hallucination_guard_entailment():
    guard = HallucinationGuard()
    
    context = "The employee handbook states that all workers receive a 50 dollar internet stipend monthly."
    response = "Employees get a fifty dollar stipend every month for internet."
    
    is_hallucination, scores = guard.evaluate_response(context, response)
    
    # Factual match: should NOT be marked as hallucination
    assert not is_hallucination
    assert scores["entailment"] > scores["contradiction"]

def test_hallucination_guard_contradiction():
    guard = HallucinationGuard()
    
    context = "The employee handbook states that all workers receive a 50 dollar internet stipend monthly."
    response = "Employees receive a one hundred dollar internet stipend monthly."
    
    is_hallucination, scores = guard.evaluate_response(context, response)
    
    # Contradiction: should be marked as hallucination
    assert is_hallucination
    assert scores["contradiction"] > scores["entailment"]
