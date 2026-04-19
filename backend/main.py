from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from core.firebase_init import initialize_firebase
from routers import uploads, audits, org_settings, benchmarks, cicd, drift

load_dotenv()

app = FastAPI(
    title="VisionAI API",
    description="Fairness Observability Platform - Backend API",
    version="0.1.0",
)

# CORS - allow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Firebase Admin on startup
@app.on_event("startup")
async def startup():
    initialize_firebase()

# Health check
@app.get("/")
async def health():
    return {"status": "ok", "service": "visionai-api"}

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
