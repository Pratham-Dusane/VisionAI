# VisionAI Deployment Guide

Complete deployment guide for VisionAI on Google Cloud Platform. This document covers all four services: the backend API, the frontend web application, the async worker, and the Sentinel real-time fairness proxy.

---

## Architecture Overview

All services run on Google Cloud:

| Service | Platform | Container Name |
| --- | --- | --- |
| Frontend | Cloud Run (Next.js) | `visionai-frontend` |
| Backend API | Cloud Run (FastAPI) | `visionai-api` |
| Worker | Cloud Run Jobs | `visionai-worker` |
| Sentinel Proxy | Cloud Run (per-org instance) | `visionai-sentinel-{sentinel_id}` |
| Sentinel Base Image | Artifact Registry | `visionai-sentinel:latest` |

Supporting infrastructure:

| Component | Service |
| --- | --- |
| Database | Firestore (Native mode) |
| File Storage | Cloud Storage |
| Authentication | Firebase Auth |
| Secrets | Secret Manager |
| Container Registry | Artifact Registry |
| Scheduled Jobs | Cloud Scheduler |
| CI/CD | GitHub Actions |
| AI/ML | Vertex AI / Gemini |
| Analytics (optional) | BigQuery |

CI/CD pipelines deploy automatically on push to the `main` branch.

---

## Prerequisites

Before starting deployment, confirm the following:

- A Google Cloud project with billing enabled (referred to as `YOUR_PROJECT_ID` throughout this guide)
- A GitHub repository containing the VisionAI source code
- A Firebase project linked to the same Google Cloud project
- The `gcloud` CLI installed locally or access to Cloud Shell
- A custom domain (optional, covered in Part 4)

---

## Part 1: Google Cloud Setup (One-Time)

### Step 1: Enable Required APIs

Navigate to Google Cloud Console, then APIs and Services, then Enable APIs. Enable the following:

1. Cloud Run API
2. Cloud Build API
3. Artifact Registry API
4. Secret Manager API
5. Cloud Scheduler API
6. Cloud Logging API
7. Firestore API (Native mode)
8. Cloud Storage API

Via Cloud Shell:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  logging.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com
```

---

### Step 2: Create Artifact Registry Repository

This stores Docker images for all four services.

Via UI:

1. Go to Artifact Registry, then Repositories, then Create Repository.
2. Name: `visionai`
3. Format: Docker
4. Location: `asia-south1` (Regional) or your preferred region
5. Encryption: Google-managed
6. Click Create.

Via Cloud Shell:

```bash
gcloud artifacts repositories create visionai \
  --repository-format=docker \
  --location=asia-south1 \
  --description="VisionAI Docker images"
```

---

### Step 3: Create Service Accounts

You need four service accounts for production deployment.

#### 3.1 API Service Account

This account runs the FastAPI backend and provisions Sentinel instances.

Via Cloud Shell:

```bash
gcloud iam service-accounts create visionai-api-sa \
  --display-name="VisionAI API Service Account"

for role in \
  roles/run.invoker \
  roles/run.developer \
  roles/run.admin \
  roles/datastore.user \
  roles/storage.objectViewer \
  roles/storage.objectCreator \
  roles/secretmanager.secretAccessor \
  roles/iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:visionai-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="$role"
done
```

Note: The API service account requires `roles/run.admin` and `roles/iam.serviceAccountUser` because the backend dynamically deploys new Cloud Run services when provisioning Sentinel proxy instances. Without these roles, Sentinel creation will fail.

#### 3.2 Worker Service Account

This account runs analysis and regulatory sync jobs.

```bash
gcloud iam service-accounts create visionai-worker-sa \
  --display-name="VisionAI Worker Service Account"

for role in \
  roles/run.invoker \
  roles/datastore.user \
  roles/storage.objectViewer \
  roles/storage.objectCreator \
  roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:visionai-worker-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="$role"
done
```

#### 3.3 Sentinel Service Account

This account runs each Sentinel proxy instance. It needs Firestore access for breaker state and rolling window storage.

```bash
gcloud iam service-accounts create visionai-sentinel-sa \
  --display-name="VisionAI Sentinel Service Account"

for role in \
  roles/datastore.user \
  roles/secretmanager.secretAccessor \
  roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:visionai-sentinel-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="$role"
done
```

#### 3.4 GitHub Actions Service Account

This account handles CI/CD deployments from GitHub.

```bash
gcloud iam service-accounts create github-actions-sa \
  --display-name="GitHub Actions Deployment"

for role in \
  roles/run.admin \
  roles/cloudbuild.builds.editor \
  roles/artifactregistry.writer \
  roles/iam.serviceAccountUser \
  roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:github-actions-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="$role"
done
```

#### 3.5 Create Service Account Key for GitHub

Via UI:

1. Go to IAM and Admin, then Service Accounts.
2. Click on `github-actions-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com`.
3. Go to the Keys tab, then Add Key, then Create new key.
4. Choose JSON format.
5. Click Create. A JSON file will download.
6. Save this file securely. You will add its contents to GitHub Secrets.

Via Cloud Shell:

```bash
gcloud iam service-accounts keys create ~/github-actions-key.json \
  --iam-account=github-actions-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com

cat ~/github-actions-key.json
```

Alternatively, you can use Workload Identity Federation instead of a downloaded key. The GitHub Actions workflows in this repository support both `GCP_SA_KEY` (JSON key) and `GCP_WIF_PROVIDER` / `GCP_WIF_SERVICE_ACCOUNT` (Workload Identity) authentication methods.

---

### Step 4: Store Secrets in Secret Manager

Store sensitive runtime values in Google Secret Manager.

```bash
echo -n "your-gemini-api-key" | \
  gcloud secrets create GEMINI_API_KEY --data-file=-

echo -n "your-project.firebasestorage.app" | \
  gcloud secrets create FIREBASE_STORAGE_BUCKET --data-file=-

echo -n "your-groq-api-key" | \
  gcloud secrets create GROQ_API_KEY --data-file=-
```

Required secrets:

| Secret Name | Description |
| --- | --- |
| `GEMINI_API_KEY` | API key for Vertex AI / Gemini narrative generation and Sentinel agent reasoning |
| `FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket name |
| `GROQ_API_KEY` | Groq API key for fallback LLM provider (optional) |

---

### Step 5: Create Firestore Database

If Firestore is not already provisioned:

```bash
gcloud firestore databases create \
  --location=asia-south1 \
  --type=firestore-native
```

Deploy security rules:

```bash
firebase deploy --only firestore:rules
```

The rules are defined in `infra/firestore.rules`. They enforce organization-scoped access for all data including audits, drift batches, notifications, attestation records, and Sentinel state.

---

### Step 6: Create Cloud Storage Bucket

```bash
gsutil mb -l asia-south1 gs://YOUR_PROJECT_ID-uploads
```

This bucket stores uploaded datasets, model files, and drift batch data.

---

## Part 2: GitHub Repository Setup

### Step 1: Add GitHub Secrets

Go to your GitHub repository, then Settings, then Secrets and variables, then Actions. Add these secrets:

| Secret Name | Value | Source |
| --- | --- | --- |
| `GCP_SA_KEY` | Contents of `github-actions-key.json` | Step 3.5 |
| `BACKEND_URL` | Backend Cloud Run URL (placeholder until first deploy) | Cloud Run console after first deploy |
| `FIREBASE_API_KEY` | Firebase web API key | Firebase Console, Project Settings |
| `FIREBASE_AUTH_DOMAIN` | `YOUR_PROJECT_ID.firebaseapp.com` | Firebase Console |
| `FIREBASE_PROJECT_ID` | `YOUR_PROJECT_ID` | Firebase Console |
| `FIREBASE_STORAGE_BUCKET` | `YOUR_PROJECT_ID.firebasestorage.app` | Firebase Console |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase sender ID | Firebase Console |
| `FIREBASE_APP_ID` | Firebase app ID | Firebase Console |

If using Workload Identity Federation instead of a JSON key, add these instead of `GCP_SA_KEY`:

| Secret Name | Value |
| --- | --- |
| `GCP_WIF_PROVIDER` | Workload Identity Provider resource name |
| `GCP_WIF_SERVICE_ACCOUNT` | Service account email for WIF |

### Step 2: Push Code to GitHub

```bash
git init
git add .
git commit -m "Initial commit with CI/CD setup"
git remote add origin https://github.com/your-org/visionai.git
git push -u origin main
```

This push triggers all four CI/CD workflows automatically.

---

## Part 3: First Deployment

### Step 1: Monitor GitHub Actions

1. Go to your GitHub repository.
2. Click the Actions tab.
3. You should see four workflows running:
   - Deploy Backend to Cloud Run
   - Deploy Frontend to Cloud Run
   - Deploy Worker to Cloud Run Jobs
   - Deploy Sentinel to Artifact Registry
4. Click each workflow to monitor progress.
5. Wait for all to complete with green checkmarks.

### Step 2: Get Service URLs

After deployment completes, retrieve your service URLs.

Via Cloud Shell:

```bash
# Backend URL
gcloud run services describe visionai-api \
  --region asia-south1 \
  --format 'value(status.url)'

# Frontend URL
gcloud run services describe visionai-frontend \
  --region asia-south1 \
  --format 'value(status.url)'
```

Or navigate to Cloud Run in the Google Cloud Console and click on each service to view its URL.

### Step 3: Update Frontend Environment

Now that you have the backend URL:

1. Go to GitHub, then Settings, then Secrets, then Actions.
2. Edit the `BACKEND_URL` secret.
3. Replace the placeholder with the actual backend URL (e.g., `https://visionai-api-abc123-uc.a.run.app`).
4. Save.

Trigger a frontend redeploy:

1. Go to Actions, then Deploy Frontend to Cloud Run, then Run workflow.

### Step 4: Update Backend CORS

The backend CORS configuration reads the `FRONTEND_URL` environment variable. Update the Cloud Run service:

```bash
gcloud run services update visionai-api \
  --region asia-south1 \
  --update-env-vars FRONTEND_URL=https://visionai-frontend-abc123-uc.a.run.app
```

Replace the URL with your actual frontend URL.

---

## Part 4: Sentinel Deployment Details

The Sentinel proxy has a unique deployment model. Unlike the other three services which are deployed once, Sentinel instances are created dynamically per organization.

### How Sentinel Provisioning Works

1. A user creates a Sentinel from the frontend dashboard (Sentinel page).
2. The frontend sends a POST request to `POST /api/sentinel/{org_id}` with the Sentinel configuration.
3. The backend builds a new Cloud Run service from the pre-built Sentinel base image in Artifact Registry.
4. The new Cloud Run service is configured with the organization's model endpoint, protected attributes, thresholds, and Gemini API key.
5. The backend stores the Sentinel metadata and Cloud Run URL in Firestore.
6. The frontend polls the Sentinel status and displays it on the dashboard.

### Sentinel Base Image

The Sentinel base image is built from `sentinel/Dockerfile` and pushed to Artifact Registry by the `deploy-sentinel.yml` workflow. This image must exist before any Sentinel can be provisioned.

To build and push manually:

```bash
cd sentinel

# Build the image
docker build -t asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/visionai/visionai-sentinel:latest .

# Push to Artifact Registry
gcloud auth configure-docker asia-south1-docker.pkg.dev
docker push asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/visionai/visionai-sentinel:latest
```

### Sentinel Cloud Run Configuration

Each Sentinel instance is deployed with these environment variables:

| Variable | Description |
| --- | --- |
| `SENTINEL_ID` | Unique identifier for this Sentinel |
| `ORG_ID` | Organization that owns this Sentinel |
| `MODEL_NAME` | Human-readable name of the proxied model |
| `TARGET_ENDPOINT` | URL of the actual model being monitored |
| `TARGET_AUTH_HEADER` | Bearer token for the target model (optional) |
| `PROTECTED_ATTRIBUTES` | Comma-separated list of demographic fields to monitor |
| `PREDICTION_FIELD` | Key in model response containing the prediction |
| `POSITIVE_PREDICTION_VALUE` | Value indicating a positive outcome (e.g., "approved") |
| `PRIVILEGED_GROUP_VALUES` | JSON mapping of protected attributes to privileged values |
| `ROLLING_WINDOW_SIZE` | Number of recent decisions in the sliding window (default: 1000) |
| `DI_THRESHOLD` | Disparate impact ratio below which the breaker trips (default: 0.8) |
| `BREAKER_MODE` | One of: `shadow`, `intercept`, `block_all` |
| `GEMINI_API_KEY` | API key for the autonomous fairness agent |
| `GCP_PROJECT_ID` | Google Cloud project for Firestore access |

### Sentinel Resource Limits

Default Cloud Run configuration for Sentinel instances:

```
CPU:    1 vCPU
Memory: 512Mi
Min instances: 0
Max instances: 5
Timeout: 300 seconds
Concurrency: 80
```

These values are set by the backend during provisioning. Adjust them in `backend/routers/sentinel.py` if your traffic volume requires different limits.

### Local Simulation Mode

When `gcloud` is not found on the system PATH (common in local development on Windows), the backend falls back to simulated mode. In this mode:

- No Cloud Run service is deployed.
- The backend provides simulated proxy endpoints at `/api/sentinel/{org_id}/{sentinel_id}/simulate/proxy`.
- Simulated decisions track disparate impact in-memory using the same rolling window algorithm.
- The Sentinel dashboard functions normally, displaying simulated traffic and breaker state.

This mode is automatically detected and requires no configuration.

---

## Part 5: Custom Domain Setup (Optional)

### Option A: Cloud Load Balancer (Recommended)

This approach maps your custom domain to both frontend and backend services through a single IP address with path-based routing.

#### Step 1: Reserve Static IP

```bash
gcloud compute addresses create visionai-ip --global
```

#### Step 2: Create Load Balancer

Via the Cloud Console:

1. Go to Network Services, then Load Balancing, then Create Load Balancer.
2. Choose Application Load Balancer (HTTP/HTTPS), Internet facing.
3. Configure backend services:
   - Create a backend service for the frontend (Cloud Run: `visionai-frontend`).
   - Create a backend service for the backend (Cloud Run: `visionai-api`).
4. Configure host and path rules:
   - `/api/*` routes to the backend service.
   - `/*` routes to the frontend service.
5. Configure the frontend:
   - Protocol: HTTPS
   - IP address: `visionai-ip`
   - Certificate: Create a Google-managed SSL certificate for your domain.
6. Click Create.

#### Step 3: Update DNS

In your domain registrar:

1. Add an A record:
   - Name: `@` (or `www`)
   - Type: A
   - Value: The IP address from `visionai-ip`
   - TTL: 3600
2. Wait for DNS propagation (5 to 60 minutes).
3. Your site will be available at `https://yourdomain.com`.

### Option B: Cloud Run Domain Mapping (Simpler)

Map domains directly to Cloud Run services:

```bash
gcloud run domain-mappings create \
  --service visionai-frontend \
  --domain yourdomain.com \
  --region asia-south1

gcloud run domain-mappings create \
  --service visionai-api \
  --domain api.yourdomain.com \
  --region asia-south1
```

Follow the DNS instructions provided by the command output.

---

## Part 6: Continuous Deployment

### How It Works

On push to the `main` branch:

1. GitHub Actions detects which paths changed.
2. The relevant workflow builds a Docker image from the service Dockerfile.
3. The image is pushed to Artifact Registry.
4. The Cloud Run service is updated with the new image.
5. Health checks validate the deployment.
6. Changes are live in approximately 5 to 10 minutes.

### Workflow Path Triggers

| Workflow | Trigger Paths |
| --- | --- |
| `deploy-backend.yml` | `backend/**` |
| `deploy-frontend.yml` | `frontend/**` |
| `deploy-worker.yml` | `worker/**` |
| `deploy-sentinel.yml` | `sentinel/**` |

### Manual Deployment

To trigger a deployment manually:

1. Go to GitHub, then Actions.
2. Select the desired workflow.
3. Click Run workflow, then Run workflow.

### Manual Cloud Run Deployment (Without GitHub Actions)

If you need to deploy directly without CI/CD:

Backend:

```bash
cd backend
gcloud builds submit --tag asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/visionai/visionai-api:latest .
gcloud run deploy visionai-api \
  --image asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/visionai/visionai-api:latest \
  --region asia-south1 \
  --service-account visionai-api-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest,FIREBASE_STORAGE_BUCKET=FIREBASE_STORAGE_BUCKET:latest" \
  --set-env-vars "GCP_PROJECT_ID=YOUR_PROJECT_ID,GCP_REGION=asia-south1,USE_CLOUD_RUN_JOBS=true,WORKER_JOB_NAME=visionai-worker"
```

Frontend:

```bash
cd frontend
gcloud builds submit --tag asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/visionai/visionai-frontend:latest .
gcloud run deploy visionai-frontend \
  --image asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/visionai/visionai-frontend:latest \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-env-vars "NEXT_PUBLIC_API_BASE_URL=https://your-backend-url.run.app"
```

Worker:

```bash
cd worker
gcloud builds submit --tag asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/visionai/visionai-worker:latest .
gcloud run jobs create visionai-worker \
  --image asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/visionai/visionai-worker:latest \
  --region asia-south1 \
  --service-account visionai-worker-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --set-env-vars "GCP_PROJECT_ID=YOUR_PROJECT_ID"
```

---

## Part 7: Cloud Scheduler Setup

The regulatory sync job runs on a weekly schedule to pull new AI regulations.

```bash
gcloud scheduler jobs create http visionai-regulatory-sync \
  --schedule="0 3 * * 1" \
  --uri="https://asia-south1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/YOUR_PROJECT_ID/jobs/visionai-worker:run" \
  --http-method=POST \
  --oauth-service-account-email=visionai-worker-sa@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --headers="Content-Type=application/json" \
  --message-body='{"overrides":{"containerOverrides":[{"env":[{"name":"VISIONAI_JOB_KIND","value":"regulatory_sync"}]}]}}' \
  --location=asia-south1
```

This runs every Monday at 03:00 UTC. Adjust the cron expression as needed.

---

## Part 8: Firestore Indexes

Some queries require composite indexes. Create them with:

```bash
gcloud firestore indexes composite create \
  --collection-group=audits \
  --field-config=field-path=orgId,order=ASCENDING \
  --field-config=field-path=created_at,order=DESCENDING

gcloud firestore indexes composite create \
  --collection-group=drift_batches \
  --field-config=field-path=org_id,order=ASCENDING \
  --field-config=field-path=uploaded_at,order=DESCENDING

gcloud firestore indexes composite create \
  --collection-group=notifications \
  --field-config=field-path=org_id,order=ASCENDING \
  --field-config=field-path=created_at,order=DESCENDING
```

---

## Part 9: Testing and Monitoring

### Health Checks

Backend:

```bash
curl https://your-backend-url.run.app/health
```

Expected response: `{"status":"ok","service":"visionai-api"}`

Frontend:

```bash
curl -s -o /dev/null -w "%{http_code}" https://your-frontend-url.run.app
```

Expected response: `200`

### View Logs

Via Cloud Console:

1. Go to Cloud Run, then Services, then click the service name.
2. Click the Logs tab.

Via Cloud Shell:

```bash
# Backend logs
gcloud run services logs read visionai-api --region asia-south1 --limit 50

# Frontend logs
gcloud run services logs read visionai-frontend --region asia-south1 --limit 50

# Worker logs
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=visionai-worker" --limit 50

# Sentinel instance logs (replace SENTINEL_ID with the actual ID)
gcloud run services logs read visionai-sentinel-SENTINEL_ID --region asia-south1 --limit 50
```

### Monitor Deployments

Via Cloud Console:

1. Go to Cloud Run, then Services, then click on the service.
2. View the Metrics tab for:
   - Request count
   - Request latency
   - Container CPU and memory usage
   - Error rate

### Sentinel-Specific Monitoring

Sentinel state is stored in Firestore under the `sentinels` collection. You can query breaker status:

```bash
# Check if any Sentinel breakers have tripped
gcloud firestore documents list \
  --collection-id=sentinels \
  --filter="breaker_state=TRIPPED"
```

Intercepted decisions are stored in `sentinel_review_queue` in Firestore and are visible from the Sentinel detail page in the frontend dashboard.

---

## Part 10: Troubleshooting

### Deployment Fails with "Permission Denied"

- Verify that `github-actions-sa` has all required roles listed in Step 3.4.
- Confirm that `GCP_SA_KEY` secret in GitHub contains the correct JSON key content.
- If using Workload Identity Federation, verify the provider and service account secrets.

### Health Check Fails After Deployment

- Check service logs for startup errors.
- Verify all Secret Manager secrets exist and are accessible by the service account.
- Confirm environment variables are set correctly on the Cloud Run service.

### Frontend Cannot Connect to Backend

- Update `BACKEND_URL` secret in GitHub with the correct backend Cloud Run URL.
- Redeploy the frontend.
- Verify that the backend `FRONTEND_URL` environment variable includes the frontend URL for CORS.

### Worker Job Fails

- Check worker logs: `gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=visionai-worker" --limit 50`
- Verify the worker service account has Firestore and Storage permissions.
- Confirm secrets are accessible.

### Sentinel Provisioning Fails

- Verify the Sentinel base image exists in Artifact Registry: `gcloud artifacts docker images list asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/visionai --filter="visionai-sentinel"`
- Confirm the API service account has `roles/run.admin` and `roles/iam.serviceAccountUser`.
- Check that the Sentinel service account (`visionai-sentinel-sa`) exists and has the required roles.
- Review backend logs for the provisioning request: `gcloud run services logs read visionai-api --region asia-south1 --limit 20`

### Sentinel Breaker Not Tripping

- Verify that at least `min_decisions_before_trip` decisions have been recorded (default: 50).
- Check that the protected attributes in the Sentinel config match the field names in the model request payload.
- Confirm the `prediction_field` and `positive_prediction_value` match the actual model response format.

### Sentinel Agent Not Running

- Verify the `GEMINI_API_KEY` is set as an environment variable on the Sentinel Cloud Run service.
- Check Sentinel logs for Gemini API errors.
- The autonomous agent runs every `evaluation_interval_seconds` (default: 30 seconds).

---

## Part 11: Cost Optimization

### Cloud Run Pricing

Free tier (per month):

- 2 million requests
- 360,000 GB-seconds of memory
- 180,000 vCPU-seconds

Estimated costs for moderate usage:

| Service | Estimated Monthly Cost |
| --- | --- |
| Frontend | $5 to $10 |
| Backend | $10 to $20 |
| Worker | $5 to $10 |
| Sentinel (per instance) | $3 to $8 |

Total: approximately $25 to $50 per month for moderate usage with one or two Sentinel instances.

### Optimization Tips

1. Set minimum instances to 0 for development and staging:

```bash
gcloud run services update visionai-api --min-instances 0 --region asia-south1
```

2. Use Cloud Scheduler to warm up services before expected peak hours.

3. Set Sentinel instances to min-instances 0 when not actively monitoring traffic.

4. Use Cloud CDN for static frontend assets if using the Load Balancer approach.

5. Enable request logging only for error-level events in production to reduce Cloud Logging costs.

---

## Deployment Checklist

Pre-deployment:

- [ ] Google Cloud APIs enabled (Step 1)
- [ ] Artifact Registry repository created (Step 2)
- [ ] Four service accounts created with correct roles (Step 3)
- [ ] Secrets stored in Secret Manager (Step 4)
- [ ] Firestore database provisioned and rules deployed (Step 5)
- [ ] Cloud Storage bucket created (Step 6)

CI/CD setup:

- [ ] GitHub secrets configured (Part 2, Step 1)
- [ ] Code pushed to GitHub `main` branch (Part 2, Step 2)

First deployment validation:

- [ ] All four workflows completed successfully (Part 3, Step 1)
- [ ] Backend health check passes (Part 9)
- [ ] Frontend loads correctly in browser
- [ ] `BACKEND_URL` secret updated with actual URL (Part 3, Step 3)
- [ ] Frontend redeployed with correct backend URL
- [ ] Backend CORS updated with frontend URL (Part 3, Step 4)
- [ ] Worker job tested with `infrastructure_smoke` kind

Sentinel validation:

- [ ] Sentinel base image exists in Artifact Registry
- [ ] Demo Sentinel created successfully from frontend
- [ ] Sentinel dashboard displays status and metrics
- [ ] Simulated traffic triggers DI monitoring

Post-deployment:

- [ ] Cloud Scheduler configured for regulatory sync (Part 7)
- [ ] Firestore indexes created (Part 8)
- [ ] Monitoring and logging verified (Part 9)
- [ ] Custom domain configured (Part 5, optional)

---

## Reference: Service Dockerfiles

| Service | Dockerfile Location | Build Context |
| --- | --- | --- |
| Backend | `backend/Dockerfile` | `backend/` |
| Frontend | `frontend/Dockerfile` | `frontend/` |
| Worker | `worker/Dockerfile` | `worker/` |
| Sentinel | `sentinel/Dockerfile` | `sentinel/` |

## Reference: GitHub Actions Workflows

| Workflow | File | Trigger |
| --- | --- | --- |
| Deploy Backend | `.github/workflows/deploy-backend.yml` | Push to `main` with changes in `backend/` |
| Deploy Frontend | `.github/workflows/deploy-frontend.yml` | Push to `main` with changes in `frontend/` |
| Deploy Worker | `.github/workflows/deploy-worker.yml` | Push to `main` with changes in `worker/` |
| Deploy Sentinel | `.github/workflows/deploy-sentinel.yml` | Push to `main` with changes in `sentinel/` |

All workflows also support manual dispatch via the GitHub Actions UI.

## Reference: Environment Variables

### Backend (Cloud Run)

| Variable | Required | Description |
| --- | --- | --- |
| `GCP_PROJECT_ID` | Yes | Google Cloud project ID |
| `GCP_REGION` | Yes | Deployment region (e.g., `asia-south1`) |
| `FRONTEND_URL` | Yes | Frontend URL for CORS |
| `GCS_BUCKET_NAME` | Yes | Cloud Storage bucket for uploads |
| `FIREBASE_STORAGE_BUCKET` | Yes | Firebase Storage bucket |
| `USE_CLOUD_RUN_JOBS` | Yes | Set to `true` in production |
| `WORKER_JOB_NAME` | Yes | Name of the worker Cloud Run Job |
| `GEMINI_API_KEY` | Yes | Gemini API key (via Secret Manager) |
| `GROQ_API_KEY` | No | Groq API key for fallback LLM |

### Frontend (Cloud Run)

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Yes | Backend API URL |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase web API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Firebase auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Yes | Firebase storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes | Firebase messaging sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes | Firebase app ID |

---

## Support

If you encounter issues:

1. Check GitHub Actions workflow logs for build and deploy errors.
2. Check Cloud Run service logs for runtime errors.
3. Verify all secrets and environment variables against this guide.
4. Review Firestore security rules if data access is denied.
5. For Sentinel issues, check both the backend logs (for provisioning) and the Sentinel service logs (for runtime behavior).

Useful console links:

- Google Cloud Console: https://console.cloud.google.com
- Cloud Run Services: https://console.cloud.google.com/run
- Artifact Registry: https://console.cloud.google.com/artifacts
- Secret Manager: https://console.cloud.google.com/security/secret-manager
- Firestore: https://console.cloud.google.com/firestore
