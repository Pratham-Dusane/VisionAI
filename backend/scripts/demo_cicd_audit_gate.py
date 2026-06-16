"""
Demo script: call VisionAI CI/CD audit-gate endpoint with an example payload.

Usage (PowerShell):
  python backend/scripts/demo_cicd_audit_gate.py

Optional environment overrides:
  set CICD_API_BASE_URL=http://localhost:8000
  set CICD_API_KEY=vai_live_xxxxx
    set CICD_LABEL_COL=loan_approved
    set CICD_POSITIVE_LABEL=1
    set CICD_PROTECTED_COLS=gender,race
    set CICD_FAIRNESS_THRESHOLD=0.8
    set CICD_DOMAIN=lending
  set CICD_DATASET_GCS_PATH=gs://your-bucket/test_data.csv
  set CICD_MODEL_GCS_PATH=gs://your-bucket/model.pkl
    set CICD_LOCAL_DATASET_FILE=D:\\path\\to\\data.csv
    set CICD_LOCAL_MODEL_FILE=D:\\path\\to\\model.joblib
    set CICD_GCS_BUCKET=visionai-uploads-visionai-prod

Notes:
- If CICD_API_KEY is not set, the script uses a placeholder key and likely returns 401.
- This is intended for terminal demos: it prints request summary and full JSON response.
- If local file env vars are provided, files are uploaded first and resulting gs:// paths
    are used automatically.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import requests


def maybe_get_storage_client():
    try:
        from google.cloud import storage
    except Exception:
        return None
    return storage.Client()


def env(name: str, default: str) -> str:
    value = os.getenv(name)
    return value.strip() if value and value.strip() else default


def upload_local_file_to_gcs(local_file: str, bucket_name: str, object_prefix: str) -> str:
    client = maybe_get_storage_client()
    if client is None:
        raise RuntimeError(
            "google-cloud-storage is unavailable. Install dependencies from backend/requirements.txt."
        )

    path = Path(local_file)
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"Local file not found: {local_file}")

    object_name = f"{object_prefix.rstrip('/')}/{path.name}"
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(object_name)
    blob.upload_from_filename(str(path))
    return f"gs://{bucket_name}/{object_name}"


def resolve_gcs_paths() -> tuple[str, str]:
    dataset_gcs_path = env("CICD_DATASET_GCS_PATH", "")
    model_gcs_path = env("CICD_MODEL_GCS_PATH", "")

    local_dataset = env("CICD_LOCAL_DATASET_FILE", "D:\\VisionAI\\data to test\\normal_audit_test_audit_data.csv")
    local_model = env("CICD_LOCAL_MODEL_FILE", "D:\\VisionAI\\data to test\\normal_audit_test_audit_model.joblib")
    bucket_name = env("CICD_GCS_BUCKET", "visionai-uploads-visionai-prod")

    if local_dataset or local_model:
        if not bucket_name:
            raise ValueError("CICD_GCS_BUCKET is required when using local file upload env vars.")

        if local_dataset:
            dataset_gcs_path = upload_local_file_to_gcs(
                local_dataset,
                bucket_name,
                "cicd-demo/datasets",
            )

        if local_model:
            model_gcs_path = upload_local_file_to_gcs(
                local_model,
                bucket_name,
                "cicd-demo/models",
            )

    if not dataset_gcs_path:
        dataset_gcs_path = "gs://your-bucket/test_data.csv"

    if not model_gcs_path:
        model_gcs_path = ""

    return dataset_gcs_path, model_gcs_path


def build_payload() -> dict[str, Any]:
    api_key = env("CICD_API_KEY", "vai_live_AyJlXm9Nr4imhEQBx4l_ZUVw7PJsHqHD")
    dataset_gcs_path, model_gcs_path = resolve_gcs_paths()
    label_col = env("CICD_LABEL_COL", "loan_approved")
    positive_label = env("CICD_POSITIVE_LABEL", "1")
    protected_cols_raw = env("CICD_PROTECTED_COLS", "gender,race")
    fairness_threshold = float(env("CICD_FAIRNESS_THRESHOLD", "0.8"))
    domain = env("CICD_DOMAIN", "lending")

    protected_cols = [c.strip() for c in protected_cols_raw.split(",") if c.strip()]
    if not protected_cols:
        protected_cols = ["gender", "race"]

    payload: dict[str, Any] = {
        "api_key": api_key,
        "dataset_gcs_path": dataset_gcs_path,
        "context": {
            "domain": domain,
            "label_col": label_col,
            "positive_label": positive_label,
            "protected_cols": protected_cols,
            "fairness_threshold": fairness_threshold,
        },
    }

    if model_gcs_path:
        payload["model_gcs_path"] = model_gcs_path

    return payload


def main() -> int:
    base_url = env("CICD_API_BASE_URL", "http://localhost:8000")
    url = f"{base_url.rstrip('/')}/api/cicd/audit-gate"
    try:
        payload = build_payload()
    except Exception as exc:
        print(f"Failed to prepare payload: {exc}")
        return 1

    print("=== VisionAI CI/CD Audit Gate Demo ===")
    print(f"Endpoint: {url}")
    print(f"Dataset:  {payload['dataset_gcs_path']}")
    print(f"Model:    {payload.get('model_gcs_path', '<none>')}")
    print("Sending request...\n")

    try:
        response = requests.post(url, json=payload, timeout=120)
    except requests.RequestException as exc:
        print(f"Request failed: {exc}")
        return 1

    print(f"HTTP {response.status_code}")
    print("Response body:")

    try:
        body = response.json()
        print(json.dumps(body, indent=2, ensure_ascii=True))
    except ValueError:
        print(response.text)

    if response.ok:
        print("\nDemo call completed successfully.")
        return 0

    print("\nDemo call completed with non-2xx status.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
