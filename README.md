# VisionAI

VisionAI is an AI fairness observability platform for teams that need to inspect, explain, and operationalize bias analysis across datasets and deployed models.

This repository contains the full product surface:

- A Next.js frontend for audit creation, dashboards, explainability, drift monitoring, and settings
- A FastAPI backend for preprocessing, analysis orchestration, exports, benchmarking, and CI/CD fairness checks
- A Cloud Run worker for heavy analysis and regulatory sync jobs
- A Python SDK for local and embedded fairness analysis workflows
- Infrastructure manifests for Google Cloud and Firebase deployment

## What VisionAI Does

VisionAI helps organizations evaluate fairness risk across the full ML lifecycle:

- Scan datasets for disparate impact, statistical parity difference, and label skew
- Evaluate model behavior through counterfactual perturbation, equalized odds, and flip sensitivity
- Detect proxies, feature laundering, intersectional harms, blind spots, and historical harm
- Generate explainability output, stakeholder narratives, and legal/compliance mappings
- Monitor production drift and fairness degradation over time
- Provide CI/CD gating through a lightweight fairness endpoint

## Repository Layout

| Path | Purpose |
| --- | --- |
| `frontend/` | Customer-facing web application built with Next.js |
| `backend/` | FastAPI service, analysis routers, and server-side orchestration |
| `worker/` | Cloud Run Job entrypoint for analysis and regulatory sync |
| `visionai-sdk/` | Python package for local fairness analysis workflows |
| `infra/` | Cloud Run, Firestore, and deployment manifests |
| `examples/` | Reusable CI/CD examples |
| `data to test/` | Local sample datasets and models |

## Product Capabilities

| Capability | Description |
| --- | --- |
| Audit launch | Upload a dataset and optional model, define protected columns, and run an audit asynchronously |
| Data analysis | Parse schema, auto-bin protected attributes, detect proxies, and profile group distributions |
| Model analysis | Evaluate counterfactual bias, equalized odds, and prediction stability |
| Explainability | Produce SHAP-based and narrative explanations for stakeholders |
| Explain My Rejection | Return a public, org-controlled explanation for a specific decision row |
| Drift monitoring | Record production batches, compute fairness drift, and trigger alerts |
| Sector benchmarking | Compare fairness performance against opted-in peers |
| CI/CD gating | Block deployments when fairness thresholds are violated |
| Regulatory sync | Monitor and store new AI regulations and compliance alerts |

## Architecture Summary

The runtime architecture is intentionally modular:

- The frontend uploads files directly to Firebase/Google Cloud Storage and then sends storage paths to the backend
- The backend stores audit state in Firestore and dispatches long-running work to the Cloud Run worker
- The worker runs the full analysis pipeline, writes results back to Firestore, and uses Gemini-backed services for narrative and regulatory workflows
- The Python SDK mirrors the same analytical building blocks for local and embedded usage

## Local Development

### Prerequisites

- Python 3.11 or newer
- Node.js 20 or newer
- npm
- A Firebase / Google Cloud project with Storage and Firestore enabled
- A Gemini API key for narrative and regulatory features if you want AI-backed outputs locally

### 1) Install Backend Dependencies

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

The root `requirements.txt` delegates to `backend/requirements.txt`, so one install covers the backend and worker runtime dependencies.

### 2) Install Frontend Dependencies

```powershell
cd frontend
npm install
```

### 3) Configure the Backend

Create `backend/.env` with values similar to the following:

```env
GCP_PROJECT_ID=your-gcp-project-id
GCP_REGION=asia-south1
FRONTEND_URL=http://localhost:3000
GCS_BUCKET_NAME=your-storage-bucket
FIREBASE_STORAGE_BUCKET=your-storage-bucket
USE_CLOUD_RUN_JOBS=false
WORKER_JOB_NAME=visionai-worker
GEMINI_API_KEY=your-gemini-api-key
GROQ_API_KEY=your-groq-api-key
```

Notes:

- The backend uses Firebase Admin on startup
- For local development, it can use `backend/serviceAccountKey.json` if present, or `GOOGLE_APPLICATION_CREDENTIALS`
- In production, Cloud Run should use its runtime service account and secret injection instead of a checked-in key file

### 4) Configure the Frontend

Create `frontend/.env.local` with values similar to the following:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

Only the public Firebase configuration and backend base URL belong in the client environment.

### 5) Run the Backend

From `backend/`:

```powershell
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The API exposes a health check at `/health`.

### 6) Run the Frontend

From `frontend/`:

```powershell
npm run dev
```

Open `http://localhost:3000` in your browser.

### 7) Optional Worker Smoke Test

The worker can be run locally for infrastructure smoke validation:

```powershell
cd worker
$env:VISIONAI_JOB_KIND="infrastructure_smoke"
python job.py
```

Other job kinds are available for production workflows:

- `analysis`
- `regulatory_sync`
- `infrastructure_smoke`

## Google Integration

VisionAI is designed around Google Cloud and Firebase services.

| Service | How VisionAI Uses It |
| --- | --- |
| Firebase Auth | User authentication in the frontend |
| Firestore | Organizations, audits, drift batches, notifications, benchmarks, API keys, regulations, and system state |
| Cloud Storage | Dataset, model, and drift batch uploads |
| Cloud Run | Hosts the FastAPI backend |
| Cloud Run Jobs | Executes heavy analysis and regulatory sync workloads |
| Cloud Scheduler | Triggers weekly regulatory sync jobs |
| Vertex AI / Gemini | Narrative generation, blind spot detection, justified bias classification, and regulatory research |
| Groq | Fallback provider for chat responses |
| BigQuery | Optional analytics sink for benchmarking and drift metrics |
| Secret Manager | Production secret storage for API keys and runtime credentials |
| Cloud Build / Artifact Registry | Container build and image distribution |

### Google Runtime Model

- The frontend reads public Firebase configuration and calls the backend API
- The backend uses Firebase Admin and Google Cloud credentials to read and write project data
- The worker consumes the same project data and runs long-lived computations outside the web request path
- Regulatory sync and audit analysis are both isolated as jobs so user-facing requests stay responsive

## Security and Privacy

Security and privacy are first-class design constraints in VisionAI.

- Access is organization-scoped through Firestore rules and org membership checks
- API keys are hashed at rest; the raw CI/CD key is only revealed once at creation time
- Uploaded files are stored in Cloud Storage and referenced by path rather than copied through the browser or embedded in the UI
- Sensitive analysis is performed server-side; the browser only sends configuration and storage references
- Temporary local files are cleaned up after processing in backend and worker flows
- Public collection access is limited; regulations and system metadata are read-only for authenticated users
- Production secrets are intended to live in Secret Manager or runtime environment injection, not in client code
- Org settings control exposure for features such as Explain My Rejection and Shadow Testing

Recommended operational practices:

- Do not commit service account files or API keys
- Use least-privilege service accounts for Cloud Run and Cloud Run Jobs
- Rotate CI/CD API keys when a pipeline no longer needs access
- Keep client-side environment variables limited to non-sensitive public values

## Python SDK

The Python SDK provides a local-first way to run the core fairness analysis engine outside the web product.

Install it from this repository in editable mode:

```powershell
pip install -e visionai-sdk
```

Or install the published package if you are using the release build:

```powershell
pip install visionai-fairness
```

Example usage:

```python
from visionai import FairnessAudit

audit = FairnessAudit(
    data="loan_data.csv",
    label_col="approved",
    positive_label="1",
    protected_cols=["gender", "race"],
    model="model.joblib",
    domain="Financial Lending",
)

results = audit.run()
print(results.fairness_score)
print(results.letter_grade)
results.to_json("audit_report.json")
```

The SDK mirrors the same analytical primitives used by the product backend, including:

- Schema parsing
- Proxy detection
- Data profiling
- Data bias scanning
- Model bias evaluation
- Intersectional audit
- Feature laundering detection
- Flip sensitivity
- Shadow testing
- Regulation mapping
- Severity scoring
- Advanced simulator and red-team utilities

Use the SDK when you want:

- Offline analysis in notebooks or internal scripts
- Pre-merge fairness checks in CI pipelines
- Batch evaluation on local files or pandas DataFrames
- A direct programmatic interface to the same fairness methodology used by the SaaS product

## CI/CD Fairness Gate

VisionAI exposes a lightweight fairness gate for deployment workflows.

### Endpoint

`POST /api/cicd/audit-gate`

The request requires an organization API key and a dataset path in Cloud Storage.

Example:

```bash
curl -X POST "http://localhost:8000/api/cicd/audit-gate" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "vai_live_xxxxxxxxxxxxx",
    "dataset_gcs_path": "gs://your-bucket/test_data.csv",
    "model_gcs_path": "gs://your-bucket/model.joblib",
    "context": {
      "domain": "hiring",
      "label_col": "hired",
      "positive_label": "1",
      "protected_cols": ["gender", "race"],
      "fairness_threshold": 0.8
    }
  }'
```

Behavior:

- Returns `200` with `status: PASS` when no fairness violations are detected
- Returns `422` with `status: FAIL` and a violations list when fairness checks fail

### Supporting Org API Key Endpoints

- `POST /api/orgs/{org_id}/api-keys` creates a CI/CD API key
- `GET /api/orgs/{org_id}/api-keys` lists active and revoked keys
- `DELETE /api/orgs/{org_id}/api-keys/{key_id}` revokes a key

## Core API Surface

The frontend and operational workflows rely on these backend routes:

| Domain | Endpoints |
| --- | --- |
| Audit workflow | `POST /api/audits`, `GET /api/audits/{audit_id}`, `GET /api/audits/{audit_id}/pareto` |
| Audit exports | `GET /api/audits/{audit_id}/export/pdf`, `GET /api/audits/{audit_id}/export/legal`, `GET /api/audits/{audit_id}/export/anon` |
| Audit interactions | `GET /api/audits/{audit_id}/sample-row`, `POST /api/audits/{audit_id}/predict`, `POST /api/audits/{audit_id}/minimum-flip`, `POST /api/audits/{audit_id}/red-team`, `POST /api/audits/{audit_id}/shadow-test`, `GET /api/audits/{audit_id}/explain/{row_index}` |
| Upload preprocessing | `POST /api/uploads/dataset`, `POST /api/uploads/preprocess` |
| Organization settings | `GET /api/orgs/{org_id}/settings`, `PUT /api/orgs/{org_id}/settings` |
| Benchmarks | `GET /api/benchmarks/{domain}` |
| Drift monitoring | `POST /api/drift/upload`, `GET /api/drift/{org_id}`, `GET /api/drift/{org_id}/notifications`, `GET /api/drift/{org_id}/notifications/count` |

## Deployment Notes

Production deployment uses the Google Cloud stack defined in `infra/` and described in `DEPLOYMENT_GUIDE.md`.

- Backend API runs on Cloud Run
- Heavy analysis and regulatory sync run in Cloud Run Jobs
- The worker image is built from `worker/Dockerfile` via Cloud Build
- Firestore rules are defined in `infra/firestore.rules`
- The frontend is deployed separately as a Next.js service

For deployment-specific commands and IAM setup, see:

- `infra/README.md`
- `DEPLOYMENT_GUIDE.md`
- `backend/README.md`
- `frontend/README.md`
- `visionai-sdk/README.md`

## Support and Operating Model

VisionAI is structured so the web app, worker, and SDK can evolve independently while sharing the same fairness methodology.

- The frontend is optimized for guided product workflows
- The backend provides stable API boundaries for the UI and automation
- The worker isolates long-running compute from request/response latency
- The SDK enables internal teams to reuse the analysis stack directly in Python
