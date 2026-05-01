# Key Management

This doc explains where secrets live in this repo and how to rotate them for a public GitHub repository.

## Sources of truth

- Google Secret Manager: backend and worker runtime secrets (Gemini, Groq, bucket name).
- GitHub Actions secrets: frontend build-time public Firebase values and backend URL.
- Local dev only: backend/serviceAccountKey.json and .env files (never commit).
- Vertex AI: uses Cloud Run service account (no API key).

## Where each key is used

### Frontend (build-time)
- NEXT_PUBLIC_FIREBASE_API_KEY
- NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
- NEXT_PUBLIC_FIREBASE_PROJECT_ID
- NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
- NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
- NEXT_PUBLIC_FIREBASE_APP_ID

These are injected at build time from GitHub Actions secrets in .github/workflows/deploy-frontend.yml.
Local dev uses frontend/.env.local.

### Backend and worker (runtime)
- GEMINI_API_KEY
- GEMINI_BIAS_API_KEY
- GROQ_API_KEY
- FIREBASE_STORAGE_BUCKET

These are pulled from Google Secret Manager in .github/workflows/deploy-backend.yml and .github/workflows/deploy-worker.yml.
Local dev uses backend/.env.

### Firebase Admin (local only)
- backend/serviceAccountKey.json is used only for local dev.
- Cloud Run uses the service account attached to the service, not this file.

### Vertex AI
- No API key. Uses the Cloud Run service account IAM permissions.

## Rotation steps (UI only)

### 1) Gemini / Groq (Secret Manager)
1. GCP Console -> Secret Manager.
2. Open the secret (GEMINI_API_KEY, GEMINI_BIAS_API_KEY, GROQ_API_KEY).
3. Add new version, paste new value, save.
4. Re-deploy backend and worker (Cloud Run) so the new version is loaded.
5. Update backend/.env for local dev if you use it.

#### Re-deploy backend (Cloud Run service)
1. GCP Console -> Cloud Run.
2. Click service visionai-api.
3. Click Edit & deploy new revision.
4. Click Deploy.

#### Re-deploy worker (Cloud Run job)
1. GCP Console -> Cloud Run -> Jobs.
2. Click visionai-worker.
3. Click Edit -> Deploy (or Deploy new revision).

### 2) Firebase web API key (frontend)
Note: This is public by design but should be restricted.
1. Firebase Console -> Project settings -> General.
2. Click Manage API keys (opens Google Cloud API Keys).
3. Create a new key or rotate the existing one.
4. Set HTTP referrer restrictions to your domain(s).
5. Update GitHub Actions secrets:
   - FIREBASE_API_KEY
6. Re-deploy frontend (push to main).
7. Update frontend/.env.local for local dev.

### 3) Firebase Admin key (local only)
1. GCP Console -> IAM & Admin -> Service Accounts.
2. Open the service account used for Firebase Admin.
3. Keys -> Add key -> Create new key -> JSON.
4. Replace backend/serviceAccountKey.json.
5. Delete the old key in the console.

### 4) Vertex AI (Cloud Run service account)
1. Create a new service account (IAM & Admin -> Service Accounts).
2. Grant roles needed for Vertex AI.
3. Update Cloud Run service to use the new service account.

## Public repo safety checklist

- Never commit .env files or serviceAccountKey.json.
- Add .env* and **/serviceAccountKey.json to .gitignore.
- Rotate any key that was ever committed.
- Use Workload Identity Federation for GitHub Actions (no JSON key in GitHub).
