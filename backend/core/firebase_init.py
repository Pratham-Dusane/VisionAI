import firebase_admin
from firebase_admin import credentials, storage
from pathlib import Path
import tempfile
import os
from core.config import SERVICE_ACCOUNT_PATH, FIREBASE_STORAGE_BUCKET, TEMP_UPLOAD_DIR


_initialized = False


def initialize_firebase():
    """Initialize Firebase Admin SDK with service account credentials."""
    global _initialized
    if _initialized:
        return

    if not SERVICE_ACCOUNT_PATH.exists():
        raise FileNotFoundError(
            f"Service account key not found at {SERVICE_ACCOUNT_PATH}. "
            "Download it from Firebase Console → Project Settings → Service accounts."
        )

    if not FIREBASE_STORAGE_BUCKET:
        raise ValueError(
            "FIREBASE_STORAGE_BUCKET not set in .env. "
            "Set it to your Firebase Storage bucket name (e.g., visionai-prod-xxx.firebasestorage.app)."
        )

    cred = credentials.Certificate(str(SERVICE_ACCOUNT_PATH))
    firebase_admin.initialize_app(cred, {
        "storageBucket": FIREBASE_STORAGE_BUCKET,
    })
    _initialized = True
    print(f"✓ Firebase Admin initialized — bucket: {FIREBASE_STORAGE_BUCKET}")


def download_from_storage(storage_path: str) -> Path:
    """
    Download a file from Firebase Storage to a local temp path.
    Returns the local file path.
    """
    bucket = storage.bucket()
    blob = bucket.blob(storage_path)

    if not blob.exists():
        raise FileNotFoundError(f"File not found in storage: {storage_path}")

    # Determine extension from storage path
    ext = Path(storage_path).suffix
    local_path = TEMP_UPLOAD_DIR / f"{blob.name.replace('/', '_')}"

    blob.download_to_filename(str(local_path))
    return local_path


def cleanup_temp_file(local_path: Path):
    """Remove a temp file after processing."""
    try:
        if local_path.exists():
            local_path.unlink()
    except Exception:
        pass
