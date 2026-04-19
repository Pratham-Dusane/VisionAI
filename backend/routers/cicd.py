from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from firebase_admin import firestore

from services.analysis.cicd_gate import run_cicd_audit_gate
from services.org_settings import authenticate_org_api_key


router = APIRouter()


class AuditGateContext(BaseModel):
    domain: str = "other"
    label_col: str
    positive_label: str
    protected_cols: list[str]
    fairness_threshold: float = Field(default=0.8, gt=0, le=1)


class AuditGateRequest(BaseModel):
    api_key: str
    dataset_gcs_path: str
    model_gcs_path: str | None = None
    context: AuditGateContext


@router.post("/audit-gate")
async def audit_gate(req: AuditGateRequest):
    """
    CI/CD fairness gate endpoint.

    Returns:
      - 200 PASS when no gate violations are found.
      - 422 FAIL when fairness gate violations exist.
    """
    try:
        db = firestore.client()
        auth = authenticate_org_api_key(db, req.api_key)
        if not auth or not auth.get("orgId"):
            raise HTTPException(status_code=401, detail="Invalid API key")

        payload = run_cicd_audit_gate(
            {
                "org_id": auth["orgId"],
                "dataset_gcs_path": req.dataset_gcs_path,
                "model_gcs_path": req.model_gcs_path,
                "domain": req.context.domain,
                "label_col": req.context.label_col,
                "positive_label": req.context.positive_label,
                "protected_cols": req.context.protected_cols,
                "fairness_threshold": req.context.fairness_threshold,
            }
        )

        payload["org_id"] = auth["orgId"]
        if payload.get("status") == "FAIL":
            return JSONResponse(status_code=422, content=payload)
        return payload

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CI/CD gate failed: {str(e)}")
