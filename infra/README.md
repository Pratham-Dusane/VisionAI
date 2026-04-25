# VisionAI Phase 10A Infrastructure

This folder contains the first deployable infrastructure layer from PRD Phase 10:

- `cloudrun.yaml`: FastAPI Cloud Run service manifest.
- `cloudrun-worker-job.yaml`: Cloud Run Job manifest for long-running/background work.
- `cloudbuild-worker.yaml`: Cloud Build config for the worker image.
- `firestore.rules`: Firestore security rules for org-scoped client access.

No command in this guide needs to be run by the app at runtime. These are one-time or deploy-time operator steps.

## 1. Set Local Variables

PowerShell:

```powershell
$PROJECT_ID="visionai-prod"
$REGION="asia-south1"
$BUCKET="visionai-uploads-visionai-prod"
$API_SA="visionai-api-sa@$PROJECT_ID.iam.gserviceaccount.com"
$WORKER_SA="visionai-worker-sa@$PROJECT_ID.iam.gserviceaccount.com"
```

## 2. Authenticate And Select Project

```powershell
gcloud auth login
gcloud config set project $PROJECT_ID
```

If the project does not exist yet:

```powershell
gcloud projects create $PROJECT_ID --name="VisionAI"
gcloud config set project $PROJECT_ID
```

## 3. Enable PRD Phase 10 APIs

```powershell
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable cloudtasks.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable firestore.googleapis.com
gcloud services enable aiplatform.googleapis.com
gcloud services enable bigquery.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable iam.googleapis.com
```

For the later weekly regulatory cron, also enable Cloud Scheduler:

```powershell
gcloud services enable cloudscheduler.googleapis.com
```

## 4. Create Service Accounts

```powershell
gcloud iam service-accounts create visionai-api-sa --display-name="VisionAI API"
gcloud iam service-accounts create visionai-worker-sa --display-name="VisionAI Worker"
```

## 5. Grant Runtime IAM

API service account:

```powershell
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$API_SA" --role="roles/datastore.user"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$API_SA" --role="roles/storage.objectAdmin"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$API_SA" --role="roles/aiplatform.user"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$API_SA" --role="roles/bigquery.dataEditor"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$API_SA" --role="roles/cloudtasks.enqueuer"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$API_SA" --role="roles/secretmanager.secretAccessor"
```

Worker service account:

```powershell
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$WORKER_SA" --role="roles/datastore.user"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$WORKER_SA" --role="roles/storage.objectAdmin"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$WORKER_SA" --role="roles/aiplatform.user"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$WORKER_SA" --role="roles/bigquery.dataEditor"
gcloud projects add-iam-policy-binding $PROJECT_ID --member="serviceAccount:$WORKER_SA" --role="roles/secretmanager.secretAccessor"
```

## 6. Create Storage Bucket

```powershell
gcloud storage buckets create "gs://$BUCKET" --location=$REGION --uniform-bucket-level-access
```

If the bucket already exists, skip this step.

## 7. Create Cloud Tasks Queue

```powershell
gcloud tasks queues create visionai-analysis-queue --location=$REGION
```

If the queue already exists, skip this step.

## 8. Create Firestore Database

Use Native mode:

```powershell
gcloud firestore databases create --database="(default)" --location=$REGION
```

If the default database already exists, skip this step.

Deploy rules:

```powershell
firebase deploy --only firestore:rules --project $PROJECT_ID
```

If you do not use Firebase CLI yet:

```powershell
npm install -g firebase-tools
firebase login
firebase use $PROJECT_ID
firebase deploy --only firestore:rules --project $PROJECT_ID
```

The repo already includes `firebase.json` pointing Firebase CLI to `infra/firestore.rules`.

## 9. Store Gemini Secret

```powershell
$GEMINI_API_KEY="paste-your-key-here"
$secretFile = New-TemporaryFile
Set-Content -Path $secretFile -Value $GEMINI_API_KEY -NoNewline
gcloud secrets create GEMINI_API_KEY --data-file=$secretFile
Remove-Item $secretFile
```

If the secret already exists:

```powershell
$secretFile = New-TemporaryFile
Set-Content -Path $secretFile -Value $GEMINI_API_KEY -NoNewline
gcloud secrets versions add GEMINI_API_KEY --data-file=$secretFile
Remove-Item $secretFile
```

## 10. Deploy FastAPI To Cloud Run

Deploy from backend source:

```powershell
gcloud run deploy visionai-api `
  --source ./backend `
  --region $REGION `
  --platform managed `
  --allow-unauthenticated `
  --service-account $API_SA `
  --set-env-vars "GCP_PROJECT_ID=$PROJECT_ID,GCP_REGION=$REGION,GCS_BUCKET_NAME=$BUCKET,FIRESTORE_DATABASE=(default),BIGQUERY_DATASET=visionai_analytics,VERTEX_AI_LOCATION=us-central1,GEMINI_MODEL=gemini-1.5-pro,CLOUD_TASKS_QUEUE=visionai-analysis-queue" `
  --update-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

## 11. Build And Deploy Worker Job

Build from repo root:

```powershell
gcloud builds submit . --config infra/cloudbuild-worker.yaml
```

Create or update the Cloud Run Job:

```powershell
gcloud run jobs replace infra/cloudrun-worker-job.yaml --region $REGION
```

Execute smoke job:

```powershell
gcloud run jobs execute visionai-worker --region $REGION --wait
```

Expected result in logs:

```text
[WORKER] infrastructure_smoke complete
```

## 12. Local Dev Environment

For local dev, keep using `backend/.env`:

```env
FIREBASE_STORAGE_BUCKET=your-firebase-storage-bucket
GCP_PROJECT_ID=visionai-prod
GEMINI_API_KEY=your-gemini-key
```

Local Firebase Admin uses `backend/serviceAccountKey.json` if it exists. Cloud Run does not need this file because it uses the runtime service account.
