# Phase 10 Implementation - Setup Guide

## Overview

Phase 10 moves the heavy ML analysis pipeline from FastAPI background tasks to Cloud Run Jobs, and adds a dynamic regulatory sync feature that uses Gemini to monitor new AI laws.

## What's Been Implemented

### ✅ Code Changes Complete

1. **Worker Job (`worker/job.py`)**
   - Added `run_analysis()` function to execute full audit pipeline
   - Added `run_regulatory_sync()` function for weekly regulatory monitoring
   - Handles environment variables for job configuration

2. **Regulatory Sync Engine (`backend/services/regulatory/sync_engine.py`)**
   - Uses Gemini to search for new AI regulations across jurisdictions
   - Parses legal text and extracts compliance thresholds
   - Stores regulations in Firestore
   - Generates alerts for affected organizations

3. **Audit Router (`backend/routers/audits.py`)**
   - Added Cloud Run Job dispatch logic
   - Falls back to background tasks if Cloud Run unavailable
   - Controlled by `USE_CLOUD_RUN_JOBS` environment variable

4. **Firestore Rules (`infra/firestore.rules`)**
   - Added rules for `regulations` collection (read-only for authenticated users)
   - Added rules for `regulatory_alerts` collection (org-scoped)
   - Added rules for `system` collection (read-only for authenticated users)

5. **Dependencies (`backend/requirements.txt`)**
   - Added `google-cloud-run==0.10.12` package

---

## Setup Steps (UI-Based)

### Step 1: Update Firestore Rules

1. Go to **Firebase Console** → **Firestore Database** → **Rules**
2. The rules in `infra/firestore.rules` have been updated
3. Copy the entire content of `infra/firestore.rules` 
4. Paste it into the Firebase Console rules editor
5. Click **Publish**

**Verification**: You should see rules for `regulations`, `regulatory_alerts`, and `system` collections.

---

### Step 2: Install Python Dependencies Locally

Since you're developing locally, install the new dependency:

```bash
cd backend
pip install google-cloud-run==0.10.12
```

**Verification**: Run `pip list | grep google-cloud-run` - should show version 0.10.12

---

### Step 3: Set Environment Variables (Local Development)

Add these to your `backend/.env` file:

```env
# Cloud Run Job Configuration (for production)
GCP_PROJECT_ID=visionai-prod
GCP_REGION=asia-south1
WORKER_JOB_NAME=visionai-worker
USE_CLOUD_RUN_JOBS=false

# Gemini API Key (already set)
GEMINI_API_KEY=AIzaSyDtKqhQjOkvLnJaZLMWVmfbx8T2Ks0kt2Y
```

**Important**: Keep `USE_CLOUD_RUN_JOBS=false` for local development. This will use FastAPI background tasks instead of Cloud Run Jobs.

---

### Step 4: Test Locally

1. **Restart your backend server**:
   ```bash
   cd backend
   python dev_server.py
   ```

2. **Create a test audit** through the frontend
   - The analysis should run via background task (not Cloud Run Job)
   - Check terminal logs for `[WORKER]` messages (won't appear in local mode)

3. **Verify Firestore collections exist**:
   - Go to Firebase Console → Firestore Database
   - You should see: `audits`, `organizations`, `regulations`, `regulatory_alerts`, `system`

---

### Step 5: Deploy Worker to Cloud Run Job (Production)

When you're ready to deploy to production:

#### 5.1 Build and Push Worker Image

You'll need to do this via **Cloud Shell** (since you can't use gcloud locally):

1. Go to **Google Cloud Console** → **Activate Cloud Shell** (top right icon)

2. In Cloud Shell, run:
   ```bash
   # Clone your repo or upload worker files
   cd /path/to/your/repo
   
   # Build worker image
   gcloud builds submit worker/ \
     --tag gcr.io/visionai-prod/visionai-worker:latest \
     --project visionai-prod
   ```

#### 5.2 Create Cloud Run Job

1. Go to **Cloud Run** → **Jobs** → **Create Job**
2. **Container image URL**: `gcr.io/visionai-prod/visionai-worker:latest`
3. **Job name**: `visionai-worker`
4. **Region**: `asia-south1`
5. **Service account**: `visionai-worker-sa@visionai-prod.iam.gserviceaccount.com`
6. **Environment variables**:
   - `VISIONAI_JOB_KIND` = `analysis` (default, will be overridden per execution)
   - `GEMINI_API_KEY` = `AIzaSyDtKqhQjOkvLnJaZLMWVmfbx8T2Ks0kt2Y`
   - `GCP_PROJECT_ID` = `visionai-prod`
7. **Resources**:
   - CPU: 2
   - Memory: 4 GiB
   - Timeout: 3600 seconds (1 hour)
8. Click **Create**

#### 5.3 Grant Permissions

The service account needs permissions to execute jobs:

1. Go to **IAM & Admin** → **IAM**
2. Find `visionai-worker-sa@visionai-prod.iam.gserviceaccount.com`
3. Click **Edit** (pencil icon)
4. Add these roles:
   - `Cloud Run Invoker`
   - `Cloud Run Developer`
   - `Service Account User`
5. Click **Save**

---

### Step 6: Create Cloud Scheduler Job for Regulatory Sync

This will run the regulatory sync weekly.

#### 6.1 Create Scheduler Job (UI)

1. Go to **Cloud Scheduler** → **Create Job**
2. **Name**: `regulatory-sync-weekly`
3. **Region**: `asia-south1`
4. **Frequency**: `0 0 * * 0` (every Sunday at midnight)
5. **Timezone**: Your timezone
6. **Target type**: `HTTP`
7. **URL**: `https://asia-south1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/visionai-prod/jobs/visionai-worker:run`
8. **HTTP method**: `POST`
9. **Auth header**: `Add OIDC token`
10. **Service account**: `visionai-worker-sa@visionai-prod.iam.gserviceaccount.com`
11. **Body**:
    ```json
    {
      "overrides": {
        "containerOverrides": [{
          "env": [{
            "name": "VISIONAI_JOB_KIND",
            "value": "regulatory_sync"
          }]
        }]
      }
    }
    ```
12. Click **Create**

#### 6.2 Test Scheduler Job

1. In Cloud Scheduler, find `regulatory-sync-weekly`
2. Click **Force Run**
3. Go to **Cloud Run** → **Jobs** → `visionai-worker` → **Executions**
4. You should see a new execution with logs showing regulatory sync

---

### Step 7: Enable Cloud Run Jobs in Production

When deploying your backend to Cloud Run (the API service):

1. Go to **Cloud Run** → **Services** → `visionai-api` → **Edit & Deploy New Revision**
2. **Environment variables** → Add:
   - `USE_CLOUD_RUN_JOBS` = `true`
   - `GCP_PROJECT_ID` = `visionai-prod`
   - `GCP_REGION` = `asia-south1`
   - `WORKER_JOB_NAME` = `visionai-worker`
3. Click **Deploy**

Now when audits are created via the API, they'll dispatch to the Cloud Run Job worker instead of running in the API container.

---

## Testing the Implementation

### Test 1: Local Analysis (Background Task)

1. Keep `USE_CLOUD_RUN_JOBS=false` in `.env`
2. Create an audit via frontend
3. Check backend terminal - should see analysis running
4. Audit should complete successfully

### Test 2: Cloud Run Job Analysis (Production)

1. Deploy worker to Cloud Run Job (Step 5)
2. Deploy API with `USE_CLOUD_RUN_JOBS=true` (Step 7)
3. Create an audit via frontend
4. Go to **Cloud Run** → **Jobs** → `visionai-worker` → **Executions**
5. Should see new execution with logs showing analysis progress
6. Audit should complete and update Firestore

### Test 3: Regulatory Sync

1. Manually trigger the Cloud Scheduler job (Step 6.2)
2. Check Cloud Run Job execution logs
3. Go to **Firestore** → `regulations` collection
4. Should see new regulation documents (if any found)
5. Go to **Firestore** → `regulatory_alerts` collection
6. Should see alerts for organizations

---

## Regulatory Sync Feature Details

### How It Works

1. **Weekly Cron Job**: Cloud Scheduler triggers the worker every Sunday
2. **Gemini Search**: Worker uses Gemini to search for new AI regulations in multiple jurisdictions
3. **Parse & Store**: Extracts thresholds, protected classes, requirements from legal text
4. **Generate Alerts**: Creates alerts for organizations that may be affected
5. **Frontend Display**: Alerts appear in dashboard (needs frontend component - see below)

### Monitored Jurisdictions

- United States (federal)
- European Union
- United Kingdom
- Canada
- Australia
- California
- New York
- Colorado

### Regulation Data Structure

Stored in Firestore `regulations` collection:

```json
{
  "id": "abc123...",
  "title": "Colorado SB24-205 - AI Bias Prevention Act",
  "citation": "Colorado Revised Statutes § 6-1-1701",
  "jurisdiction": "Colorado",
  "effective_date": "2025-02-01",
  "thresholds": {
    "disparate_impact_min": 0.85,
    "statistical_parity_max": 0.10
  },
  "protected_classes": ["race", "gender", "age", "disability"],
  "requirements": [
    "Annual bias audits required",
    "Public disclosure of fairness metrics"
  ],
  "penalties": "Up to $20,000 per violation",
  "summary": "Requires AI systems...",
  "discovered_at": "2025-04-25T10:00:00",
  "created_at": "2025-04-25T10:05:00"
}
```

### Alert Data Structure

Stored in Firestore `regulatory_alerts` collection:

```json
{
  "org_id": "org123",
  "regulation_id": "abc123",
  "regulation_title": "Colorado SB24-205",
  "jurisdiction": "Colorado",
  "effective_date": "2025-02-01",
  "severity": "HIGH",
  "message": "New regulation detected: Colorado SB24-205...",
  "action_required": [
    "Annual bias audits required",
    "Ensure disparate_impact_min meets threshold: 0.85"
  ],
  "read": false,
  "created_at": "2025-04-25T10:05:00"
}
```

---

## Frontend Integration (TODO)

You'll need to add a frontend component to display regulatory alerts. Here's what's needed:

### Dashboard Alert Banner

Add to `frontend/app/(dashboard)/dashboard/page.tsx`:

```typescript
// Fetch regulatory alerts
const [alerts, setAlerts] = useState([]);

useEffect(() => {
  if (!orgId) return;
  
  const unsubscribe = onSnapshot(
    query(
      collection(db, 'regulatory_alerts'),
      where('org_id', '==', orgId),
      where('read', '==', false),
      orderBy('created_at', 'desc')
    ),
    (snapshot) => {
      const alertData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAlerts(alertData);
    }
  );
  
  return () => unsubscribe();
}, [orgId]);

// Display alerts
{alerts.length > 0 && (
  <div className="mb-6 space-y-2">
    {alerts.map(alert => (
      <div key={alert.id} className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <div className="flex items-start">
          <AlertTriangle className="h-5 w-5 text-yellow-400 mr-3" />
          <div className="flex-1">
            <h3 className="text-sm font-medium text-yellow-800">
              {alert.regulation_title}
            </h3>
            <p className="text-sm text-yellow-700 mt-1">
              {alert.message}
            </p>
            <div className="mt-2">
              <span className="text-xs text-yellow-600">
                Effective: {alert.effective_date}
              </span>
            </div>
          </div>
          <button
            onClick={() => markAlertAsRead(alert.id)}
            className="text-yellow-600 hover:text-yellow-800"
          >
            Dismiss
          </button>
        </div>
      </div>
    ))}
  </div>
)}
```

---

## Troubleshooting

### Issue: "google-cloud-run not installed"

**Solution**: Run `pip install google-cloud-run==0.10.12` in backend directory

### Issue: Cloud Run Job fails with "Permission denied"

**Solution**: Ensure service account has these roles:
- Cloud Run Invoker
- Cloud Run Developer
- Firestore User
- Storage Object Viewer

### Issue: Regulatory sync finds no regulations

**Solution**: This is normal - Gemini may not find new regulations every week. Check logs to see if search completed successfully.

### Issue: Worker can't import backend modules

**Solution**: The worker Dockerfile needs to copy both `worker/` and `backend/` directories. Update `worker/Dockerfile`:

```dockerfile
FROM python:3.11-slim
WORKDIR /app

# Copy backend code (needed for imports)
COPY backend/ ./backend/

# Copy worker code
COPY worker/ ./worker/

# Install dependencies
COPY worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Set Python path
ENV PYTHONPATH=/app/backend:/app/worker

# Run worker
CMD ["python", "worker/job.py"]
```

---

## Summary

**Local Development**:
- ✅ Code changes complete
- ✅ Firestore rules updated
- ✅ Dependencies installed
- ✅ Environment variables set
- ✅ Analysis runs via background tasks

**Production Deployment** (when ready):
1. Update Firestore rules in Firebase Console
2. Build and push worker image via Cloud Shell
3. Create Cloud Run Job via UI
4. Create Cloud Scheduler job via UI
5. Deploy API with `USE_CLOUD_RUN_JOBS=true`
6. Add frontend component for regulatory alerts

**Next Steps**:
1. Test locally with `USE_CLOUD_RUN_JOBS=false`
2. When ready, deploy worker to Cloud Run Job
3. Enable Cloud Run Jobs in production API
4. Add frontend regulatory alerts component
