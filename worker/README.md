# VisionAI Worker

Cloud Run Job scaffold for PRD Phase 10.

Current job kind:

- `infrastructure_smoke`: initializes Firebase Admin with Cloud Run credentials and writes a short log line.

Future job kinds:

- `analysis`: move the heavy audit pipeline out of FastAPI background tasks.
- `regulatory_sync`: run the weekly Gemini-backed regulatory catalog sync.

Build this image from the repository root so the Dockerfile can copy both `backend/` and `worker/`.
