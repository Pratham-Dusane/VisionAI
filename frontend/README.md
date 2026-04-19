# VisionAI Frontend

VisionAI frontend is a Next.js 16 App Router application for fairness observability.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables in `.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

3. Start dev server:

```bash
npm run dev
```

`npm run dev` now uses webpack + disabled source maps for lower local CPU/RAM pressure.

If you want max speed and your machine can handle it:

```bash
npm run dev:turbo
```

4. Open `http://localhost:3000`.

## Scripts

- `npm run dev`: start development server
- `npm run dev:turbo`: start dev server with Turbopack (higher resource usage)
- `npm run build`: production build plus type checks
- `npm run start`: run production server
- `npm run lint`: run eslint

## Key Routes

- `/dashboard`: audit summary and recent runs
- `/audit/new`: 3-step audit launch flow
- `/audit/[auditId]`: audit results tabs and reporting outputs
- `/explain/[auditId]/[rowIndex]`: public explain-my-rejection page (when enabled)
- `/reports`: reporting overview
- `/settings`: organization and configuration settings

## Phase 6 Outputs Included

- Data analysis visualizations:
  - Group distribution chart
  - Label distribution chart
  - Proxy network graph
- Model analysis visualizations:
  - Equalized odds chart
  - Predictive parity chart
- Explainability visualizations:
  - SHAP summary chart
- Intersectional outputs:
  - Interactive heatmap
- Fixes outputs:
  - Recommendations with code snippets
  - Fairness vs accuracy Pareto frontier
- Legal outputs:
  - Compliance export trigger (JSON)
  - Anonymized whistleblower report export (PDF)
  - Audit trail timeline rendering

## Phase 7 Outputs Included

- Stakeholder mode toggle at top of audit results:
  - Technical mode
  - Executive mode (hides Explainability tab and shows one-pager framing)
  - Legal mode
- Adversarial Applicant Simulator in Model Analysis:
  - Sample-row form prefill
  - Decision check API trigger
  - Minimum-flip counterfactual search with side-by-side profile diff
- Bias Red Team mode:
  - Header trigger button
  - Worst-case scenario card rendering
- Explain My Rejection:
  - Public explanation route
  - Controlled by org settings toggle
- Sector benchmarking card in Overview
- Model comparison mode on Dashboard
- Bias origin tracer in Fixes tab

## Phase 8 Outputs Included

- Settings page API key management UI:
  - Generate API key from UI
  - View masked key inventory
  - Revoke active keys
  - Copy newly generated key (one-time reveal)
- CI/CD fairness gate backend integration:
  - Endpoint `POST /api/cicd/audit-gate`
  - PASS response on acceptable fairness
  - FAIL response with HTTP 422 and violations for build blocking

## API Expectations

Frontend expects the backend to expose:

- `GET /api/audits/{id}`
- `GET /api/audits/{id}/pareto`
- `GET /api/audits/{id}/export/pdf`
- `GET /api/audits/{id}/export/legal`
- `GET /api/audits/{id}/export/anon`
- `GET /api/audits/{id}/sample-row`
- `POST /api/audits/{id}/predict`
- `POST /api/audits/{id}/minimum-flip`
- `POST /api/audits/{id}/red-team`
- `GET /api/audits/{id}/explain/{rowIndex}`
- `GET /api/benchmarks/{domain}`
- `GET /api/orgs/{orgId}/settings`
- `PUT /api/orgs/{orgId}/settings`
- `GET /api/orgs/{orgId}/api-keys`
- `POST /api/orgs/{orgId}/api-keys`
- `DELETE /api/orgs/{orgId}/api-keys/{keyId}`
- `POST /api/cicd/audit-gate`

Settings payload compatibility:
- Backend accepts both `explain_rejection_enabled` and `explain_my_rejection_enabled` on update.
- Backend returns `explain_my_rejection_enabled` for compatibility while persisting canonical `explain_rejection_enabled`.

## Notes

- Charts use Recharts and D3.
- Most pages render from backend-provided audit payloads; empty states are handled for data-only audits.
