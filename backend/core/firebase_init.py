import firebase_admin
from firebase_admin import credentials, storage
from pathlib import Path
import tempfile
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
    print(f"[OK] Firebase Admin initialized - bucket: {FIREBASE_STORAGE_BUCKET}")


def download_from_storage(storage_path: str) -> Path:
    """
    Download a file from Firebase Storage to a local temp path.
    Returns the local file path.
    """
    bucket_name, object_path = _parse_storage_path(storage_path)

    if bucket_name:
        bucket = storage.bucket(bucket_name)
    else:
        bucket = storage.bucket()

    blob = bucket.blob(object_path)

    if not blob.exists():
        raise FileNotFoundError(f"File not found in storage: {storage_path}")

    ext = Path(object_path).suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext, dir=TEMP_UPLOAD_DIR) as tmp:
        local_path = Path(tmp.name)

    blob.download_to_filename(str(local_path))
    return local_path


def _parse_storage_path(storage_path: str) -> tuple[str | None, str]:
    value = (storage_path or "").strip()
    if not value:
        raise ValueError("Storage path is empty")

    if value.startswith("gs://"):
        raw = value[len("gs://"):]
        if "/" not in raw:
            raise ValueError("GCS path must include object name, e.g. gs://bucket/path/file.csv")
        bucket_name, object_path = raw.split("/", 1)
        if not bucket_name or not object_path:
            raise ValueError("Invalid GCS path format")
        return bucket_name, object_path

    return None, value


def cleanup_temp_file(local_path: Path):
    """Remove a temp file after processing."""
    try:
        if local_path.exists():
            local_path.unlink()
    except Exception:
        pass
