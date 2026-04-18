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

4. Open `http://localhost:3000`.

## Scripts

- `npm run dev`: start development server
- `npm run build`: production build plus type checks
- `npm run start`: run production server
- `npm run lint`: run eslint

## Key Routes

- `/dashboard`: audit summary and recent runs
- `/audit/new`: 3-step audit launch flow
- `/audit/[auditId]`: audit results tabs and reporting outputs
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
  - Audit trail timeline rendering

## API Expectations

Frontend expects the backend to expose:

- `GET /api/audits/{id}`
- `GET /api/audits/{id}/pareto`
- `GET /api/audits/{id}/export/pdf`
- `GET /api/audits/{id}/export/legal`
- `GET /api/audits/{id}/export/anon`

## Notes

- Charts use Recharts and D3.
- Most pages render from backend-provided audit payloads; empty states are handled for data-only audits.
