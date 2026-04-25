# VisionAI Deployment Guide
## Complete CI/CD Setup with Google Cloud Run + Custom Domain

---

## 🏗️ Architecture Overview

**All services hosted on Google Cloud:**
- **Frontend**: Cloud Run (Next.js) → `visionai-frontend`
- **Backend API**: Cloud Run (FastAPI) → `visionai-api`
- **Worker**: Cloud Run Jobs → `visionai-worker`
- **Custom Domain**: Cloud Load Balancer → `yourdomain.com`

**CI/CD**: GitHub Actions automatically deploys on push to `main` branch

---

## 📋 Prerequisites

Before starting, ensure you have:
- ✅ Google Cloud Project: `visionai-prod-aea95`
- ✅ GitHub repository with your code
- ✅ Custom domain (optional, for later)
- ✅ Firebase project configured

---

## 🚀 Part 1: Google Cloud Setup (One-Time)

### Step 1: Enable Required APIs

Go to **Google Cloud Console** → **APIs & Services** → **Enable APIs**

Enable these APIs:
1. Cloud Run API
2. Cloud Build API
3. Artifact Registry API
4. Secret Manager API
5. Cloud Scheduler API (for regulatory sync)
6. Cloud Logging API

**Or via Cloud Shell:**
```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  logging.googleapis.com
```

---

### Step 2: Create Artifact Registry Repository

This stores your Docker images.

**Via UI:**
1. Go to **Artifact Registry** → **Repositories** → **Create Repository**
2. **Name**: `visionai`
3. **Format**: Docker
4. **Location**: `asia-south1` (Regional)
5. **Encryption**: Google-managed
6. Click **Create**

**Or via Cloud Shell:**
```bash
gcloud artifacts repositories create visionai \
  --repository-format=docker \
  --location=asia-south1 \
  --description="VisionAI Docker images"
```

---

### Step 3: Create Service Accounts

You need 3 service accounts:

#### 3.1 API Service Account

**Via UI:**
1. Go to **IAM & Admin** → **Service Accounts** → **Create Service Account**
2. **Name**: `visionai-api-sa`
3. **ID**: `visionai-api-sa`
4. Click **Create and Continue**
5. **Grant roles**:
   - Cloud Run Invoker
   - Cloud Run Developer
   - Firestore User
   - Storage Object Viewer
   - Secret Manager Secret Accessor
6. Click **Done**

**Or via Cloud Shell:**
```bash
gcloud iam service-accounts create visionai-api-sa \
  --display-name="VisionAI API Service Account"

gcloud projects add-iam-policy-binding visionai-prod-aea95 \
  --member="serviceAccount:visionai-api-sa@visionai-prod-aea95.iam.gserviceaccount.com" \
  --role="roles/run.invoker"

gcloud projects add-iam-policy-binding visionai-prod-aea95 \
  --member="serviceAccount:visionai-api-sa@visionai-prod-aea95.iam.gserviceaccount.com" \
  --role="roles/run.developer"

gcloud projects add-iam-policy-binding visionai-prod-aea95 \
  --member="serviceAccount:visionai-api-sa@visionai-prod-aea95.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding visionai-prod-aea95 \
  --member="serviceAccount:visionai-api-sa@visionai-prod-aea95.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"

gcloud projects add-iam-policy-binding visionai-prod-aea95 \
  --member="serviceAccount:visionai-api-sa@visionai-prod-aea95.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### 3.2 Worker Service Account

Repeat the same process for `visionai-worker-sa` with the same roles.

**Via Cloud Shell:**
```bash
gcloud iam service-accounts create visionai-worker-sa \
  --display-name="VisionAI Worker Service Account"

# Grant same roles as API service account
for role in roles/run.invoker roles/run.developer roles/datastore.user roles/storage.objectViewer roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding visionai-prod-aea95 \
    --member="serviceAccount:visionai-worker-sa@visionai-prod-aea95.iam.gserviceaccount.com" \
    --role="$role"
done
```

#### 3.3 GitHub Actions Service Account

This is for CI/CD to deploy from GitHub.

**Via UI:**
1. Create service account: `github-actions-sa`
2. **Grant roles**:
   - Cloud Run Admin
   - Cloud Build Editor
   - Artifact Registry Writer
   - Service Account User
   - Secret Manager Secret Accessor

**Via Cloud Shell:**
```bash
gcloud iam service-accounts create github-actions-sa \
  --display-name="GitHub Actions Deployment"

for role in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.writer roles/iam.serviceAccountUser roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding visionai-prod-aea95 \
    --member="serviceAccount:github-actions-sa@visionai-prod-aea95.iam.gserviceaccount.com" \
    --role="$role"
done
```

#### 3.4 Create Service Account Key for GitHub

**Via UI:**
1. Go to **IAM & Admin** → **Service Accounts**
2. Click on `github-actions-sa@visionai-prod-aea95.iam.gserviceaccount.com`
3. Go to **Keys** tab → **Add Key** → **Create new key**
4. Choose **JSON** format
5. Click **Create** - a JSON file will download
6. **Save this file securely** - you'll add it to GitHub Secrets

**Or via Cloud Shell:**
```bash
gcloud iam service-accounts keys create ~/github-actions-key.json \
  --iam-account=github-actions-sa@visionai-prod-aea95.iam.gserviceaccount.com

# Download the file to your local machine
# You'll need to copy its contents
cat ~/github-actions-key.json
```

---

### Step 4: Store Secrets in Secret Manager

Store sensitive values in Google Secret Manager.

**Via UI:**
1. Go to **Secret Manager** → **Create Secret**
2. Create these secrets:

| Secret Name | Value |
|-------------|-------|
| `GEMINI_API_KEY` | `AIzaSyDtKqhQjOkvLnJaZLMWVmfbx8T2Ks0kt2Y` |
| `FIREBASE_STORAGE_BUCKET` | `visionai-prod-aea95.firebasestorage.app` |

**Or via Cloud Shell:**
```bash
echo -n "AIzaSyDtKqhQjOkvLnJaZLMWVmfbx8T2Ks0kt2Y" | \
  gcloud secrets create GEMINI_API_KEY --data-file=-

echo -n "visionai-prod-aea95.firebasestorage.app" | \
  gcloud secrets create FIREBASE_STORAGE_BUCKET --data-file=-
```

---

## 🔐 Part 2: GitHub Repository Setup

### Step 1: Add GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these secrets:

| Secret Name | Value | Where to Get It |
|-------------|-------|-----------------|
| `GCP_SA_KEY` | Contents of `github-actions-key.json` | From Step 3.4 above |
| `BACKEND_URL` | `https://visionai-api-<hash>.a.run.app` | Will get after first deploy, use placeholder for now: `https://api.visionai.com` |
| `FIREBASE_API_KEY` | Your Firebase API key | Firebase Console → Project Settings |
| `FIREBASE_AUTH_DOMAIN` | `visionai-prod-aea95.firebaseapp.com` | Firebase Console |
| `FIREBASE_PROJECT_ID` | `visionai-prod-aea95` | Firebase Console |
| `FIREBASE_STORAGE_BUCKET` | `visionai-prod-aea95.firebasestorage.app` | Firebase Console |
| `FIREBASE_MESSAGING_SENDER_ID` | Your sender ID | Firebase Console |
| `FIREBASE_APP_ID` | Your app ID | Firebase Console |

**How to add a secret:**
1. Click **New repository secret**
2. **Name**: Enter the secret name (e.g., `GCP_SA_KEY`)
3. **Secret**: Paste the value
4. Click **Add secret**

---

### Step 2: Push Code to GitHub

If you haven't already:

```bash
# Initialize git (if not done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit with CI/CD setup"

# Add remote (replace with your repo URL)
git remote add origin https://github.com/yourusername/visionai.git

# Push to main branch
git push -u origin main
```

**This will trigger the CI/CD pipelines automatically!**

---

## 🎯 Part 3: First Deployment

### Step 1: Monitor GitHub Actions

1. Go to your GitHub repository
2. Click **Actions** tab
3. You should see 3 workflows running:
   - Deploy Backend to Cloud Run
   - Deploy Frontend to Cloud Run
   - Deploy Worker to Cloud Run Jobs

4. Click on each workflow to see progress
5. Wait for all to complete (green checkmarks)

### Step 2: Get Service URLs

After deployment completes:

**Via GitHub Actions:**
- Check the "Deployment Summary" at the bottom of each workflow run
- It will show the deployed URL

**Or via Cloud Console:**
1. Go to **Cloud Run** → **Services**
2. Click on `visionai-api` → Copy the URL
3. Click on `visionai-frontend` → Copy the URL

**Or via Cloud Shell:**
```bash
# Get backend URL
gcloud run services describe visionai-api \
  --region asia-south1 \
  --format 'value(status.url)'

# Get frontend URL
gcloud run services describe visionai-frontend \
  --region asia-south1 \
  --format 'value(status.url)'
```

### Step 3: Update Frontend Environment

Now that you have the backend URL, update the GitHub secret:

1. Go to GitHub → **Settings** → **Secrets** → **Actions**
2. Edit `BACKEND_URL` secret
3. Replace with actual backend URL (e.g., `https://visionai-api-abc123-uc.a.run.app`)
4. Save

Then trigger a frontend redeploy:
- Go to **Actions** → **Deploy Frontend to Cloud Run** → **Run workflow** → **Run workflow**

---

## 🌐 Part 4: Custom Domain Setup (Optional)

### Option A: Using Cloud Load Balancer (Recommended)

This allows you to map `yourdomain.com` to your services.

#### Step 1: Reserve Static IP

**Via UI:**
1. Go to **VPC Network** → **IP addresses** → **Reserve External Static Address**
2. **Name**: `visionai-ip`
3. **IP version**: IPv4
4. **Type**: Global
5. Click **Reserve**

**Or via Cloud Shell:**
```bash
gcloud compute addresses create visionai-ip --global
```

#### Step 2: Create Load Balancer

**Via UI:**
1. Go to **Network Services** → **Load Balancing** → **Create Load Balancer**
2. Choose **Application Load Balancer (HTTP/HTTPS)**
3. **Internet facing or internal**: Internet facing
4. Click **Continue**

**Frontend and backend configuration:**
- **Name**: `visionai-lb`
- **Backend configuration**:
  - Create backend service for frontend (Cloud Run: `visionai-frontend`)
  - Create backend service for backend (Cloud Run: `visionai-api`)
- **Host and path rules**:
  - `/api/*` → backend service
  - `/*` → frontend service
- **Frontend configuration**:
  - Protocol: HTTPS
  - IP address: `visionai-ip` (the one you reserved)
  - Certificate: Create Google-managed SSL certificate for your domain
- Click **Create**

#### Step 3: Update DNS

In your domain registrar (GoDaddy, Namecheap, etc.):

1. Add an **A record**:
   - **Name**: `@` (or `www`)
   - **Type**: A
   - **Value**: The IP address from `visionai-ip`
   - **TTL**: 3600

2. Wait for DNS propagation (5-60 minutes)

3. Your site will be available at `https://yourdomain.com`

---

### Option B: Using Cloud Run Domain Mapping (Simpler)

Map domain directly to Cloud Run services.

**For Frontend:**
```bash
gcloud run domain-mappings create \
  --service visionai-frontend \
  --domain yourdomain.com \
  --region asia-south1
```

**For Backend:**
```bash
gcloud run domain-mappings create \
  --service visionai-api \
  --domain api.yourdomain.com \
  --region asia-south1
```

Then update DNS as instructed by the command output.

---

## 🔄 Part 5: Continuous Deployment

### How It Works

**Automatic deployment on push to `main`:**

1. You make changes locally
2. Commit and push to `main` branch:
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```
3. GitHub Actions automatically:
   - Runs tests
   - Builds Docker images
   - Pushes to Artifact Registry
   - Deploys to Cloud Run
   - Runs health checks
4. Your changes are live in ~5-10 minutes!

### Manual Deployment

You can also trigger deployments manually:

1. Go to GitHub → **Actions**
2. Select a workflow (e.g., "Deploy Backend to Cloud Run")
3. Click **Run workflow** → **Run workflow**

---

## 🧪 Part 6: Testing & Monitoring

### Health Checks

**Backend:**
```bash
curl https://your-backend-url.run.app/health
```

**Frontend:**
```bash
curl https://your-frontend-url.run.app
```

### View Logs

**Via Cloud Console:**
1. Go to **Cloud Run** → **Services** → Click service name
2. Click **Logs** tab

**Via Cloud Shell:**
```bash
# Backend logs
gcloud run services logs read visionai-api --region asia-south1 --limit 50

# Frontend logs
gcloud run services logs read visionai-frontend --region asia-south1 --limit 50

# Worker logs
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=visionai-worker" --limit 50
```

### Monitor Deployments

**Via Cloud Console:**
- Go to **Cloud Run** → **Services** → Click service
- View **Metrics** tab for:
  - Request count
  - Request latency
  - Container CPU/Memory usage
  - Error rate

---

## 🔧 Part 7: Troubleshooting

### Issue: Deployment Fails with "Permission Denied"

**Solution:**
- Check that `github-actions-sa` has all required roles
- Verify `GCP_SA_KEY` secret is correct in GitHub

### Issue: Health Check Fails

**Solution:**
- Check service logs for errors
- Verify environment variables are set correctly
- Ensure secrets are accessible

### Issue: Frontend Can't Connect to Backend

**Solution:**
- Update `BACKEND_URL` secret in GitHub with correct backend URL
- Redeploy frontend
- Check CORS settings in backend

### Issue: Worker Job Fails

**Solution:**
- Check worker logs: `gcloud logging read "resource.type=cloud_run_job"`
- Verify service account has Firestore and Storage permissions
- Check that secrets are accessible

---

## 📊 Part 8: Cost Optimization

### Cloud Run Pricing

**Free tier (per month):**
- 2 million requests
- 360,000 GB-seconds of memory
- 180,000 vCPU-seconds

**Your estimated costs:**
- Frontend: ~$5-10/month (low traffic)
- Backend: ~$10-20/month (moderate traffic)
- Worker: ~$5-10/month (job executions)

**Total: ~$20-40/month for moderate usage**

### Optimization Tips

1. **Set min instances to 0** for dev/staging:
   ```bash
   gcloud run services update visionai-api --min-instances 0
   ```

2. **Use Cloud Scheduler** to warm up services before peak hours

3. **Enable request logging** only for errors (not all requests)

4. **Use Cloud CDN** for static assets (if using Load Balancer)

---

## ✅ Deployment Checklist

- [ ] Google Cloud APIs enabled
- [ ] Artifact Registry repository created
- [ ] Service accounts created with correct roles
- [ ] Secrets stored in Secret Manager
- [ ] GitHub secrets configured
- [ ] Code pushed to GitHub `main` branch
- [ ] All 3 workflows completed successfully
- [ ] Backend health check passes
- [ ] Frontend loads correctly
- [ ] Worker job tested
- [ ] Custom domain configured (optional)
- [ ] Monitoring and logging verified

---

## 🎉 You're Done!

Your VisionAI platform is now:
- ✅ Deployed on Google Cloud Run
- ✅ Auto-deploying on every push to `main`
- ✅ Running health checks before deployment
- ✅ Scalable and production-ready
- ✅ (Optional) Accessible via custom domain

**Next Steps:**
1. Test the deployed application
2. Set up monitoring alerts
3. Configure custom domain
4. Add more comprehensive tests to CI/CD

---

## 📞 Support

If you encounter issues:
1. Check GitHub Actions logs
2. Check Cloud Run service logs
3. Verify all secrets and environment variables
4. Review this guide step-by-step

**Common URLs:**
- Google Cloud Console: https://console.cloud.google.com
- GitHub Actions: https://github.com/yourusername/visionai/actions
- Cloud Run Services: https://console.cloud.google.com/run
- Artifact Registry: https://console.cloud.google.com/artifacts
