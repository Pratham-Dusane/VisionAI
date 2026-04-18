"""
Audit router - Create, retrieve, list audits.
Runs full analysis pipeline (Phase 4) async via BackgroundTasks.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path
import numpy as np
import pandas as pd
import traceback

from services.analysis.pipeline import run_full_pipeline
from services.analysis.model_bias_evaluator import load_model
from services.analysis.data_bias_scanner import scan_data_bias
from services.analysis.severity_scorer import compute_severity_score
from services.reporting.audit_serializer import serialize_legal_export
from services.reporting.audit_serializer import serialize_anonymized_export
from services.reporting.pdf_generator import generate_audit_pdf_bytes
from services.gemini.stakeholder_formatter import get_cached_narrative_sync
from core.firebase_init import download_from_storage, cleanup_temp_file

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


def _load_dataframe(local_path: Path) -> pd.DataFrame:
    ext = local_path.suffix.lower()
    if ext == ".csv":
        return pd.read_csv(local_path)
    if ext == ".json":
        return pd.read_json(local_path)
    if ext == ".parquet":
        return pd.read_parquet(local_path)
    raise ValueError(f"Unsupported dataset format: {ext}")


def _to_binary(series: pd.Series, positive_label) -> np.ndarray:
    try:
        positives = (series == positive_label)
        if positives.any():
            return positives.astype(int).values
    except Exception:
        pass

    try:
        pos_num = float(positive_label)
        return (series.astype(float) == pos_num).astype(int).values
    except Exception:
        pass

    return (series.astype(str).str.lower() == str(positive_label).lower()).astype(int).values


def _predict_scores(model, X: pd.DataFrame) -> np.ndarray:
    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(X)
        probs = np.asarray(probs)
        if probs.ndim == 1:
            return probs
        if probs.shape[1] == 1:
            return probs[:, 0]
        return probs[:, -1]

    if hasattr(model, "decision_function"):
        raw = np.asarray(model.decision_function(X), dtype=float)
        if raw.ndim > 1:
            raw = raw[:, -1]
        min_v = float(np.min(raw))
        max_v = float(np.max(raw))
        if max_v - min_v <= 1e-9:
            return np.full(len(raw), 0.5)
        return (raw - min_v) / (max_v - min_v)

    pred = model.predict(X)
    try:
        return np.asarray(pred, dtype=float)
    except Exception:
        pred_series = pd.Series(pred).astype(str).str.lower()
        return np.where(
            pred_series.isin(["1", "true", "yes", "approved", "positive"]),
            1.0,
            0.0,
        )


def _compute_equalized_odds_from_preds(
    df: pd.DataFrame,
    y_true: np.ndarray,
    y_pred: np.ndarray,
    protected_cols: list[str],
) -> dict:
    result = {}
    for col in protected_cols:
        if col not in df.columns:
            continue

        unique_vals = [v for v in df[col].dropna().unique().tolist()]
        if len(unique_vals) < 2 or len(unique_vals) > 15:
            continue

        group_metrics = {}
        for group in unique_vals:
            mask = (df[col] == group).values
            yt = y_true[mask]
            yp = y_pred[mask]
            if len(yt) == 0:
                continue

            tp = int(((yt == 1) & (yp == 1)).sum())
            tn = int(((yt == 0) & (yp == 0)).sum())
            fp = int(((yt == 0) & (yp == 1)).sum())
            fn = int(((yt == 1) & (yp == 0)).sum())

            group_metrics[str(group)] = {
                "fpr": round(fp / (fp + tn), 4) if (fp + tn) > 0 else 0,
                "fnr": round(fn / (fn + tp), 4) if (fn + tp) > 0 else 0,
                "precision": round(tp / (tp + fp), 4) if (tp + fp) > 0 else 0,
            }

        if group_metrics:
            result[col] = group_metrics

    return result


def _compute_pareto_points(audit: dict) -> list[dict]:
    if audit.get("dataOnly"):
        raise ValueError("Pareto frontier requires a model-backed audit.")

    if not audit.get("modelStoragePath"):
        raise ValueError("No model file attached to this audit.")

    local_data_path = None
    local_model_path = None
    try:
        local_data_path = download_from_storage(audit["storagePath"])
        local_model_path = download_from_storage(audit["modelStoragePath"])

        df = _load_dataframe(local_data_path)
        model = load_model(str(local_model_path))
        if model is None:
            raise ValueError("Failed to load model for Pareto computation.")

        label_col = audit["labelCol"]
        positive_label = audit["positiveLabel"]
        protected_cols = audit.get("protectedCols", [])

        if label_col not in df.columns:
            raise ValueError(f"Label column '{label_col}' missing in dataset.")

        feature_cols = [c for c in df.columns if c != label_col]
        if not feature_cols:
            raise ValueError("Dataset has no feature columns for prediction.")

        X = pd.get_dummies(df[feature_cols], drop_first=True).fillna(0)
        if hasattr(model, "feature_names_in_"):
            X = X.reindex(columns=list(model.feature_names_in_), fill_value=0)

        y_true = _to_binary(df[label_col], positive_label)
        scores = _predict_scores(model, X)

        if len(scores) != len(df):
            raise ValueError("Model prediction length mismatch.")

        thresholds = [round(x / 10.0, 1) for x in range(1, 10)]
        points: list[dict] = []

        for threshold in thresholds:
            y_pred = (scores >= threshold).astype(int)
            accuracy = float((y_pred == y_true).mean() * 100)

            pred_df = df.copy()
            pred_df["__pred__"] = y_pred
            data_bias = scan_data_bias(pred_df, "__pred__", 1, protected_cols)
            eq_odds = _compute_equalized_odds_from_preds(pred_df, y_true, y_pred, protected_cols)
            severity = compute_severity_score(
                data_bias=data_bias,
                proxies=[],
                intersectional=[],
                feature_laundering=[],
                model_bias={"_equalized_odds": eq_odds},
            )

            points.append({
                "threshold": threshold,
                "accuracy": round(accuracy, 2),
                "fairnessScore": round(float(severity.get("fairness_score", 0)), 2),
            })

        return points
    finally:
        if local_data_path:
            cleanup_temp_file(local_data_path)
        if local_model_path:
            cleanup_temp_file(local_model_path)


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
            "pipelineMeta": {},
        }
        doc_ref = db.collection("audits").document()
        doc_ref.set(audit_doc)
        audit_id = doc_ref.id

        # Run pipeline async - returns immediately
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


@router.get("/{audit_id}/pareto")
async def get_pareto_frontier(audit_id: str):
    """Compute fairness vs accuracy Pareto points for thresholds 0.1-0.9."""
    try:
        db = firestore.client()
        doc = db.collection("audits").document(audit_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")

        audit = doc.to_dict()
        points = _compute_pareto_points(audit)
        return {
            "auditId": audit_id,
            "points": points,
            "computedAt": datetime.utcnow().isoformat(),
        }
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute Pareto frontier: {str(e)}")


@router.get("/{audit_id}/export/legal")
async def export_legal_json(audit_id: str):
    """Export legal/compliance findings as JSON payload."""
    try:
        db = firestore.client()
        doc = db.collection("audits").document(audit_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")

        audit = doc.to_dict()
        payload = serialize_legal_export(audit_id, audit)
        return JSONResponse(
            content=payload,
            headers={
                "Content-Disposition": f'attachment; filename="audit-{audit_id}-legal.json"'
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export legal JSON: {str(e)}")


@router.get("/{audit_id}/export/pdf")
async def export_pdf_report(audit_id: str):
    """Generate and return PDF audit report."""
    try:
        db = firestore.client()
        doc = db.collection("audits").document(audit_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")

        audit = doc.to_dict()
        pdf_bytes = generate_audit_pdf_bytes(audit_id, audit)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="audit-{audit_id}.pdf"'
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export PDF: {str(e)}")


@router.get("/{audit_id}/export/anon")
async def export_anonymized_report(audit_id: str):
    """Export anonymized whistleblower report payload."""
    try:
        db = firestore.client()
        doc = db.collection("audits").document(audit_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")

        audit = doc.to_dict()
        payload = serialize_anonymized_export(audit_id, audit)
        return JSONResponse(
            content=payload,
            headers={
                "Content-Disposition": f'attachment; filename="audit-{audit_id}-anon.json"'
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export anonymized report: {str(e)}")


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
