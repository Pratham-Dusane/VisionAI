from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from core.firebase_init import initialize_firebase
from routers import uploads, audits

load_dotenv()

app = FastAPI(
    title="VisionAI API",
    description="Fairness Observability Platform — Backend API",
    version="0.1.0",
)

# CORS — allow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
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

# Routers
app.include_router(uploads.router, prefix="/api/uploads", tags=["uploads"])
app.include_router(audits.router, prefix="/api/audits", tags=["audits"])
