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
