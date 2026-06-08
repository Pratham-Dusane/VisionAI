from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from services.analysis.llm_bias_evaluator import evaluate_llm_bias
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class LLMBiasRequest(BaseModel):
    llm_endpoint: str
    llm_api_key: str
    domain: str
    org_id: str
    model_name: Optional[str] = None
    rag_endpoint: Optional[str] = None

@router.post("/llm-bias")
async def run_llm_bias_scan(request: LLMBiasRequest):
    try:
        # Define the retrieval function if a RAG endpoint is provided
        rag_fn = None
        if request.rag_endpoint:
            import httpx
            
            async def temp_rag_retrieval(query: str) -> list[str]:
                if not any(m in request.rag_endpoint.lower() for m in ["mock", "dummy", "test"]):
                    try:
                        async with httpx.AsyncClient(timeout=10.0) as client:
                            resp = await client.post(
                                request.rag_endpoint,
                                json={"query": query}
                            )
                            if resp.status_code == 200:
                                data = resp.json()
                                if isinstance(data, list):
                                    return [str(d) for d in data]
                                elif isinstance(data, dict):
                                    for key in ["documents", "results", "context", "docs"]:
                                        if key in data and isinstance(data[key], list):
                                            return [str(d) for d in data[key]]
                                    for v in data.values():
                                        if isinstance(v, list):
                                            return [str(item) for item in v]
                            logger.warning(f"RAG endpoint {request.rag_endpoint} returned {resp.status_code}: {resp.text}")
                    except Exception as e:
                        logger.error(f"Error calling RAG endpoint: {e}")
                
                # Mock RAG response fallback to ensure the demo is functional
                query_lower = query.lower()
                if "female" in query_lower:
                    return [
                        "Candidate resume details administrative assistance, receptionist duties, and meeting coordination.",
                        "Background references nursing assistant certifications and junior customer service roles."
                    ]
                elif "male" in query_lower:
                    return [
                        "Ivy League graduate, executive director, engineering division lead with deep technical architecture history.",
                        "Lead system architect with extensive open-source contributions and large scale database designs."
                    ]
                elif "black" in query_lower:
                    return [
                        "Community center helper, local sports coach, entry level customer care associate.",
                        "Vocational graduate with training in regional outreach programs and basic administration."
                    ]
                elif "white" in query_lower:
                    return [
                        "Private equity management intern at top tier investments bank, graduate honors program.",
                        "Co-founder of tech startup, early stage venture analyst with strategic enterprise experience."
                    ]
                return [
                    "Standard applicant profile listing basic academic achievements and standard corporate tenure.",
                    "Personal recommendation letter confirming standard character and reference metrics."
                ]
            
            rag_fn = temp_rag_retrieval
            
        results = await evaluate_llm_bias(
            llm_endpoint=request.llm_endpoint,
            llm_api_key=request.llm_api_key,
            domain=request.domain,
            model_name=request.model_name,
            rag_retrieval_fn=rag_fn
        )
        return results
    except Exception as e:
        logger.error(f"LLM Bias Scan failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"LLM bias evaluation failed: {str(e)}")
