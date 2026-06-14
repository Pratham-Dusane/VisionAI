from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from core.firebase_init import initialize_firebase
from routers import uploads, audits, org_settings, benchmarks, cicd, drift, whatif, causal, pipeline, llm_bias, quantization, transfer, feature_stores, attestation, sentinel

import os

load_dotenv()

# Determine CORS origins based on environment
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]

# Add production frontend URL if in production
if os.getenv("FRONTEND_URL"):
    CORS_ORIGINS.append(os.getenv("FRONTEND_URL"))

app = FastAPI(
    title="VisionAI API",
    description="Fairness Observability Platform - Backend API",
    version="0.1.0",
)

# CORS - allow frontend (local and production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Firebase Admin on startup
@app.on_event("startup")
async def startup():
    initialize_firebase()

# Health check endpoints
@app.get("/")
async def root():
    return {"status": "ok", "service": "visionai-api", "version": "v1.0.2_shadow_fix"}

@app.get("/health")
async def health():
    return {"status": "ok", "service": "visionai-api", "version": "v1.0.2_shadow_fix"}

# Debug endpoint - test binner directly
@app.get("/api/debug/binner")
async def debug_binner():
    import pandas as pd
    from services.preprocessing.auto_binner import auto_bin_protected_columns
    # Create test data inline
    data = {
        "age": [25, 34, 45, 52, 29, 61, 39],
        "annual_income": [45000, 82000, 96000, 120000, 54000, 88000, 67000],
        "credit_score": [620, 710, 730, 780, 650, 720, 690],
        "zip_code": [48201, 10001, 60601, 94105, 30301, 85001, 33101],
        "gender": ["Male", "Female", "Female", "Male", "Male", "Female", "Male"],
        "race": ["White", "Asian", "Hispanic", "White", "Black", "Hispanic", "Asian"],
        "loan_approved": [0, 1, 1, 1, 1, 1, 1],
    }
    df = pd.DataFrame(data)
    protected = ["age", "annual_income", "credit_score", "zip_code", "gender", "race"]
    
    before = {col: [int(x) if isinstance(x, (int, float)) or hasattr(x, 'item') else str(x) for x in df[col].unique()] for col in protected}
    df2, report = auto_bin_protected_columns(df, protected)
    after = {col: [str(x) for x in df2[col].unique()] for col in protected}
    
    return {
        "before": before,
        "after": after,
        "report": report,
    }

# Routers
app.include_router(uploads.router, prefix="/api/uploads", tags=["uploads"])
app.include_router(audits.router, prefix="/api/audits", tags=["audits"])
app.include_router(org_settings.router, prefix="/api/orgs", tags=["org-settings"])
app.include_router(benchmarks.router, prefix="/api/benchmarks", tags=["benchmarks"])
app.include_router(cicd.router, prefix="/api/cicd", tags=["cicd"])
app.include_router(drift.router, prefix="/api/drift", tags=["drift"])
app.include_router(whatif.router, prefix="/api/audits", tags=["whatif"])
app.include_router(causal.router, prefix="/api/audits", tags=["causal"])
app.include_router(pipeline.router, prefix="/api/pipelines", tags=["pipelines"])
app.include_router(llm_bias.router, prefix="/api/audits", tags=["llm-bias"])
app.include_router(quantization.router, prefix="/api/quantization", tags=["quantization"])
app.include_router(transfer.router, prefix="/api/transfer-bias", tags=["transfer-bias"])
app.include_router(feature_stores.router, prefix="/api/feature-stores", tags=["feature-stores"])
app.include_router(attestation.router, prefix="/api/attestation", tags=["attestation"])
app.include_router(sentinel.router)

# Mock endpoints for LLM and RAG simulator testing
from pydantic import BaseModel

class MockRAGRequest(BaseModel):
    query: str

@app.post("/api/mock-rag")
async def mock_rag_endpoint(request: MockRAGRequest):
    query_lower = request.query.lower()
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

class MockLLMRequest(BaseModel):
    prompt: str
    max_tokens: int = 200

@app.post("/api/mock-llm")
async def mock_llm_endpoint(request: MockLLMRequest):
    from services.analysis.llm_bias_evaluator import generate_mock_llm_response
    domain = "generic"
    prompt_lower = request.prompt.lower()
    if any(x in prompt_lower for x in ["interview", "hiring", "engineering", "candidate"]):
        domain = "hiring"
    elif any(x in prompt_lower for x in ["credit", "loan", "creditworthiness"]):
        domain = "lending"
    elif any(x in prompt_lower for x in ["patient", "treatment", "healthcare", "priority"]):
        domain = "healthcare"
        
    text = generate_mock_llm_response(request.prompt, domain)
    return {"text": text}

@app.post("/api/mock-predict")
async def mock_predict(data: dict):
    """
    Mock model endpoint for Sentinel demo.
    Returns biased predictions for 'gender': 'Female' to trip the breaker.
    """
    import random
    gender = data.get("gender")
    if not gender and "applicant" in data:
        gender = data["applicant"].get("gender")
    
    # Intentionally skew predictions to demonstrate Disparate Impact violation:
    # Female selection rate: ~30%, Male selection rate: ~90%
    if gender == "Female":
        prediction = "approved" if random.random() < 0.3 else "denied"
    elif gender == "Male":
        prediction = "approved" if random.random() < 0.9 else "denied"
    else:
        prediction = "approved" if random.random() < 0.7 else "denied"
        
    return {"prediction": prediction}
