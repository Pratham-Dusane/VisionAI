import requests
import json

# ==========================================
# CONFIGURATION - EDIT THESE VALUES
# ==========================================
API_KEY = "vai_live_c3cL-vAkQON9L92iFXt301-wgcw5vVkw"
DATASET_GCS_PATH = "gs://visionai-prod-aea95.firebasestorage.app/uploads/fzeqCVdHwOQDwDPhczid/datasets/1777085087358_test_audit_data.csv"
MODEL_GCS_PATH = "gs://visionai-prod-aea95.firebasestorage.app/uploads/fzeqCVdHwOQDwDPhczid/models/1777085286117_test_audit_model.joblib"  # Optional: e.g., "gs://.../model.joblib"

# The endpoint you are testing
# If deployed to Cloud Run, replace with your actual URL, e.g. https://visionai-api-xyz.a.run.app/api/cicd/audit-gate
API_URL = "https://visionai-api-erl4rijula-el.a.run.app/api/cicd/audit-gate"

# ==========================================

payload = {
    "api_key": API_KEY, 
    "dataset_gcs_path": DATASET_GCS_PATH,
    "context": {
        "domain": "Financial Lending",
        "label_col": "loan_approved",  # Fixed column name based on the dataset
        "positive_label": "1",         
        "protected_cols": ["gender", "race"], 
        "fairness_threshold": 0.8
    }
}

# Add model path if provided
if MODEL_GCS_PATH:
    payload["model_gcs_path"] = MODEL_GCS_PATH

print(f"Sending POST request to {API_URL}...")
print(f"Dataset: {DATASET_GCS_PATH}")
if MODEL_GCS_PATH:
    print(f"Model: {MODEL_GCS_PATH}")

try:
    response = requests.post(API_URL, json=payload)
    print(f"\nStatus Code: {response.status_code}")
    print("Response JSON:")
    print(json.dumps(response.json(), indent=2))
except Exception as e:
    print(f"Error calling API: {e}\n(Make sure the backend is running with 'uvicorn main:app --reload')")

