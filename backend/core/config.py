import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
SERVICE_ACCOUNT_PATH = BASE_DIR / "serviceAccountKey.json"
TEMP_UPLOAD_DIR = BASE_DIR / "temp_uploads"

# Ensure temp dir exists
TEMP_UPLOAD_DIR.mkdir(exist_ok=True)

# Firebase/GCS Storage bucket.
# Local dev historically used FIREBASE_STORAGE_BUCKET; Phase 10 Cloud Run deploys
# use GCS_BUCKET_NAME from Secret Manager/env injection.
FIREBASE_STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET") or os.getenv("GCS_BUCKET_NAME", "")

# GCP Project ID for Vertex AI (from .env)
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "")

# Upload limits
MAX_FILE_SIZE_MB = 500
ALLOWED_DATASET_EXTENSIONS = {".csv", ".json", ".parquet"}
ALLOWED_MODEL_EXTENSIONS = {".pkl", ".onnx", ".joblib", ".tflite"}
