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

# Firebase Storage bucket (from .env)
FIREBASE_STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET", "")

# Upload limits
MAX_FILE_SIZE_MB = 500
ALLOWED_DATASET_EXTENSIONS = {".csv", ".json", ".parquet"}
ALLOWED_MODEL_EXTENSIONS = {".pkl", ".onnx", ".joblib"}
