"""
Audit router — Create, retrieve, list audits.
Runs full analysis pipeline (Phase 4) async via BackgroundTasks.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from datetime import datetime
import traceback

from services.analysis.pipeline import run_full_pipeline
from services.gemini.stakeholder_formatter import get_cached_narrative_sync

from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

router = APIRouter()


class CreateAuditRequest(BaseModel):
    orgId: str
    name: str
    domain: str
    storagePath: str
    labelCol: str
    positiveLabel: str
    protectedCols: list[str]
    threshold: float = 0.8
    dataOnly: bool = False
    modelStoragePath: str | None = None
    deployed: bool = False
    deployedSince: str | None = None
    decisionsPerMonth: int | None = None
    jurisdiction: str = "Global"


def _run_pipeline_background(config: dict, audit_id: str, doc_ref):
    """Background task: run full pipeline then save results to Firestore."""
    try:
        results = run_full_pipeline(config, audit_id)

        update = {
            "status": "COMPLETE",
            "rowCount": results.get("schema", {}).get("row_count", 0),
            "columnCount": results.get("schema", {}).get("column_count", 0),
            "schema": results.get("schema"),
            "binning": results.get("binning"),
            "proxies": results.get("proxies"),
            "profiles": results.get("profiles"),
            "dataBias": results.get("dataBias"),
            "modelBias": results.get("modelBias"),
            "flipSensitivity": results.get("flipSensitivity"),
            "explainability": results.get("explainability"),
            "intersectional": results.get("intersectional"),
            "featureLaundering": results.get("featureLaundering"),
            "historicalHarm": results.get("historicalHarm"),
            "regulationMap": results.get("regulationMap"),
            "severity": results.get("severity"),
            "fairnessScore": results.get("severity", {}).get("fairness_score", 0),
            "letterGrade": results.get("severity", {}).get("letter_grade", "?"),
            "blindSpots": results.get("blindSpots", []),
            "narratives": results.get("narratives", {}),
            "modelError": results.get("modelError"),
            "explainabilityError": results.get("explainabilityError"),
        }
        doc_ref.update(update)
    except Exception as e:
        try:
            doc_ref.update({
                "status": "FAILED",
                "error": str(e),
                "traceback": traceback.format_exc(),
            })
        except Exception:
            pass


@router.post("")
async def create_audit(req: CreateAuditRequest, background_tasks: BackgroundTasks):
    """
    Create audit doc → immediately return audit ID.
    Pipeline runs async in background, updates Firestore when done.
    Frontend polls GET /api/audits/{id} for status.
    """
    try:
        db = firestore.client()

        audit_doc = {
            "orgId": req.orgId,
            "name": req.name,
            "domain": req.domain,
            "storagePath": req.storagePath,
            "labelCol": req.labelCol,
            "positiveLabel": req.positiveLabel,
            "protectedCols": req.protectedCols,
            "threshold": req.threshold,
            "dataOnly": req.dataOnly,
            "modelStoragePath": req.modelStoragePath,
            "deployed": req.deployed,
            "deployedSince": req.deployedSince,
            "decisionsPerMonth": req.decisionsPerMonth,
            "jurisdiction": req.jurisdiction,
            "status": "PROCESSING",
            "createdAt": datetime.utcnow().isoformat(),
            "pipeline": {},
        }
        doc_ref = db.collection("audits").document()
        doc_ref.set(audit_doc)
        audit_id = doc_ref.id

        # Run pipeline async — returns immediately
        config = req.model_dump()
        background_tasks.add_task(_run_pipeline_background, config, audit_id, doc_ref)

        return {
            "auditId": audit_id,
            "status": "PROCESSING",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audit creation failed: {str(e)}")


@router.get("/{audit_id}")
async def get_audit(audit_id: str):
    """Retrieve single audit by ID. Frontend polls this for status."""
    try:
        db = firestore.client()
        doc = db.collection("audits").document(audit_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")
        data = doc.to_dict()
        data["id"] = doc.id
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def list_audits(orgId: str):
    """List all audits for org, newest first."""
    try:
        db = firestore.client()
        docs = (
            db.collection("audits")
            .where(filter=FieldFilter("orgId", "==", orgId))
            .stream()
        )
        audits = []
        for doc in docs:
            data = doc.to_dict()
            data["id"] = doc.id
            audits.append(data)
        audits.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
        return audits
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{audit_id}/narrative/{stakeholder_type}")
async def get_narrative(audit_id: str, stakeholder_type: str):
    """
    Retrieve narrative for a specific stakeholder type.
    stakeholder_type: one of "technical", "executive", "legal"
    """
    if stakeholder_type not in ["technical", "executive", "legal"]:
        raise HTTPException(
            status_code=400,
            detail="stakeholder_type must be one of: technical, executive, legal"
        )
    
    try:
        # Check if audit exists
        db = firestore.client()
        audit_doc = db.collection("audits").document(audit_id).get()
        if not audit_doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")
        
        # Try to get cached narrative
        narrative = get_cached_narrative_sync(audit_id, stakeholder_type)
        
        if narrative:
            return {
                "auditId": audit_id,
                "stakeholderType": stakeholder_type,
                "narrative": narrative,
            }
        else:
            # Check if audit is complete
            audit_data = audit_doc.to_dict()
            if audit_data.get("status") != "COMPLETE":
                raise HTTPException(
                    status_code=400,
                    detail="Audit is not complete yet. Narratives are generated after analysis completes."
                )
            
            # Narrative should exist but doesn't - return error
            raise HTTPException(
                status_code=404,
                detail=f"Narrative for {stakeholder_type} not found. It may not have been generated yet."
            )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
