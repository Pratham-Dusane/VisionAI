# VisionAI - Product Requirements Document
### Fairness Observability Platform | Google Solutions Challenge 2026
**Version:** 1.0  
**Audience:** Coding Agent / Developer  
**Stack:** Next.js · FastAPI · Google Cloud · Gemini API · Firebase · Python ML stack  
problem stmt-
Unbiased AI Decision

Ensuring Fairness and Detecting Bias in Automated Decisions
Computer programs now make life-changing decisions about who gets a job, a bank loan, or even medical care. However, if these programs learn from flawed or unfair historical data, they will repeat and amplify those exact same discriminatory mistakes.

Objective
Build a clear, accessible solution to thoroughly inspect data sets and software models for hidden unfairness or discrimination. Provide organizations with an easy way to measure, flag, and fix harmful bias before their systems impact real people.
---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Repository Structure](#3-repository-structure)
4. [Phase 1 - Frontend Foundation](#4-phase-1--frontend-foundation)
5. [Phase 2 - Authentication & Project Management](#5-phase-2--authentication--project-management)
6. [Phase 3 - Data Ingestion & Pre-processing](#6-phase-3--data-ingestion--pre-processing)
7. [Phase 4 - Analysis Engine](#7-phase-4--analysis-engine)
8. [Phase 5 - Gemini AI Integration Layer](#8-phase-5--gemini-ai-integration-layer)
9. [Phase 6 - Outputs & Reporting](#9-phase-6--outputs--reporting)
10. [Phase 7 - Advanced & Innovative Features](#10-phase-7--advanced--innovative-features)
11. [Phase 8 - CI/CD Integration & Action Layer](#11-phase-8--cicd-integration--action-layer)
12. [Phase 9 - Bias Drift Monitor](#12-phase-9--bias-drift-monitor)
13. [Phase 10 - Infrastructure, Scaling & GCP Config](#13-phase-10--infrastructure-scaling--gcp-config)
14. [Data Models](#14-data-models)
15. [API Reference](#15-api-reference)
16. [Environment Variables](#16-environment-variables)

---

## 1. Project Overview

### 1.1 Product Name
**VisionAI** - AI-powered Fairness Observability Platform

### 1.2 Mission Statement
VisionAI is not a one-shot bias checker. It is a continuous fairness monitoring system - the "Grafana for ML fairness." It audits datasets and models before deployment, tracks fairness drift over time, explains findings to three distinct audience types (technical, executive, legal), and recommends actionable fixes.

### 1.3 Core Problem Statement
Automated ML models make life-changing decisions (hiring, loans, medical triage). When trained on biased historical data, they encode and amplify discrimination at scale. Organizations lack a unified, accessible platform to inspect, monitor, and remediate bias across their ML pipeline.

### 1.4 Target Users
- **ML Engineers** - upload models and datasets, analyze SHAP values, integrate with CI/CD
- **Compliance Officers** - need regulation-mapped findings and exportable audit trails
- **Executives / HR leaders** - need plain-English summaries and business risk scores
- **Individual applicants (future)** - understand why they were rejected by an automated system

### 1.5 Hackathon Positioning
- Google Cloud: Cloud Run, Firestore, Cloud Storage, Vertex AI, BigQuery
- Google AI: Gemini 1.5 Pro for narrative generation, blind spot detection, stakeholder summarization
- Differentiator: Only platform that handles both data bias AND model bias AND tracks drift over time AND maps to legal regulations AND explains to three stakeholder types simultaneously

---

## 2. Architecture Overview

```
+------------------------------------------------------------------+
|                        FRONTEND (Next.js 14)                     |
|  Dashboard . Upload UI . Audit Viewer . Drift Monitor . Reports  |
+------------------------+----------------------------------------+
                         | HTTPS REST / WebSocket
+------------------------v----------------------------------------+
|                     API GATEWAY (FastAPI)                        |
|         Deployed on Google Cloud Run (auto-scaling)             |
+--+----------+----------+--------------+-----------+------------+
   |          |          |              |           |
   v          v          v              v           v
Firestore  Cloud      Analysis      Gemini      BigQuery
(metadata) Storage    Workers       API         (drift logs)
           (files)    (Cloud Run    (Vertex AI)
                      Jobs)
```

### 2.1 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js 14 (App Router) | SSR, fast, React ecosystem |
| Styling | Tailwind CSS + shadcn/ui | Speed of development |
| Charts | Recharts + D3.js | Fairness heatmaps, drift charts |
| API | FastAPI (Python 3.11) | ML libraries, async support |
| Auth | Firebase Auth | Google OAuth, easy setup |
| Database | Firestore | Flexible schema, real-time |
| File Storage | Google Cloud Storage | Large file uploads |
| ML Analysis | Cloud Run Jobs (async) | Long-running bias computation |
| LLM | Gemini 1.5 Pro via Vertex AI | Narrative generation, blind spots |
| Long-term storage | BigQuery | Drift timeseries, benchmarking |
| PDF generation | Puppeteer (Node) | Audit report export |
| Queue | Cloud Tasks | Async job dispatch |

---

## 3. Repository Structure

```
visionai/
├── frontend/                    # Next.js 14 application
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── dashboard/
│   │   │   └── page.tsx         # Main org dashboard
│   │   ├── audit/
│   │   │   ├── new/page.tsx     # Upload + context definition
│   │   │   └── [auditId]/
│   │   │       ├── page.tsx     # Audit results viewer
│   │   │       ├── technical/page.tsx
│   │   │       ├── executive/page.tsx
│   │   │       └── legal/page.tsx
│   │   ├── drift/
│   │   │   └── page.tsx         # Bias drift monitor
│   │   └── api/                 # Next.js API routes (thin BFF layer)
│   ├── components/
│   │   ├── ui/                  # shadcn components
│   │   ├── charts/
│   │   │   ├── FairnessHeatmap.tsx
│   │   │   ├── DriftTimeline.tsx
│   │   │   ├── ProxyNetworkGraph.tsx
│   │   │   ├── ParetoFrontier.tsx
│   │   │   └── IntersectionalHeatmap.tsx
│   │   ├── audit/
│   │   │   ├── UploadZone.tsx
│   │   │   ├── ContextForm.tsx
│   │   │   ├── MetricCard.tsx
│   │   │   ├── SeverityBadge.tsx
│   │   │   ├── StakeholderToggle.tsx
│   │   │   └── CounterfactualExplorer.tsx
│   │   └── layout/
│   │       ├── Sidebar.tsx
│   │       └── TopNav.tsx
│   ├── lib/
│   │   ├── firebase.ts
│   │   ├── api.ts               # API client
│   │   └── types.ts
│   └── public/
│
├── backend/                     # FastAPI application
│   ├── main.py
│   ├── routers/
│   │   ├── auth.py
│   │   ├── audits.py
│   │   ├── uploads.py
│   │   ├── reports.py
│   │   ├── drift.py
│   │   └── cicd.py
│   ├── services/
│   │   ├── preprocessing/
│   │   │   ├── schema_parser.py
│   │   │   ├── proxy_detector.py
│   │   │   └── data_profiler.py
│   │   ├── analysis/
│   │   │   ├── data_bias_scanner.py
│   │   │   ├── model_bias_evaluator.py
│   │   │   ├── explainability.py
│   │   │   ├── intersectional_audit.py
│   │   │   ├── counterfactual_engine.py
│   │   │   ├── severity_scorer.py
│   │   │   ├── feature_laundering.py
│   │   │   ├── historical_harm.py
│   │   │   └── flip_sensitivity.py
│   │   ├── gemini/
│   │   │   ├── narrative_generator.py
│   │   │   ├── blind_spot_detector.py
│   │   │   └── stakeholder_formatter.py
│   │   ├── compliance/
│   │   │   └── regulation_mapper.py
│   │   └── reporting/
│   │       ├── pdf_generator.py
│   │       └── audit_serializer.py
│   ├── models/
│   │   ├── audit.py
│   │   ├── dataset.py
│   │   └── drift.py
│   ├── core/
│   │   ├── config.py
│   │   ├── firebase_admin.py
│   │   └── gcs.py
│   └── requirements.txt
│
├── worker/                      # Cloud Run Job for heavy ML work
│   ├── job.py                   # Entry point
│   ├── pipeline.py              # Orchestrates all analysis modules
│   └── Dockerfile
│
├── infra/                       # GCP infrastructure
│   ├── cloudrun.yaml
│   ├── firestore.rules
│   └── storage.cors.json
│
└── .github/
    └── workflows/
        └── deploy.yml
```

---

## 4. Phase 1 - Frontend Foundation

Build the UI shell first. All pages should render with mock/skeleton data before the backend is wired.

### 4.1 Design System Setup

**Install dependencies:**
```bash
cd frontend
npx create-next-app@latest . --typescript --tailwind --app
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card badge tabs toast dialog sheet skeleton
npm install recharts d3 @types/d3 framer-motion lucide-react
npm install firebase
```

**Tailwind config** - extend with VisionAI brand colors in `tailwind.config.ts`:
```typescript
theme: {
  extend: {
    colors: {
      brand: {
        50: '#f0f4ff',
        500: '#4361ee',
        600: '#3451d1',
        900: '#1a2a7a',
      },
      severity: {
        critical: '#dc2626',
        high: '#ea580c',
        medium: '#d97706',
        low: '#65a30d',
        pass: '#16a34a',
      }
    }
  }
}
```

### 4.2 Layout Components

#### `components/layout/Sidebar.tsx`
Persistent left sidebar with:
- VisionAI logo (top left)
- Navigation items: Dashboard, New Audit, Drift Monitor, Reports, Settings
- Each item: icon + label, active state highlight
- Bottom: user avatar + org name + signout
- Collapsible to icon-only on small screens (use `useState` for toggle)
- Use `lucide-react` icons: `LayoutDashboard`, `PlusCircle`, `TrendingUp`, `FileText`, `Settings`, `LogOut`

#### `components/layout/TopNav.tsx`
Thin top bar showing:
- Breadcrumb: `Dashboard > Audit > audit-name`
- Right side: notification bell (for completed audit alerts), user avatar
- Pass breadcrumb items as props array: `[{label, href}]`

### 4.3 Dashboard Page (`app/dashboard/page.tsx`)

Show the organization's audit history and summary stats.

**Top stats row - 4 cards:**
1. Total Audits Run (number)
2. Average Fairness Score (0-100 with color - green >70, amber 40-70, red <40)
3. Active Alerts (count of audits with severity CRITICAL or HIGH)
4. Last Audit Date

**Recent Audits table:**
Columns: Audit Name | Domain | Date | Fairness Score | Status | Actions
- Status badge: `COMPLETE` (green), `PROCESSING` (amber animated), `FAILED` (red)
- Fairness Score: color-coded number with mini progress bar
- Actions: View Report, Re-audit, Delete
- Table is paginated: 10 rows per page, use shadcn `Table` component

**Quick Start card:**
Large CTA card: "Run your first audit" with a `New Audit` button. Only show if total audits === 0.

### 4.4 New Audit Page (`app/audit/new/page.tsx`)

Three-step wizard. Use a stepper component at the top showing Step 1 / Step 2 / Step 3.

#### Step 1 - Upload Files
Two upload zones side by side:

**Dataset Upload Zone (`components/audit/UploadZone.tsx`):**
- Drag-and-drop area with dashed border
- Accept: `.csv`, `.json`, `.parquet`
- On drop/select: show filename, file size, row count preview (parse first 5 rows client-side using PapaParse for CSV)
- Show a mini table preview of first 5 rows after upload
- Install: `npm install papaparse @types/papaparse`

**Model Upload Zone:**
- Accept: `.pkl`, `.onnx`, `.joblib`
- OR: toggle to "Live API Endpoint" - shows a text input for REST URL + optional Bearer token field
- Model upload is optional - user can audit data only

Below the zones, show a toggle: "I only want to audit my dataset (no model)" - disables the model zone.

#### Step 2 - Context Definition (`components/audit/ContextForm.tsx`)

This is the most important form. Build it carefully.

**Audit Name:** text input (required)

**Domain selector:** dropdown with options:
- Hiring / Recruitment
- Financial Lending
- Healthcare / Medical Triage
- Criminal Justice / Risk Assessment
- Insurance Underwriting
- Education / Admissions
- Other (shows free text input)

**Label column selector:**
- Dropdown populated from the uploaded dataset's column names
- Label: "Which column is the outcome / decision? (the column your model predicts)"
- Example hint shown below: "e.g. 'approved', 'hired', 'high_risk'"

**Positive outcome value:**
- Text input: "What value in the label column means a positive outcome?"
- Example: "1", "True", "approved", "hired"

**Protected attributes selector:**
- Multi-select checkbox list of all dataset columns
- Pre-selected columns are highlighted in amber with a warning icon - these are VisionAI's auto-detected sensitive columns (populated after Step 1 backend call)
- User can check/uncheck any columns
- Tooltip on each auto-detected column explaining WHY it was flagged

**Deployment duration (for Historical Harm Calculator):**
- Label: "Has this model been deployed? If yes, for how long?"
- Toggle: Yes / No
- If Yes: date picker for "Deployed since" date
- If Yes: number input for "Approximate decisions made per month"

**Fairness threshold:**
- Slider from 0.6 to 1.0, default 0.8
- Label: "Minimum acceptable Disparate Impact Ratio (0.8 = legal threshold)"
- Show the 0.8 line prominently on the slider

#### Step 3 - Review & Launch
- Summary of all inputs
- Estimated analysis time (based on file size: rough formula `rows / 10000 * 30` seconds, max 5 min)
- Big "Launch Audit" button
- On submit: POST to `/api/audits` -> receive `audit_id` -> redirect to `/audit/[auditId]` with a loading state

### 4.5 Audit Results Page (`app/audit/[auditId]/page.tsx`)

#### Loading State
While audit is processing (`status === 'PROCESSING'`):
- Full-page centered animated logo
- Progress steps list showing which analysis modules have completed (use Firestore real-time listener on `audits/{auditId}` document, field `progress_steps`)
- Steps: Schema Parsing -> Proxy Detection -> Data Profiling -> Bias Scanning -> Model Evaluation -> Explainability -> Intersectional Audit -> Counterfactual Analysis -> Regulation Mapping -> Narrative Generation
- Each step: spinner -> checkmark when done

#### Results Layout (when `status === 'COMPLETE'`)

**Header row:**
- Audit name, domain, date
- Giant fairness score circle (SVG donut chart, 0-100, color coded)
- Letter grade badge (A/B/C/D/F) large
- "Share Report" button -> copies public URL to clipboard
- "Download PDF" button
- Stakeholder mode toggle (see Phase 7)

**Tab navigation:** Overview | Data Analysis | Model Analysis | Explainability | Intersectional | Fixes | Legal

Each tab is described in detail in Phase 6 and Phase 7.

---

## 5. Phase 2 - Authentication & Project Management

### 5.1 Firebase Auth Setup

**Developer setup instructions:**
1. Go to https://console.firebase.google.com
2. Create a new project named `visionai-prod`
3. Enable Authentication -> Sign-in methods -> enable Google and Email/Password
4. Go to Project Settings -> General -> Your apps -> Add web app -> copy config object
5. Place config values in `.env.local` (see Phase 10 env vars section)

**`lib/firebase.ts`:**
```typescript
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
```

### 5.2 Auth Pages

**Login page** (`app/(auth)/login/page.tsx`):
- Clean centered card
- "Sign in with Google" button (primary)
- Email + password inputs (secondary)
- On success: redirect to `/dashboard`
- On error: show toast with error message

**Auth middleware** (`middleware.ts` at root):
```typescript
// Protect all routes under /dashboard, /audit, /drift
// Redirect unauthenticated users to /login
// Use Firebase ID token verification
```

### 5.3 Organization Model

On first login, prompt user to create an Organization:
- Org name (required)
- Industry (dropdown - same list as domain selector)
- Team size (optional)

Store in Firestore: `organizations/{orgId}` with `{ name, industry, ownerId, members: [uid], createdAt }`

Every audit is scoped to an organization. User can only see audits belonging to their org.

---

## 6. Phase 3 - Data Ingestion & Pre-processing

### 6.1 File Upload Flow

**Frontend -> GCS (direct upload, not through FastAPI):**

Use GCS signed URLs to upload files directly from the browser to Cloud Storage, bypassing the API server for large files.

Flow:
1. Frontend calls `POST /api/uploads/signed-url` with `{ filename, contentType, orgId }`
2. Backend generates a GCS signed URL (15-minute expiry) and returns it
3. Frontend uploads the file directly to GCS using the signed URL via `fetch` with `method: 'PUT'`
4. Frontend reports upload completion to `POST /api/uploads/confirm` with the GCS path
5. Backend triggers the preprocessing pipeline

**Backend - GCS signed URL generation (`core/gcs.py`):**
```python
from google.cloud import storage
from datetime import timedelta

def generate_upload_signed_url(bucket_name: str, blob_name: str, content_type: str) -> str:
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    url = blob.generate_signed_url(
        version="v4",
        expiration=timedelta(minutes=15),
        method="PUT",
        content_type=content_type,
    )
    return url
```

**GCS Bucket setup (developer instruction):**
1. Go to https://console.cloud.google.com/storage
2. Create bucket: `visionai-uploads-{project-id}`
3. Region: `asia-south1` (Mumbai - lowest latency for India)
4. Storage class: Standard
5. Access control: Fine-grained
6. Enable CORS: create `storage.cors.json`:
```json
[{
  "origin": ["https://visionai.vercel.app", "http://localhost:3000"],
  "method": ["GET", "PUT", "POST", "OPTIONS"],
  "responseHeader": ["Content-Type"],
  "maxAgeSeconds": 3600
}]
```
Apply with: `gsutil cors set storage.cors.json gs://visionai-uploads-{project-id}`

### 6.2 Schema Parser (`services/preprocessing/schema_parser.py`)

**Purpose:** Auto-detect sensitive/protected columns from the uploaded dataset.

**Input:** GCS path to uploaded file  
**Output:** JSON object with column names, inferred types, and sensitivity scores

**Implementation:**

```python
import pandas as pd
import numpy as np

SENSITIVE_KEYWORDS = {
    'gender': 0.95, 'sex': 0.95, 'race': 0.98, 'ethnicity': 0.98,
    'age': 0.85, 'religion': 0.95, 'nationality': 0.90,
    'disability': 0.92, 'marital': 0.80, 'pregnant': 0.95,
    'zip': 0.70, 'zipcode': 0.70, 'postal': 0.70,
    'surname': 0.65, 'lastname': 0.65, 'name': 0.60,
    'income': 0.60, 'salary': 0.60,
}

def parse_schema(df: pd.DataFrame) -> dict:
    columns = []
    for col in df.columns:
        col_lower = col.lower().replace('_', '').replace(' ', '')
        sensitivity_score = 0.0
        flagged_reason = None
        
        for keyword, score in SENSITIVE_KEYWORDS.items():
            if keyword in col_lower:
                sensitivity_score = score
                flagged_reason = f"Column name contains sensitive keyword '{keyword}'"
                break
        
        # Check value distribution for binary categorical that looks like gender
        if df[col].dtype == object and df[col].nunique() <= 5:
            values_lower = [str(v).lower() for v in df[col].dropna().unique()]
            gender_indicators = {'male', 'female', 'm', 'f', 'man', 'woman'}
            if any(v in gender_indicators for v in values_lower):
                sensitivity_score = max(sensitivity_score, 0.90)
                flagged_reason = "Column values match known gender categories"
        
        columns.append({
            'name': col,
            'dtype': str(df[col].dtype),
            'unique_count': int(df[col].nunique()),
            'null_count': int(df[col].isnull().sum()),
            'sample_values': df[col].dropna().sample(min(5, len(df[col].dropna()))).tolist(),
            'sensitivity_score': sensitivity_score,
            'flagged_reason': flagged_reason,
            'auto_flagged': sensitivity_score >= 0.65,
        })
    
    return {
        'row_count': len(df),
        'column_count': len(df.columns),
        'columns': columns,
    }
```

### 6.3 Proxy Detector (`services/preprocessing/proxy_detector.py`)

**Purpose:** Find columns that are NOT protected attributes themselves but are statistically correlated with them (proxy variables). A model that removed "race" but kept "zip_code" may still discriminate via proxy.

**Input:** DataFrame, list of confirmed protected attribute columns  
**Output:** List of proxy variable warnings with correlation evidence

**Implementation:**

```python
from scipy.stats import chi2_contingency
import pandas as pd
import numpy as np

def detect_proxies(df: pd.DataFrame, protected_cols: list[str], threshold: float = 0.3) -> list[dict]:
    """
    For each non-protected column, measure its statistical association with each protected column.
    Use Cramer's V for categorical-categorical, eta-squared for numeric-categorical.
    Flag anything above threshold as a proxy risk.
    """
    warnings = []
    
    for protected_col in protected_cols:
        if protected_col not in df.columns:
            continue
        for other_col in df.columns:
            if other_col == protected_col or other_col in protected_cols:
                continue
            
            association = 0.0
            method = None
            
            try:
                if df[protected_col].dtype == object and df[other_col].dtype == object:
                    # Both categorical: Cramer's V
                    contingency = pd.crosstab(df[protected_col], df[other_col])
                    chi2, _, _, _ = chi2_contingency(contingency)
                    n = contingency.sum().sum()
                    min_dim = min(contingency.shape) - 1
                    association = np.sqrt(chi2 / (n * min_dim)) if min_dim > 0 else 0
                    method = "Cramer's V"
                
                elif df[protected_col].dtype == object and pd.api.types.is_numeric_dtype(df[other_col]):
                    # Categorical protected, numeric other: ANOVA eta-squared
                    groups = [df[other_col][df[protected_col] == val].dropna() 
                              for val in df[protected_col].unique()]
                    grand_mean = df[other_col].mean()
                    ss_between = sum(len(g) * (g.mean() - grand_mean)**2 for g in groups if len(g) > 0)
                    ss_total = ((df[other_col] - grand_mean)**2).sum()
                    association = ss_between / ss_total if ss_total > 0 else 0
                    method = "Eta-squared (ANOVA)"
                    
            except Exception:
                continue
            
            if association >= threshold:
                warnings.append({
                    'proxy_column': other_col,
                    'protected_column': protected_col,
                    'association_score': round(float(association), 4),
                    'method': method,
                    'risk_level': 'HIGH' if association >= 0.5 else 'MEDIUM',
                    'explanation': (
                        f"'{other_col}' has {method} of {association:.2f} with '{protected_col}'. "
                        f"If '{protected_col}' is excluded from the model but '{other_col}' is kept, "
                        f"the model may still discriminate via this proxy."
                    )
                })
    
    return sorted(warnings, key=lambda x: x['association_score'], reverse=True)
```

### 6.4 Data Profiler (`services/preprocessing/data_profiler.py`)

**Purpose:** Compute per-group distribution statistics. Show class imbalance, label distribution per demographic group.

**Output per protected attribute:**
```json
{
  "attribute": "gender",
  "group_counts": {"Male": 8420, "Female": 1580},
  "group_percentages": {"Male": 84.2, "Female": 15.8},
  "label_distribution_per_group": {
    "Male": {"approved": 72.1, "rejected": 27.9},
    "Female": {"approved": 51.3, "rejected": 48.7}
  },
  "imbalance_ratio": 5.33,
  "imbalance_warning": true,
  "recommended_smote_samples": {
    "Female": 6840,
    "explanation": "Add 6840 synthetic Female samples to reach 50/50 balance"
  }
}
```

**SMOTE recommendation formula:**
```python
def recommend_smote(group_counts: dict) -> dict:
    max_count = max(group_counts.values())
    recommendations = {}
    for group, count in group_counts.items():
        if count < max_count:
            needed = max_count - count
            recommendations[group] = {
                'synthetic_samples_needed': needed,
                'projected_balance_ratio': 1.0,
            }
    return recommendations
```

---

## 7. Phase 4 - Analysis Engine

All analysis modules run as a Cloud Run Job (async), triggered by a Cloud Task after file upload confirmation.

### 7.1 Analysis Pipeline Orchestrator (`worker/pipeline.py`)

```python
import asyncio
from services.preprocessing import schema_parser, proxy_detector, data_profiler
from services.analysis import (
    data_bias_scanner, model_bias_evaluator, explainability,
    intersectional_audit, counterfactual_engine, severity_scorer,
    feature_laundering, historical_harm, flip_sensitivity
)
from services.gemini import narrative_generator, blind_spot_detector
from services.compliance import regulation_mapper
from core.firestore_client import update_audit_progress

async def run_pipeline(audit_id: str, config: dict):
    """
    Main orchestrator. Each step updates Firestore with progress so frontend
    can show real-time progress to the user.
    """
    steps = [
        ("schema_parsing", run_schema_parsing),
        ("proxy_detection", run_proxy_detection),
        ("data_profiling", run_data_profiling),
        ("data_bias_scan", run_data_bias_scan),
        ("model_evaluation", run_model_evaluation),
        ("explainability", run_explainability),
        ("intersectional_audit", run_intersectional_audit),
        ("counterfactual_analysis", run_counterfactual_analysis),
        ("feature_laundering", run_feature_laundering),
        ("flip_sensitivity", run_flip_sensitivity),
        ("historical_harm", run_historical_harm),
        ("regulation_mapping", run_regulation_mapping),
        ("narrative_generation", run_narrative_generation),
        ("severity_scoring", run_severity_scoring),
    ]
    
    results = {}
    for step_name, step_fn in steps:
        await update_audit_progress(audit_id, step_name, "running")
        try:
            result = await step_fn(audit_id, config, results)
            results[step_name] = result
            await update_audit_progress(audit_id, step_name, "complete")
        except Exception as e:
            await update_audit_progress(audit_id, step_name, "failed", error=str(e))
            # Non-fatal: continue pipeline, mark step as failed
    
    await finalize_audit(audit_id, results)
```

### 7.2 Data Bias Scanner (`services/analysis/data_bias_scanner.py`)

Compute the following metrics on the dataset for each protected attribute:

#### Disparate Impact (DI) Ratio
```
DI = P(positive outcome | unprivileged group) / P(positive outcome | privileged group)
```
- DI < 0.8: legally actionable (US EEOC 4/5ths rule)
- DI < 0.6: severe
- DI > 1.25: reverse discrimination signal

```python
def disparate_impact(df, label_col, positive_label, protected_col, privileged_value):
    priv = df[df[protected_col] == privileged_value]
    unpriv = df[df[protected_col] != privileged_value]
    p_priv = (priv[label_col] == positive_label).mean()
    p_unpriv = (unpriv[label_col] == positive_label).mean()
    if p_priv == 0:
        return None
    return round(p_unpriv / p_priv, 4)
```

#### Statistical Parity Difference
```
SPD = P(positive | unprivileged) - P(positive | privileged)
```
Acceptable range: -0.1 to +0.1

#### Label Skew per Group
For each group, compute the label distribution as a percentage. Flag groups where positive outcome rate deviates more than 15 percentage points from the overall rate.

#### Return format:
```json
{
  "attribute": "gender",
  "privileged_group": "Male",
  "metrics": {
    "disparate_impact": 0.71,
    "statistical_parity_difference": -0.21,
    "positive_rate_privileged": 0.72,
    "positive_rate_unprivileged": 0.51
  },
  "verdict": "FAIL",
  "severity": "HIGH",
  "explanation": "Female applicants receive positive outcomes at 51% vs 72% for males. DI of 0.71 is below the legal threshold of 0.80."
}
```

### 7.3 Model Bias Evaluator (`services/analysis/model_bias_evaluator.py`)

**This is the "software model" evaluation the problem statement requires.**

**Supports three model types:**
1. Pickle/joblib file (scikit-learn compatible) - load with `joblib.load()`
2. ONNX file - load with `onnxruntime.InferenceSession()`
3. Live REST API endpoint - call with `httpx.AsyncClient`

**Strategy: Perturbation Testing at scale**

```python
import pandas as pd
import numpy as np
from typing import Callable

def run_counterfactual_perturbation(
    df: pd.DataFrame,
    predict_fn: Callable,   # Any model wrapped as predict_fn(df) -> np.array
    protected_cols: list[str],
    label_col: str,
    n_samples: int = 1000,
) -> dict:
    """
    For each protected attribute, clone n_samples rows and flip the protected
    attribute value. Measure how often the model's prediction changes.
    This reveals whether the model uses the protected attribute in its decisions.
    """
    sample = df.sample(min(n_samples, len(df)), random_state=42).copy()
    results = {}
    
    for col in protected_cols:
        if col not in df.columns:
            continue
        
        original_preds = predict_fn(sample)
        flip_rates = {}
        
        unique_values = sample[col].dropna().unique()
        
        for original_val in unique_values:
            mask = sample[col] == original_val
            if mask.sum() == 0:
                continue
            
            for target_val in unique_values:
                if target_val == original_val:
                    continue
                
                modified = sample.copy()
                modified.loc[mask, col] = target_val
                modified_preds = predict_fn(modified)
                
                flip_count = (original_preds[mask] != modified_preds[mask]).sum()
                flip_rate = flip_count / mask.sum()
                flip_rates[f"{original_val} -> {target_val}"] = round(float(flip_rate), 4)
        
        results[col] = {
            'flip_rates': flip_rates,
            'max_flip_rate': max(flip_rates.values()) if flip_rates else 0,
            'mean_flip_rate': np.mean(list(flip_rates.values())) if flip_rates else 0,
            'verdict': 'FAIL' if max(flip_rates.values(), default=0) > 0.10 else 'PASS',
        }
    
    return results
```

**Equalized Odds computation** (requires ground truth labels in the dataset):
```python
def equalized_odds(y_true, y_pred, protected_series):
    """
    For each group: compute FPR and FNR.
    Equalized odds is violated if FPR or FNR differs significantly between groups.
    """
    results = {}
    for group in protected_series.unique():
        mask = protected_series == group
        yt = y_true[mask]
        yp = y_pred[mask]
        tp = ((yt == 1) & (yp == 1)).sum()
        tn = ((yt == 0) & (yp == 0)).sum()
        fp = ((yt == 0) & (yp == 1)).sum()
        fn = ((yt == 1) & (yp == 0)).sum()
        results[group] = {
            'fpr': fp / (fp + tn) if (fp + tn) > 0 else 0,
            'fnr': fn / (fn + tp) if (fn + tp) > 0 else 0,
            'precision': tp / (tp + fp) if (tp + fp) > 0 else 0,
        }
    return results
```

### 7.4 Explainability Layer (`services/analysis/explainability.py`)

**Install:** `pip install shap`

**SHAP values per demographic group:**

```python
import shap
import pandas as pd
import numpy as np

def compute_shap_by_group(model, df: pd.DataFrame, protected_col: str, feature_cols: list[str]):
    """
    Compute SHAP values for the full dataset, then split by demographic group
    and compare mean absolute SHAP values. If a feature has dramatically higher
    SHAP values for one group, it's being used differently for different demographics.
    """
    X = df[feature_cols]
    
    try:
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X)
    except Exception:
        explainer = shap.KernelExplainer(model.predict_proba, shap.sample(X, 100))
        shap_values = explainer.shap_values(X)
    
    if isinstance(shap_values, list):
        sv = np.array(shap_values[1])
    else:
        sv = np.array(shap_values)
    
    shap_df = pd.DataFrame(sv, columns=feature_cols)
    shap_df[protected_col] = df[protected_col].values
    
    group_shap = {}
    for group in df[protected_col].unique():
        mask = shap_df[protected_col] == group
        group_shap[str(group)] = {
            col: round(float(shap_df.loc[mask, col].abs().mean()), 6)
            for col in feature_cols
        }
    
    disparity_flags = []
    groups = list(group_shap.keys())
    if len(groups) >= 2:
        for feature in feature_cols:
            vals = [group_shap[g].get(feature, 0) for g in groups]
            max_v, min_v = max(vals), min(vals)
            if min_v > 0 and (max_v / min_v) > 2.0:
                disparity_flags.append({
                    'feature': feature,
                    'disparity_ratio': round(max_v / min_v, 2),
                    'group_values': dict(zip(groups, [round(v, 4) for v in vals])),
                    'explanation': f"'{feature}' has {max_v/min_v:.1f}x higher impact on decisions for some groups."
                })
    
    return {
        'shap_by_group': group_shap,
        'disparity_flags': disparity_flags,
    }
```

**Note for developer:** For full counterfactual generation, integrate the `dice-ml` library (`pip install dice-ml`). It generates diverse counterfactual examples by solving a constrained optimization. Use `dice_ml.Dice(data_interface, model_interface, method='gradient')` for differentiable models.

### 7.5 Intersectional Audit (`services/analysis/intersectional_audit.py`)

**Purpose:** Compute fairness metrics for every combination of two protected attributes, not just one at a time.

```python
from itertools import combinations
import pandas as pd

def intersectional_audit(df: pd.DataFrame, protected_cols: list[str], label_col: str, positive_label) -> list[dict]:
    """
    For every pair of protected attributes, compute DI for each intersection.
    e.g., for gender x race: compute DI for (Male, White), (Male, Black), (Female, White), (Female, Black)
    """
    results = []
    
    for col_a, col_b in combinations(protected_cols, 2):
        if col_a not in df.columns or col_b not in df.columns:
            continue
        
        overall_positive_rate = (df[label_col] == positive_label).mean()
        
        for val_a in df[col_a].dropna().unique():
            for val_b in df[col_b].dropna().unique():
                mask = (df[col_a] == val_a) & (df[col_b] == val_b)
                group_df = df[mask]
                
                if len(group_df) < 30:  # Skip statistically insignificant groups
                    continue
                
                positive_rate = (group_df[label_col] == positive_label).mean()
                di = positive_rate / overall_positive_rate if overall_positive_rate > 0 else None
                
                results.append({
                    'group': f"{col_a}={val_a} x {col_b}={val_b}",
                    'col_a': col_a, 'val_a': str(val_a),
                    'col_b': col_b, 'val_b': str(val_b),
                    'sample_size': int(len(group_df)),
                    'positive_rate': round(float(positive_rate), 4),
                    'di_vs_overall': round(float(di), 4) if di else None,
                    'severity': 'CRITICAL' if di and di < 0.6 else ('HIGH' if di and di < 0.8 else 'PASS'),
                })
    
    return sorted(results, key=lambda x: x.get('di_vs_overall', 1.0))
```

### 7.6 Severity Scorer (`services/analysis/severity_scorer.py`)

**Purpose:** Aggregate all metric results into a single 0-100 fairness score with letter grade.

**Scoring formula:**
```
fairness_score = 100 - weighted_penalty_sum

Penalties:
- DI < 0.6 per attribute: -20 points
- DI 0.6-0.8 per attribute: -10 points
- Equalized Odds FPR gap > 0.1: -8 points per attribute
- Model flip rate > 0.2 per attribute: -12 points
- Feature laundering detected: -15 points
- Proxy variable count: -3 per high-risk proxy (max -15)
- Intersectional CRITICAL violations: -5 per (max -20)

Cap at 0 minimum.
```

**Letter grade:**
- A: 80-100
- B: 65-79
- C: 50-64
- D: 35-49
- F: 0-34

### 7.7 Feature Laundering Detector (`services/analysis/feature_laundering.py`)

**This is the most technically sophisticated module.**

**Purpose:** Detect if a protected attribute has been removed from the feature set but can be reconstructed from the remaining features - indicating the model still has access to the protected information indirectly.

```python
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import LabelEncoder
import pandas as pd
import numpy as np

def detect_feature_laundering(
    df: pd.DataFrame,
    protected_cols: list[str],
    feature_cols: list[str],  # Columns actually used by the model
) -> list[dict]:
    """
    For each protected attribute NOT in feature_cols, train a classifier to
    predict it from feature_cols. If accuracy > threshold, the attribute
    is reconstructable - i.e., it has been laundered, not removed.
    """
    results = []
    
    for protected_col in protected_cols:
        if protected_col in feature_cols:
            continue
        
        if protected_col not in df.columns:
            continue
        
        available_features = [c for c in feature_cols if c in df.columns]
        if len(available_features) == 0:
            continue
        
        X = pd.get_dummies(df[available_features], drop_first=True)
        y = df[protected_col].dropna()
        X = X.loc[y.index]
        
        if y.nunique() < 2:
            continue
        
        le = LabelEncoder()
        y_encoded = le.fit_transform(y)
        
        clf = GradientBoostingClassifier(n_estimators=100, max_depth=3, random_state=42)
        scores = cross_val_score(clf, X, y_encoded, cv=5, scoring='accuracy')
        mean_accuracy = scores.mean()
        
        baseline = (np.bincount(y_encoded).max() / len(y_encoded))
        lift = (mean_accuracy - baseline) / (1 - baseline) if (1 - baseline) > 0 else 0
        
        is_laundered = lift > 0.4
        
        results.append({
            'protected_attribute': protected_col,
            'reconstruction_accuracy': round(float(mean_accuracy), 4),
            'baseline_accuracy': round(float(baseline), 4),
            'lift_over_baseline': round(float(lift), 4),
            'laundering_detected': is_laundered,
            'severity': 'CRITICAL' if lift > 0.6 else ('HIGH' if is_laundered else 'PASS'),
            'explanation': (
                f"Although '{protected_col}' is not in the model's feature set, "
                f"a classifier can predict it from the remaining features with "
                f"{mean_accuracy*100:.1f}% accuracy (vs {baseline*100:.1f}% baseline). "
                f"This means the model implicitly has access to '{protected_col}' through correlated features."
            ) if is_laundered else (
                f"'{protected_col}' does not appear to be reconstructable from the model's features."
            ),
        })
    
    return results
```

### 7.8 Historical Harm Calculator (`services/analysis/historical_harm.py`)

**Purpose:** Estimate the absolute number of people harmed by bias over the model's deployment period.

```python
from datetime import datetime
from dateutil.relativedelta import relativedelta

def calculate_historical_harm(
    deployment_start: datetime,
    monthly_decisions: int,
    di_ratio: float,
    protected_attribute: str,
    unprivileged_group: str,
    group_proportion: float,
) -> dict:
    """
    Formula:
    months_deployed = months between deployment_start and today
    total_decisions = months_deployed * monthly_decisions
    decisions_for_group = total_decisions * group_proportion
    harm_rate = max(0, 1 - di_ratio)
    estimated_harmed = decisions_for_group * harm_rate
    """
    now = datetime.now()
    delta = relativedelta(now, deployment_start)
    months_deployed = delta.years * 12 + delta.months
    
    total_decisions = months_deployed * monthly_decisions
    decisions_for_group = total_decisions * group_proportion
    harm_rate = max(0, (1 - di_ratio))
    estimated_harmed = int(decisions_for_group * harm_rate)
    
    return {
        'months_deployed': months_deployed,
        'total_decisions': total_decisions,
        'decisions_affecting_group': int(decisions_for_group),
        'estimated_individuals_harmed': estimated_harmed,
        'protected_attribute': protected_attribute,
        'unprivileged_group': unprivileged_group,
        'headline': (
            f"Over {months_deployed} months of deployment, approximately "
            f"{estimated_harmed:,} {unprivileged_group} individuals may have received "
            f"unfavorable decisions due to detected bias in {protected_attribute}."
        ),
        'disclaimer': "This is a statistical estimate based on measured bias metrics. Actual impact may vary."
    }
```

### 7.9 Flip Sensitivity Score (`services/analysis/flip_sensitivity.py`)

**Purpose:** For each individual in the dataset, compute how many feature changes are required to flip their model prediction. Low flip count = person is on a decision boundary = vulnerable to arbitrary discrimination.

```python
def compute_flip_sensitivity(model, df: pd.DataFrame, feature_cols: list[str], protected_cols: list[str]) -> dict:
    non_protected_features = [c for c in feature_cols if c not in protected_cols]
    X = df[feature_cols].copy()
    base_preds = model.predict(X)
    flip_counts = []
    
    for i in range(len(df)):
        row_flips = 0
        row = X.iloc[i].copy()
        
        for feat in non_protected_features:
            if pd.api.types.is_numeric_dtype(df[feat]):
                std = df[feat].std()
                for delta in [std, -std]:
                    perturbed = row.copy()
                    perturbed[feat] = row[feat] + delta
                    pred = model.predict(perturbed.values.reshape(1, -1))[0]
                    if pred != base_preds[i]:
                        row_flips += 1
                        break
        
        flip_counts.append(row_flips)
    
    df_result = df.copy()
    df_result['flip_sensitivity'] = flip_counts
    
    return {
        'mean_flip_count': round(float(df_result['flip_sensitivity'].mean()), 2),
        'median_flip_count': round(float(df_result['flip_sensitivity'].median()), 2),
        'most_vulnerable_count': int((df_result['flip_sensitivity'] <= 1).sum()),
        'most_vulnerable_percentage': round(float((df_result['flip_sensitivity'] <= 1).mean() * 100), 2),
        'explanation': (
            f"{int((df_result['flip_sensitivity'] <= 1).sum())} individuals "
            f"({round(float((df_result['flip_sensitivity'] <= 1).mean() * 100), 1)}% of the dataset) "
            f"are on the decision boundary - a single feature change flips their outcome."
        )
    }
```

---

## 8. Phase 5 - Gemini AI Integration Layer

### 8.1 Setup Vertex AI

**Developer setup instructions:**
1. Go to https://console.cloud.google.com/vertex-ai
2. Enable the Vertex AI API for your project
3. Create a Service Account: IAM -> Service Accounts -> Create
   - Name: `visionai-gemini-sa`
   - Roles: `Vertex AI User`, `Storage Object Viewer`
4. Download the JSON key file
5. Set environment variable: `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`
6. In Cloud Run, use Workload Identity instead of key files (see Phase 10)

**Install:** `pip install google-cloud-aiplatform`

```python
import vertexai
from vertexai.generative_models import GenerativeModel

vertexai.init(project=os.environ["GCP_PROJECT_ID"], location="us-central1")
model = GenerativeModel("gemini-1.5-pro")
```

### 8.2 Narrative Generator (`services/gemini/narrative_generator.py`)

**Purpose:** Convert all numeric bias findings into plain-English narratives, customized per stakeholder type.

```python
async def generate_audit_narrative(audit_results: dict, domain: str, stakeholder_type: str) -> str:
    
    SYSTEM_PROMPTS = {
        'technical': """You are a senior ML fairness engineer writing an internal audit report.
        Use precise statistical language. Reference specific metrics (DI ratios, SHAP values, p-values).
        Be specific about which features, groups, and magnitudes are involved.
        Output structured markdown with sections for each finding.""",
        
        'executive': """You are a chief risk officer writing a 1-page summary for the board.
        Translate all technical findings into business risk language.
        Use concrete impact numbers (people affected, legal risk, reputational risk).
        Output exactly 3 bullet points: Key Finding, Business Risk, Recommended Action.
        Give a letter grade (A-F) for overall fairness. Be concise and decisive.""",
        
        'legal': """You are a compliance lawyer writing for a regulatory audit file.
        Map each finding to specific legal regulations.
        Reference EU AI Act articles, US EEOC guidelines, and Indian IT Act provisions where relevant.
        Structure as: Finding -> Applicable Regulation -> Liability Assessment -> Required Action.
        Use formal legal language.""",
    }
    
    findings_summary = format_findings_for_gemini(audit_results)
    
    prompt = f"""
    Domain: {domain}
    
    Audit Findings:
    {findings_summary}
    
    Write an audit narrative for the above findings. Be specific, use the actual numbers.
    """
    
    response = await model.generate_content_async(
        [prompt],
        generation_config={"temperature": 0.2, "max_output_tokens": 2048},
        system_instruction=SYSTEM_PROMPTS[stakeholder_type],
    )
    
    return response.text
```

### 8.3 Blind Spot Detector (`services/gemini/blind_spot_detector.py`)

**Purpose:** Send dataset column names and domain to Gemini. Ask it to identify protected attributes the user has NOT checked yet. The system audits its own blind spots.

```python
async def detect_blind_spots(
    column_names: list[str],
    domain: str,
    already_flagged: list[str],
    sample_values_per_col: dict[str, list],
) -> list[dict]:
    
    prompt = f"""
    You are an AI fairness expert auditing a machine learning dataset.
    
    Domain: {domain}
    Dataset columns: {column_names}
    Sample values per column: {sample_values_per_col}
    Already flagged as protected attributes: {already_flagged}
    
    Analyze the dataset columns and identify any additional columns that:
    1. Could serve as proxies for protected characteristics (race, gender, age, religion, national origin, disability)
    2. Have historically been used as discrimination vectors in {domain} contexts
    3. Represent sensitive personal characteristics not yet flagged
    
    For each blind spot you identify, explain:
    - Which column
    - What protected characteristic it may encode
    - Why this matters in a {domain} context
    - Your confidence level (HIGH/MEDIUM/LOW)
    
    Return ONLY a JSON array with no other text:
    [
      {{
        "column": "zip_code",
        "encodes": "race/socioeconomic status",
        "reason": "Zip codes in urban areas are heavily correlated with race due to historical redlining patterns",
        "confidence": "HIGH"
      }}
    ]
    """
    
    response = await model.generate_content_async(
        [prompt],
        generation_config={"temperature": 0.1, "max_output_tokens": 1024},
    )
    
    import json
    try:
        blind_spots = json.loads(response.text.strip())
        return [bs for bs in blind_spots if bs.get('column') not in already_flagged]
    except json.JSONDecodeError:
        return []
```

### 8.4 Stakeholder Mode Formatter

Three separate Gemini calls - one per stakeholder type. Results stored in Firestore under `audits/{id}/narratives/{type}`. Cache all generated narratives - check Firestore before calling Gemini. Use `temperature=0.2` for consistency.

---

## 9. Phase 6 - Outputs & Reporting

### 9.1 Visual Dashboard Tabs

#### Tab 1: Overview
- Giant fairness score donut (Recharts `RadialBarChart`)
- Letter grade with color background
- 4 metric summary cards: Disparate Impact (worst), Equalized Odds (worst), Proxy Variables Found, Feature Laundering Detected
- Stakeholder mode toggle (Technical / Executive / Legal)
- Narrative panel: rendered Gemini markdown
- Historical Harm card (if deployment data was provided): red-bordered card with estimated harm number

#### Tab 2: Data Analysis
- **Group Distribution chart:** Recharts `BarChart` showing count per group for each protected attribute
- **Label distribution per group:** Grouped bar chart showing positive/negative outcome rate per group
- **Disparate Impact table:** rows = protected attributes, columns = [Group, DI Ratio, SPD, Verdict, Severity]
- **Proxy variable network graph:** D3.js force-directed graph. Nodes = columns, edges = correlation strength. Red edges = high-risk proxies. Node size = correlation strength. Clickable nodes show explanation tooltip.

**Proxy network D3 implementation notes:**
```typescript
// components/charts/ProxyNetworkGraph.tsx
// Use d3-force simulation with forceLink, forceManyBody, forceCenter
// Nodes: { id: colName, type: 'protected' | 'proxy' | 'safe' }
// Links: { source, target, strength, riskLevel }
// Color: protected = red (#dc2626), proxy = amber (#d97706), safe = gray (#6b7280)
// On node click: show tooltip panel on the right with full proxy explanation
// Drag nodes: enable d3 drag behavior for interactivity
```

#### Tab 3: Model Analysis
- **Flip rate table:** Per protected attribute, show flip rates for each value-pair transition
- **Equalized Odds chart:** Grouped bar chart - FPR and FNR side by side per group
- **Predictive parity chart:** Precision per group
- **Adversarial Simulator:** (see Phase 7 Section 10.2)

#### Tab 4: Explainability
- **SHAP Summary Plot:** Recharts horizontal bar chart - mean absolute SHAP per feature, stacked by group
- **Feature Disparity Flags:** Table of features where SHAP disparity ratio > 2x between groups, with plain-English explanation
- **Feature Laundering Results:** For each protected attribute: reconstruction accuracy, baseline, lift, verdict badge, list of implicated features

#### Tab 5: Intersectional Heatmap
- Custom SVG heatmap rendered with D3
- Rows = Group A values, Columns = Group B values
- Cell color = severity (green > 0.8, amber 0.6-0.8, red < 0.6)
- Cell text = DI value
- Dropdown to select which pair of protected attributes to display
- Click cell -> side panel shows full metrics for that intersection

#### Tab 6: Fixes
- For each identified bias issue, show a fix recommendation card:
  - Issue title + severity badge
  - Recommended technique (Reweighting / Threshold adjustment / SMOTE / Feature removal)
  - Projected fairness improvement percentage
  - Estimated accuracy impact
  - Code snippet (collapsible)
- **Fairness vs Accuracy Pareto Frontier:**
  - X axis: Model Accuracy (%)
  - Y axis: Fairness Score (0-100)
  - Scatter points: one per threshold value (0.1 to 0.9)
  - Interactive slider to select threshold
  - Selected point highlighted with stats shown

#### Tab 7: Legal
- Full Regulation Mapper output (see Section 9.2)
- Compliance export button (JSON)
- Audit trail timeline
- Whistleblower export button

### 9.2 Regulation Mapper (`services/compliance/regulation_mapper.py`)

Map each metric violation to specific legal clauses:

```python
REGULATION_MAP = {
    'disparate_impact_below_0.8': [
        {
            'regulation': 'US EEOC Uniform Guidelines',
            'clause': '29 CFR § 1607.4(D) - Four-Fifths Rule',
            'description': 'A selection rate less than 4/5ths (80%) of the highest group rate is considered evidence of adverse impact.',
            'liability': 'HIGH - Federal employment discrimination claim risk',
            'required_action': 'Demonstrate business necessity or eliminate the adverse impact.',
        },
        {
            'regulation': 'EU AI Act (2024)',
            'clause': 'Article 10 - Data and Data Governance',
            'description': 'High-risk AI systems must use training data free of errors accounting for characteristics that could lead to discrimination.',
            'liability': 'HIGH - Up to EUR 30M or 6% of global turnover fine',
            'required_action': 'Document data governance practices and mitigation measures.',
        },
    ],
    'feature_laundering_detected': [
        {
            'regulation': 'EU AI Act (2024)',
            'clause': 'Article 13 - Transparency and Provision of Information',
            'description': 'High-risk AI systems shall be designed to allow identification of protected characteristics that may influence outcomes.',
            'liability': 'CRITICAL - Intentional obfuscation may constitute fraud',
            'required_action': 'Remove all proxy features that reconstruct protected attributes.',
        },
        {
            'regulation': 'US Fair Housing Act',
            'clause': '42 U.S.C. § 3604 - Prohibited Housing Practices',
            'description': 'Use of proxies to discriminate constitutes a violation equivalent to direct discrimination.',
            'liability': 'CRITICAL - Civil penalty up to $100,000 per violation',
            'required_action': 'Immediate remediation required. Consult legal counsel.',
        },
    ],
    'equalized_odds_violation': [
        {
            'regulation': 'EU AI Act (2024)',
            'clause': 'Article 9 - Risk Management System',
            'description': 'Providers of high-risk AI systems shall establish a risk management system covering testing for bias and discriminatory outcomes.',
            'liability': 'MEDIUM - Regulatory scrutiny, audit requirement',
            'required_action': 'Implement ongoing monitoring and bias testing protocols.',
        },
    ],
}
```

Add additional entries for: India IT Act 2000, India Personal Data Protection Bill (DPDP Act 2023), GDPR Article 22 (automated decision-making), UK Equality Act 2010.

### 9.3 PDF Audit Report

Generate downloadable PDF using Puppeteer (Node.js):

```bash
npm install puppeteer
```

Report structure:
1. Cover page: VisionAI logo, Org name, Audit name, Date, Overall Fairness Score
2. Executive Summary (1 page): Letter grade, top 3 findings, business risk
3. Data Analysis section
4. Model Analysis section
5. Legal & Compliance section: Regulation mapper output
6. Recommendations section
7. Technical Appendix: Full metric tables

Use `satori` + `sharp` to render React chart components to PNG for PDF embedding.

---

## 10. Phase 7 - Advanced & Innovative Features

### 10.1 Stakeholder Mode (`components/audit/StakeholderToggle.tsx`)

Three-way toggle at the top of audit results:
```
[ Technical ] [ Executive ] [ Legal ]
```

On toggle change:
- Narrative panel switches to pre-generated Gemini narrative for that type
- Metric cards change language: Technical shows "DI Ratio: 0.71", Executive shows "Fairness Risk: HIGH", Legal shows "EEOC §1607.4(D) Violation"
- Executive mode hides the Explainability tab, shows a simplified 1-pager
- All three narratives generated once during audit and stored in Firestore

### 10.2 Adversarial Applicant Simulator

Located in Tab 3 (Model Analysis).

**UI:**
- Form pre-populated with a sample row from the dataset
- User can edit any field value
- "Check Decision" button -> calls `POST /api/audits/{id}/predict` -> shows prediction result
- "Find Minimum Flip" button -> calls `POST /api/audits/{id}/minimum-flip` with current values
- Backend runs greedy search: for each non-protected feature, try perturbations, return minimum set that flips prediction
- Show side-by-side comparison: "Current profile" vs "Accepted profile" with changed fields highlighted green

### 10.3 "Explain My Rejection" Mode

Public URL (no auth required): `https://visionai.app/explain/{auditId}/{rowIndex}`

Consumer-facing page:
- Simple, no technical jargon
- "Based on our analysis of the automated decision system used by [Org Name]..."
- Which features influenced the decision (plain English from SHAP)
- Counterfactual: "If your [feature] were [value], the outcome may have been different"
- Whether their demographic group faced systemic bias

Org must explicitly enable this in Settings. When enabled, org receives a shareable explanation URL template.

### 10.4 Bias Red Team Mode

"Red Team" button on audit results page. Triggers `POST /api/audits/{id}/red-team`.

Backend runs:
1. Grid search across all threshold values (0.1 to 0.9)
2. Grid search across all demographic slice combinations
3. Compute fairness metrics for each combination
4. Return worst-case scenario found

Output: "Worst case found: At threshold 0.52, Black female applicants aged 25-35 face a DI of 0.41 - the most discriminated-against configuration in your model."

Frontend: highlighted "WORST CASE SCENARIO" card with red border at the top of the results page.

### 10.5 Whistleblower Export

Button in Legal tab: "Export Anonymized Report"

Generates report with:
- All org-identifying information stripped (org name -> "Company A")
- All statistical findings preserved exactly
- SHA-256 hash of full audit results as integrity token in report footer
- Timestamp of generation
- Note: "This report was generated by VisionAI's automated fairness audit system. Organization identity has been anonymized per whistleblower protection principles."
- Download as PDF

### 10.6 Sector Benchmarking

Aggregate anonymized fairness scores across all audits (opt-in only).

BigQuery table `sector_benchmarks`:
```sql
CREATE TABLE visionai_analytics.sector_benchmarks (
  audit_date TIMESTAMP,
  domain STRING,
  fairness_score FLOAT64,
  di_worst FLOAT64,
  has_model BOOL,
  row_count INT64,
  opt_in BOOL
);
```

On audit results page, show benchmarking card:
"Your model's fairness score of 58 is lower than 73% of [domain] models audited on VisionAI."

Query BigQuery on audit completion to compute percentile rank. Only insert rows if org has `settings.benchmarking_opt_in === true`.

### 10.7 Historical Harm Calculator - Frontend

In the Overview tab, if deployment duration was provided:
- Large red-bordered card
- Headline number: estimated individuals harmed (formatted with commas, e.g., "3,400")
- Subtext: "Based on [X] months of deployment at [Y] decisions/month"
- Small disclaimer text
- "Copy for presentation" button: copies formatted stat to clipboard

### 10.8 Model Comparison Mode

In the Dashboard, allow uploading two audits for comparison:
- Select Audit A and Audit B from dropdowns (must be same domain)
- Show side-by-side fairness score, DI ratio, equalized odds for each
- Highlight which metrics improved and which worsened
- Summary: "Retraining improved accuracy by 3% but worsened fairness for Female applicants by 12 points"

### 10.9 Bias Origin Tracer

After detecting model bias, VisionAI runs the same bias metrics on the raw training data and compares:

- If bias in data >= bias in model: "Bias was present in training data and the model learned it"
- If bias in model > bias in data: "Bias was amplified by the model architecture beyond what existed in the data"

These require different fixes and the distinction is shown prominently in the Fixes tab.

---

## 11. Phase 8 - CI/CD Integration & Action Layer

### 11.1 VisionAI CI/CD API

**Endpoint:** `POST /api/cicd/audit-gate`

**Auth:** API key (generated per org in Settings -> API Keys)

**Request:**
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

**Response:**
- HTTP 200 + `{ status: "PASS", fairness_score: 78, ... }` on pass
- HTTP 422 + `{ status: "FAIL", violations: [...], ... }` on fail (so CI pipeline breaks the build)

### 11.2 GitHub Actions Example

Provide at `/examples/github-action.yml`:

```yaml
name: VisionAI Fairness Gate
on: [pull_request]
jobs:
  fairness-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run VisionAI Fairness Audit
        run: |
          response=$(curl -s -w "\n%{http_code}" -X POST \
            https://api.visionai.app/api/cicd/audit-gate \
            -H "Content-Type: application/json" \
            -d '{
              "api_key": "${{ secrets.VISIONAI_API_KEY }}",
              "dataset_gcs_path": "gs://your-bucket/test_data.csv",
              "model_gcs_path": "gs://your-bucket/model.pkl",
              "context": {
                "domain": "hiring",
                "label_col": "hired",
                "positive_label": "1",
                "protected_cols": ["gender", "race"],
                "fairness_threshold": 0.8
              }
            }')
          http_code=$(echo "$response" | tail -n1)
          body=$(echo "$response" | head -n-1)
          echo "$body"
          if [ "$http_code" != "200" ]; then
            echo "Fairness audit FAILED. Blocking deployment."
            exit 1
          fi
```

---

## 12. Phase 9 - Bias Drift Monitor

### 12.1 Overview

Organizations upload new production data batches periodically. VisionAI recomputes fairness metrics and plots them on a timeline. Target turnaround: < 2 minutes per batch (run only core metrics, skip SHAP for speed).

### 12.2 Drift Upload Flow

Page: `/drift`

UI:
- Full-width timeline chart at top
- "Upload new batch" button -> opens drawer with file upload + date of data collection + notes
- Timeline shows all historical batches as clickable points

Backend: `POST /api/drift/upload` -> upload to GCS -> trigger lightweight analysis job (DI, SPD, equalized odds only) -> write to BigQuery `drift_metrics` table -> update Firestore for real-time UI.

### 12.3 Drift Timeline Chart (`components/charts/DriftTimeline.tsx`)

Recharts `LineChart`:
- X axis: batch upload dates
- Y axis left: Fairness Score (0-100)
- Y axis right: DI Ratio (0-1.5)
- Multiple lines: one per protected attribute's DI ratio
- Dashed red horizontal line at DI = 0.8
- Tooltip on hover: all metrics for that batch date
- Clickable points: open that batch's full audit results

**Alert logic:** If DI drops below 0.8 in latest batch:
- Red banner at top of drift page
- Firestore notification document written -> bell badge in TopNav
- If org has email notifications: trigger Cloud Function -> SendGrid email

### 12.4 BigQuery Drift Storage

```sql
CREATE TABLE visionai_analytics.drift_metrics (
  org_id STRING,
  audit_id STRING,
  batch_date TIMESTAMP,
  upload_date TIMESTAMP,
  protected_attribute STRING,
  di_ratio FLOAT64,
  spd FLOAT64,
  fairness_score FLOAT64,
  row_count INT64
);
```

---

## 13. Phase 10 - Infrastructure, Scaling & GCP Config

### 13.1 Google Cloud Project Setup

**Developer setup - run these commands in order:**

```bash
# Install Google Cloud CLI from https://cloud.google.com/sdk/docs/install

gcloud auth login
gcloud projects create visionai-prod --name="VisionAI"
gcloud config set project visionai-prod

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  cloudtasks.googleapis.com \
  storage.googleapis.com \
  firestore.googleapis.com \
  aiplatform.googleapis.com \
  bigquery.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com
```

### 13.2 Cloud Run - FastAPI Backend

**`infra/cloudrun.yaml`:**
```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: visionai-api
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"
        autoscaling.knative.dev/maxScale: "20"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containerConcurrency: 80
      timeoutSeconds: 300
      containers:
        - image: gcr.io/visionai-prod/visionai-api:latest
          resources:
            limits:
              cpu: "2"
              memory: "4Gi"
```

**Deploy:**
```bash
gcloud run deploy visionai-api \
  --source ./backend \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --service-account visionai-api-sa@visionai-prod.iam.gserviceaccount.com
```

### 13.3 Cloud Run Jobs - ML Worker

`worker/Dockerfile`:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "job.py"]
```

`worker/requirements.txt`:
```
pandas==2.2.0
numpy==1.26.4
scikit-learn==1.4.0
shap==0.44.0
scipy==1.12.0
aif360==0.6.1
dice-ml==0.11
onnxruntime==1.17.0
joblib==1.3.2
google-cloud-firestore==2.14.0
google-cloud-storage==2.14.0
google-cloud-aiplatform==1.42.1
google-cloud-bigquery==3.17.2
httpx==0.26.0
python-dateutil==2.9.0
```

**Dispatch from API:**
```python
from google.cloud import tasks_v2

def dispatch_analysis_job(audit_id: str, config: dict):
    client = tasks_v2.CloudTasksClient()
    queue_path = client.queue_path(PROJECT_ID, REGION, "visionai-analysis-queue")
    task = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": f"https://{WORKER_URL}/run",
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"audit_id": audit_id, "config": config}).encode(),
            "oidc_token": {"service_account_email": WORKER_SA_EMAIL},
        }
    }
    client.create_task(request={"parent": queue_path, "task": task})
```

### 13.4 Firestore Structure

```
organizations/{orgId}
  - name: string
  - industry: string
  - ownerId: string
  - members: string[]
  - settings: { benchmarking_opt_in, email_notifications, explain_my_rejection_enabled }

audits/{auditId}
  - org_id: string
  - name: string
  - domain: string
  - status: PENDING | PROCESSING | COMPLETE | FAILED
  - created_at: timestamp
  - config: { label_col, positive_label, protected_cols, fairness_threshold, ... }
  - progress_steps: { schema_parsing, proxy_detection, ... } each: pending|running|complete|failed
  - results: { fairness_score, letter_grade, data_bias, model_bias, explainability,
               intersectional, feature_laundering, flip_sensitivity, historical_harm,
               regulation_map, proxy_variables, blind_spots }
  - narratives: { technical, executive, legal }
  - files: { dataset_gcs_path, model_gcs_path }
```

### 13.5 Security Rules

**`infra/firestore.rules`:**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /organizations/{orgId} {
      allow read, write: if request.auth != null 
        && request.auth.uid in resource.data.members;
    }
    match /audits/{auditId} {
      allow read: if request.auth != null 
        && exists(/databases/$(database)/documents/organizations/$(resource.data.org_id))
        && request.auth.uid in get(/databases/$(database)/documents/organizations/$(resource.data.org_id)).data.members;
      allow write: if false;  // Only backend writes audits
    }
  }
}
```

**API Key security:**
- Store only SHA-256 hash in Firestore - never plaintext
- Keys shown to user only once on creation
- Prefix: `vai_live_` production, `vai_test_` test
- Validate: `hashlib.sha256(key.encode()).hexdigest()`

### 13.6 Scalability Decisions

Document these decisions in code comments:

1. **Analysis pipeline parallelization:** After preprocessing completes, run data_bias_scan, model_evaluation, explainability as concurrent tasks using `asyncio.gather()`. Reduces total time ~60%.

2. **Large dataset sampling:** For SHAP: sample 100,000 rows max (full computation too slow). For DI/SPD metrics: always use full dataset. Log warning in audit metadata if sampled.

3. **Firestore write optimization:** Batch all progress step updates into a single `update()` call every 10 seconds rather than per-step writes.

4. **Gemini caching:** Check Firestore for existing narrative before calling Gemini. Never regenerate on page load.

5. **Cloud Tasks for decoupling:** API returns `{ audit_id, status: 'PROCESSING' }` immediately. Frontend uses Firestore real-time listener (`onSnapshot`) for progress updates. Never poll the API.

6. **Model file handling:** Pickle/joblib: load normally. ONNX: use `onnxruntime.InferenceSession()`. Files >500MB: stream from GCS rather than loading into RAM.

---

## 14. Data Models

### 14.1 TypeScript Types (`frontend/lib/types.ts`)

```typescript
export type AuditStatus = 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS';
export type LetterGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type StakeholderMode = 'technical' | 'executive' | 'legal';

export interface Audit {
  id: string;
  orgId: string;
  name: string;
  domain: string;
  status: AuditStatus;
  createdAt: Date;
  completedAt?: Date;
  config: AuditConfig;
  progressSteps: Record<string, 'pending' | 'running' | 'complete' | 'failed'>;
  results?: AuditResults;
  narratives?: Record<StakeholderMode, string>;
}

export interface AuditConfig {
  labelCol: string;
  positiveLabel: string;
  protectedCols: string[];
  fairnessThreshold: number;
  deploymentStart?: Date;
  monthlyDecisions?: number;
}

export interface AuditResults {
  fairnessScore: number;
  letterGrade: LetterGrade;
  dataBias: Record<string, DataBiasResult>;
  modelBias?: ModelBiasResult;
  explainability?: ExplainabilityResult;
  intersectional: IntersectionalResult[];
  featureLaundering: LaunderingResult[];
  flipSensitivity?: FlipSensitivityResult;
  historicalHarm?: HistoricalHarmResult;
  regulationMap: RegulationFinding[];
  proxyVariables: ProxyWarning[];
  blindSpots: BlindSpotResult[];
}

export interface DataBiasResult {
  attribute: string;
  privilegedGroup: string;
  metrics: {
    disparateImpact: number;
    statisticalParityDifference: number;
    positiveRatePrivileged: number;
    positiveRateUnprivileged: number;
  };
  verdict: 'PASS' | 'FAIL';
  severity: SeverityLevel;
  explanation: string;
}

export interface RegulationFinding {
  finding: string;
  regulation: string;
  clause: string;
  description: string;
  liability: string;
  required_action: string;
}

export interface ProxyWarning {
  proxyColumn: string;
  protectedColumn: string;
  associationScore: number;
  method: string;
  riskLevel: 'HIGH' | 'MEDIUM';
  explanation: string;
}

export interface BlindSpotResult {
  column: string;
  encodes: string;
  reason: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}
```

---

## 15. API Reference

```
POST   /api/uploads/signed-url          Generate GCS signed URL for direct upload
POST   /api/uploads/confirm             Confirm upload, trigger preprocessing
POST   /api/audits                      Create new audit + dispatch analysis job
GET    /api/audits/{id}                 Get audit status + results
GET    /api/audits/{id}/narrative       Get Gemini narrative for stakeholder type (?type=technical|executive|legal)
POST   /api/audits/{id}/predict         Run a single row through the model
POST   /api/audits/{id}/minimum-flip    Find minimum feature changes to flip prediction
POST   /api/audits/{id}/red-team        Run adversarial worst-case search
GET    /api/audits/{id}/export/pdf      Download PDF audit report
GET    /api/audits/{id}/export/legal    Download legal compliance JSON
GET    /api/audits/{id}/export/anon     Download anonymized whistleblower report
POST   /api/drift/upload                Upload new data batch for drift tracking
GET    /api/drift/{orgId}               Get full drift history for org
POST   /api/cicd/audit-gate             CI/CD integration endpoint
GET    /api/benchmarks/{domain}         Get sector benchmarking data
```

---

## 16. Environment Variables

### Frontend (`.env.local`)
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_API_BASE_URL=https://your-cloudrun-url.run.app
```

### Backend (injected via Secret Manager at Cloud Run deploy time)
```
GCP_PROJECT_ID=visionai-prod
GCP_REGION=asia-south1
GCS_BUCKET_NAME=visionai-uploads-visionai-prod
FIRESTORE_DATABASE=(default)
BIGQUERY_DATASET=visionai_analytics
VERTEX_AI_LOCATION=us-central1
GEMINI_MODEL=gemini-1.5-pro
WORKER_URL=https://visionai-worker-xxxx.run.app
WORKER_SA_EMAIL=visionai-worker-sa@visionai-prod.iam.gserviceaccount.com
CLOUD_TASKS_QUEUE=visionai-analysis-queue
GOOGLE_APPLICATION_CREDENTIALS=/secrets/service-account.json
```

**Store secrets in Secret Manager:**
```bash
echo -n "your-secret-value" | gcloud secrets create GEMINI_API_KEY --data-file=-
gcloud run deploy visionai-api --update-secrets=GEMINI_API_KEY=GEMINI_API_KEY:latest
```

---

## Implementation Order

Build in this strict sequence to always have a demoable state at each milestone:

| Step | Feature | Demoable? |
|------|---------|-----------|
| 1 | Frontend shell, routing, mock data | Yes - full UI visible |
| 2 | Firebase Auth + org creation | Yes - auth flow |
| 3 | GCS upload + schema parser | Yes - show column detection |
| 4 | Data bias scanner + dashboard wired | **MVP - submit after this** |
| 5 | Proxy detector + network graph | Yes |
| 6 | Model evaluator (perturbation testing) | Yes |
| 7 | Gemini narrative + blind spot detection | Yes - impressive demo |
| 8 | Stakeholder mode toggle | Yes |
| 9 | Intersectional heatmap | Yes |
| 10 | SHAP + explainability | Yes |
| 11 | Feature laundering detector | Yes - most impressive |
| 12 | Regulation mapper + legal tab | Yes |
| 13 | Historical harm calculator | Yes - most emotionally impactful |
| 14 | Drift monitor | Yes |
| 15 | PDF report generation | Yes |
| 16 | CI/CD API endpoint | Yes |
| 17 | Red team, whistleblower, adversarial simulator | Yes |
| 18 | Sector benchmarking, model comparison, bias origin tracer | Yes |

At step 4, you have a fully functional and demoable MVP for the April 24 submission deadline.

---

## 17. More Features

As development has progressed beyond the initial planning phases, several advanced capabilities have been implemented into the production environment. These features significantly enhance the platform's ability to handle edge cases, automate compliance, and integrate directly into ML engineering workflows.

### 17.1 Generative Shadow Testing
**Problem:** Statistical fairness metrics often fail when a dataset lacks sufficient representation for specific demographic intersections (e.g., zero or very few applicants who are *Native American + Female*).
**Solution:** Generative Shadow Testing uses Gemini 1.5 Pro to synthesize "shadow profiles."
- **Baseline Generation:** Creates a highly qualified domain baseline.
- **Synthetic Profiles:** Generates realistic, plausible applicant profiles for missing intersections by sampling from the baseline while adjusting demographic anchors.
- **Evaluation:** Runs the live model against the synthetic shadow profiles and compares the approval rate to the baseline positive rate to compute a Zero-Shot Disparate Impact (DI) score.

### 17.2 Justified Bias API
**Problem:** Not all statistical bias is illegal or unethical. For instance, a medical triage model might correctly flag older patients as higher risk for certain age-related conditions, which is clinically justified.
**Solution:** The Justified Bias pipeline automatically reviews statistical disparities flagged by the Fairness Engine.
- Uses Gemini to analyze the context of the domain, the specific feature, and the outcome.
- Classifies whether the bias is an artifact of historical discrimination or a valid, justified business/domain necessity.
- Surfaces a "Justified Bias" status to prevent false-alarm fatigue for compliance teams.

### 17.3 CI/CD Audit Gate Integration
**Problem:** ML teams need to prevent biased models from reaching production automatically, without manual dashboard reviews.
**Solution:** The CI/CD Fairness Gate (`/api/cicd/audit-gate`).
- Provides a fairness gate that can be embedded in GitHub Actions, GitLab CI, or Jenkins.
- Uploads the model and a test dataset, evaluates against the organization's pre-defined fairness thresholds (e.g., DI >= 0.8), and returns a hard pass/fail payload.
- Automatically fails the deployment pipeline if critical bias or proxy features are detected.

### 17.4 VisionAI Python SDK
**Problem:** Integrating with REST APIs is brittle for data scientists working in Python environments (Jupyter, Airflow, MLflow).
**Solution:** A dedicated Python client library (`visionai-sdk`).
- Allows data scientists to trigger audits, upload datasets, and push models directly from their Python code.
- Seamlessly integrates with the CI/CD API Gate for automated pipeline blocking.
- Supports polling for asynchronous audit results and fetching detailed regulatory summaries.
### 17.5 Dynamic Regulatory Sync Engine
**Problem:** AI laws and algorithmic fairness regulations are passing rapidly across different jurisdictions (e.g., EU AI Act, Colorado SB24-205). Compliance teams cannot manually track all legal thresholds.
**Solution:** The Regulatory Sync Engine (`sync_engine.py`).
- A background cron job that uses Gemini 1.5 Pro to autonomously search for new AI regulations globally.
- Parses legal texts to extract key fairness thresholds (e.g., "disparate impact < 0.85") and protected classes.
- Stores the regulations in Firestore and automatically generates compliance alerts/action items for affected organizations.

### 17.6 Follow-up Audit Chatbot
**Problem:** Executive and legal stakeholders often have specific questions about an audit that aren't covered in the static report.
**Solution:** An interactive LLM-powered chatbot (`chatbot.py`).
- Allows users to interrogate the specific context of their audit results.
- Dynamically adjusts its tone based on the active stakeholder mode (Technical, Executive, Legal).
- Features a highly resilient triple-fallback LLM architecture: attempts to use a dedicated Gemini Bias key, falls back to a primary Gemini key, and finally falls back to Groq (Llama-3 70b) if Google services are unavailable.

*VisionAI PRD v1.0 - Google Solutions Challenge 2026 - Build with AI*
