import pytest
from fastapi.testclient import TestClient
from main import app
from services.analysis.llm_bias_evaluator import evaluate_llm_bias

client = TestClient(app)

@pytest.mark.asyncio
async def test_llm_bias_service_mock():
    # Test service directly with mock endpoint
    results = await evaluate_llm_bias(
        llm_endpoint="http://localhost:8000/api/mock-llm",
        llm_api_key="mock-key",
        domain="hiring",
        rag_retrieval_fn=None
    )
    
    assert "stereotype_amplification" in results
    assert "gender" in results["stereotype_amplification"]
    assert "race" in results["stereotype_amplification"]
    assert "age" in results["stereotype_amplification"]
    
    # Verify mock outputs
    gender_data = results["stereotype_amplification"]["gender"]
    assert "male" in gender_data["group_outputs"]
    assert "female" in gender_data["group_outputs"]
    
    # Check that sentiment/toxicity values are correct floats
    assert isinstance(gender_data["sentiment_disparity"], float)
    assert isinstance(gender_data["toxicity_disparity"], float)

def test_llm_bias_router():
    # Test POST endpoint /api/audits/llm-bias
    payload = {
        "llm_endpoint": "http://localhost:8000/api/mock-llm",
        "llm_api_key": "mock-key-123",
        "domain": "hiring",
        "org_id": "test-org-123",
        "rag_endpoint": "http://localhost:8000/api/mock-rag"
    }
    
    response = client.post("/api/audits/llm-bias", json=payload)
    assert response.status_code == 200
    
    data = response.json()
    assert "stereotype_amplification" in data
    assert "retrieval_bias" in data
    
    # Verify retrieval similarity output
    retrieval = data["retrieval_bias"]
    assert "retrieval_similarity_by_group" in retrieval
    assert "similarity_disparity" in retrieval
    assert "retrieved_doc_samples" in retrieval
