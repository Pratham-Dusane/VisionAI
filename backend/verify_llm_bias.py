import asyncio
import sys
from fastapi.testclient import TestClient

# Add current dir to path
sys.path.append(".")

from main import app
from services.analysis.llm_bias_evaluator import evaluate_llm_bias

client = TestClient(app)

async def test_service():
    print("Testing LLM Bias Evaluator Service...")
    results = await evaluate_llm_bias(
        llm_endpoint="http://localhost:8000/api/mock-llm",
        llm_api_key="mock-key",
        domain="hiring",
        rag_retrieval_fn=None
    )
    
    assert "stereotype_amplification" in results, "Missing stereotype_amplification"
    assert "gender" in results["stereotype_amplification"], "Missing gender attribute"
    assert "race" in results["stereotype_amplification"], "Missing race attribute"
    assert "age" in results["stereotype_amplification"], "Missing age attribute"
    
    gender_data = results["stereotype_amplification"]["gender"]
    assert "male" in gender_data["group_outputs"], "Missing male group"
    assert "female" in gender_data["group_outputs"], "Missing female group"
    assert isinstance(gender_data["sentiment_disparity"], float), "Disparity should be float"
    print("Service tests PASSED!")

def test_router():
    print("Testing LLM Bias Router Endpoint...")
    payload = {
        "llm_endpoint": "http://localhost:8000/api/mock-llm",
        "llm_api_key": "mock-key-123",
        "domain": "hiring",
        "org_id": "test-org-123",
        "rag_endpoint": "http://localhost:8000/api/mock-rag"
    }
    
    response = client.post("/api/audits/llm-bias", json=payload)
    assert response.status_code == 200, f"Router returned {response.status_code}: {response.text}"
    
    data = response.json()
    assert "stereotype_amplification" in data, "Missing stereotype_amplification in response"
    assert "retrieval_bias" in data, "Missing retrieval_bias in response"
    
    retrieval = data["retrieval_bias"]
    assert "retrieval_similarity_by_group" in retrieval, "Missing retrieval_similarity_by_group"
    assert "similarity_disparity" in retrieval, "Missing similarity_disparity"
    assert "retrieved_doc_samples" in retrieval, "Missing retrieved_doc_samples"
    print("Router endpoint tests PASSED!")

if __name__ == "__main__":
    asyncio.run(test_service())
    test_router()
    print("All verification tests PASSED successfully!")
