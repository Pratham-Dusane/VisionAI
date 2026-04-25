# VisionAI Backend

## Local Dev (Low Resource)

Use the included launcher:

```bash
python dev_server.py
```

This runs without autoreload by default to prevent high CPU/disk usage from file watchers.

Optional reload mode (only when actively editing backend code):

```bash
VISIONAI_BACKEND_RELOAD=1 python dev_server.py
```

Reload mode uses constrained watch paths and excludes heavy directories.

## Phase 10A Cloud Run Foundation

Phase 10A infrastructure files live in `../infra`:

- `../infra/cloudrun.yaml` - FastAPI Cloud Run service manifest
- `../infra/cloudrun-worker-job.yaml` - Cloud Run Job manifest
- `../infra/firestore.rules` - Firestore security rules
- `../infra/README.md` - detailed setup commands

Firebase Admin now uses `backend/serviceAccountKey.json` for local dev when present,
and Application Default Credentials on Cloud Run.

## One-command install from repo root

From the repository root, install Python dependencies with:

```bash
pip install -r requirements.txt
```

This root file delegates to `backend/requirements.txt` so the backend dependency list stays in one place.

## Phase 8 CI/CD Integration

This backend now supports a CI fairness gate endpoint:

- `POST /api/cicd/audit-gate`
- Auth: organization API key (`vai_live_...`)
- `200` with `status: PASS` when no gate violations are found
- `422` with `status: FAIL` and `violations` when fairness checks fail

### API Key management endpoints

- `POST /api/orgs/{org_id}/api-keys` (generate key)
- `GET /api/orgs/{org_id}/api-keys` (list keys)
- `DELETE /api/orgs/{org_id}/api-keys/{key_id}` (revoke key)

### Request payload

```json
{
  "api_key": "vai_live_xxxxx",
  "dataset_gcs_path": "gs://your-bucket/test_data.csv",
  "model_gcs_path": "gs://your-bucket/model.pkl",
  "context": {
    "domain": "hiring",
    "label_col": "hired",
    "positive_label": "1",
    "protected_cols": ["gender", "race"],
    "fairness_threshold": 0.8
  }
}
```

### Quick manual test

1. Generate API key:

```bash
curl -X POST "http://localhost:8000/api/orgs/<ORG_ID>/api-keys" \
  -H "Content-Type: application/json" \
  -d '{"label":"CI Key"}'
```

2. Call audit gate:

```bash
curl -X POST "http://localhost:8000/api/cicd/audit-gate" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "<PASTE_API_KEY>",
    "dataset_gcs_path": "gs://your-bucket/test_data.csv",
    "model_gcs_path": "gs://your-bucket/model.pkl",
    "context": {
      "domain": "hiring",
      "label_col": "hired",
      "positive_label": "1",
      "protected_cols": ["gender", "race"],
      "fairness_threshold": 0.8
    }
  }'
```

### CI example

Use the ready-to-copy workflow in `examples/github-action.yml`.

## Phase 9 Bias Drift Monitor

The backend now exposes drift-monitor APIs for periodic production batch checks.

### Endpoints

- `POST /api/drift/upload`
- `GET /api/drift/{org_id}`
- `GET /api/drift/{org_id}/notifications/count`

### Drift upload request

`POST /api/drift/upload` expects multipart form data:

- `orgId` (string, required)
- `file` (CSV/JSON/Parquet, required)
- `batchDate` (ISO date, required)
- `labelCol` (string, required)
- `positiveLabel` (string, required)
- `protectedCols` (JSON array string or comma-separated list, required)
- `notes` (string, optional)
- `auditId` (string, optional)
- `predictionCol` (string, optional; enables equalized odds computation)

### Example curl

```bash
curl -X POST "http://localhost:8000/api/drift/upload" \
  -F "orgId=org-1" \
  -F "batchDate=2026-04-19" \
  -F "labelCol=approved" \
  -F "positiveLabel=1" \
  -F "protectedCols=[\"gender\",\"race\"]" \
  -F "notes=April production batch" \
  -F "file=@loan_approval_dataset.csv"
```

### Storage behavior

- Uploaded batch is stored in Firebase Storage under `drift_uploads/{orgId}/...`
- Per-attribute drift rows are written to BigQuery table `visionai_analytics.drift_metrics` when BigQuery is configured
- Drift batch summary is always stored in Firestore `drift_batches`
- If latest worst DI drops below 0.8, a `DRIFT_ALERT` notification is written in Firestore
