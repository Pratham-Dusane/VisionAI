import os
import tempfile
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, storage

from core.config import FIREBASE_STORAGE_BUCKET, SERVICE_ACCOUNT_PATH, TEMP_UPLOAD_DIR


_initialized = False


def initialize_firebase():
    """Initialize Firebase Admin SDK.

    Local dev can use backend/serviceAccountKey.json. Cloud Run should use
    Application Default Credentials from its service account, matching PRD Phase 10.
    """
    global _initialized
    if _initialized:
        return

    try:
        firebase_admin.get_app()
        _initialized = True
        return
    except ValueError:
        pass

    if not FIREBASE_STORAGE_BUCKET:
        raise ValueError(
            "Storage bucket not set. Define FIREBASE_STORAGE_BUCKET for local dev "
            "or GCS_BUCKET_NAME for Cloud Run."
        )

    configured_key_path = (
        os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH")
        or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        or str(SERVICE_ACCOUNT_PATH)
    )
    key_path = Path(configured_key_path)
    options = {
        "storageBucket": FIREBASE_STORAGE_BUCKET,
    }

    if key_path.exists():
        cred = credentials.Certificate(str(key_path))
        firebase_admin.initialize_app(cred, options)
        auth_source = f"service account file: {key_path}"
    else:
        firebase_admin.initialize_app(options=options)
        auth_source = "Application Default Credentials"

    _initialized = True
    print(f"[OK] Firebase Admin initialized - bucket: {FIREBASE_STORAGE_BUCKET}; auth: {auth_source}")


def download_from_storage(storage_path: str) -> Path:
    """
    Download a file from Firebase Storage to a local temp path.
    Returns the local file path.
    """
    # Check if it exists locally first (for local testing/dev fallbacks)
    local_check = Path(storage_path)
    if local_check.is_absolute() and local_check.exists():
        ext = local_check.suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext, dir=TEMP_UPLOAD_DIR) as tmp:
            local_path = Path(tmp.name)
        import shutil
        shutil.copy2(local_check, local_path)
        return local_path

    # Check if relative to TEMP_UPLOAD_DIR or if only the filename was specified
    name_check = TEMP_UPLOAD_DIR / Path(storage_path).name
    if name_check.exists():
        ext = name_check.suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext, dir=TEMP_UPLOAD_DIR) as tmp:
            local_path = Path(tmp.name)
        import shutil
        shutil.copy2(name_check, local_path)
        return local_path

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
