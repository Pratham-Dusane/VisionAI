"""
Quantization Profiler Router — PRD §6
API endpoints for Edge Quantization Fairness Profiling.

Provides CRUD operations for quantization profiles and
runs QDI analysis comparing full-precision vs quantized models.

All data stored in Firestore collection 'quantization_profiles'.
Existing audit pipeline is NOT modified — we only READ audit data.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from pathlib import Path
import json
import logging
import traceback

from firebase_admin import firestore
from core.firebase_init import download_from_storage, cleanup_temp_file
from services.analysis.quantization_profiler import compute_qdi

logger = logging.getLogger(__name__)
router = APIRouter()


class QuantizationProfileRequest(BaseModel):
    orgId: str
    name: str = "Untitled Profile"
    datasetStoragePath: str
    fullModelStoragePath: str
    quantizedModelStoragePath: Optional[str] = None
    protectedCols: list[str]
    labelCol: str
    positiveLabel: str
    featureCols: Optional[list[str]] = None
    sourceAuditId: Optional[str] = None


def _load_dataframe(local_path: Path):
    """Load a dataset file into a DataFrame based on extension."""
    import pandas as pd
    ext = local_path.suffix.lower()
    if ext == ".csv":
        return pd.read_csv(local_path)
    elif ext == ".json":
        return pd.read_json(local_path)
    elif ext == ".parquet":
        return pd.read_parquet(local_path)
    else:
        raise ValueError(f"Unsupported dataset format: {ext}")


def _run_qdi_background(profile_id: str, config: dict):
    """Background task: download files, run QDI analysis, save results to Firestore."""
    local_dataset_path = None
    local_full_model_path = None
    local_quant_model_path = None

    try:
        db = firestore.client()
        doc_ref = db.collection("quantization_profiles").document(profile_id)

        # Download files from Firebase Storage
        logger.info(f"[QDI:{profile_id}] Downloading dataset from {config['datasetStoragePath']}")
        local_dataset_path = download_from_storage(config["datasetStoragePath"])

        logger.info(f"[QDI:{profile_id}] Downloading full model from {config['fullModelStoragePath']}")
        local_full_model_path = download_from_storage(config["fullModelStoragePath"])

        if config.get("quantizedModelStoragePath"):
            logger.info(f"[QDI:{profile_id}] Downloading quantized model from {config['quantizedModelStoragePath']}")
            local_quant_model_path = download_from_storage(config["quantizedModelStoragePath"])

        # Load dataset
        df = _load_dataframe(local_dataset_path)
        logger.info(f"[QDI:{profile_id}] Dataset loaded: {len(df)} rows, {len(df.columns)} columns")

        # Run QDI analysis
        results = compute_qdi(
            df=df,
            full_precision_path=str(local_full_model_path),
            quantized_path=str(local_quant_model_path) if local_quant_model_path else None,
            protected_cols=config["protectedCols"],
            label_col=config["labelCol"],
            positive_label=config["positiveLabel"],
            feature_cols=config.get("featureCols"),
        )

        # Save results to Firestore
        update = {
            "status": "COMPLETE",
            "results": json.dumps(results),
            "overall_qdi": results["overall"]["qdi"],
            "overall_accuracy_drop_pct": results["overall"]["accuracy_drop_pct"],
            "full_precision_accuracy": results["overall"]["full_precision_accuracy"],
            "quantized_accuracy": results["overall"]["quantized_accuracy"],
            "flagged_count": len(results["flagged_groups"]),
            "total_samples": results["overall"]["total_samples"],
            "simulated_quantization": results["overall"]["simulated_quantization"],
            "completedAt": datetime.utcnow().isoformat(),
        }
        doc_ref.update(update)
        logger.info(f"[QDI:{profile_id}] Analysis complete. QDI={results['overall']['qdi']:.4f}, flagged={len(results['flagged_groups'])}")

    except Exception as e:
        logger.error(f"[QDI:{profile_id}] Analysis failed: {e}", exc_info=True)
        try:
            db = firestore.client()
            doc_ref = db.collection("quantization_profiles").document(profile_id)
            doc_ref.update({
                "status": "FAILED",
                "error": str(e),
                "traceback": traceback.format_exc(),
                "completedAt": datetime.utcnow().isoformat(),
            })
        except Exception:
            pass
    finally:
        if local_dataset_path:
            cleanup_temp_file(local_dataset_path)
        if local_full_model_path:
            cleanup_temp_file(local_full_model_path)
        if local_quant_model_path:
            cleanup_temp_file(local_quant_model_path)


@router.post("/profile")
async def create_quantization_profile(
    req: QuantizationProfileRequest,
    background_tasks: BackgroundTasks,
):
    """
    Create a new quantization profile and run QDI analysis in background.
    Returns profile ID immediately; frontend polls GET for status.
    """
    try:
        db = firestore.client()

        profile_doc = {
            "orgId": req.orgId,
            "name": req.name,
            "datasetStoragePath": req.datasetStoragePath,
            "fullModelStoragePath": req.fullModelStoragePath,
            "quantizedModelStoragePath": req.quantizedModelStoragePath,
            "protectedCols": req.protectedCols,
            "labelCol": req.labelCol,
            "positiveLabel": req.positiveLabel,
            "featureCols": req.featureCols,
            "sourceAuditId": req.sourceAuditId,
            "status": "PROCESSING",
            "createdAt": datetime.utcnow().isoformat(),
            "results": None,
            "overall_qdi": None,
            "flagged_count": None,
            "error": None,
        }

        doc_ref = db.collection("quantization_profiles").document()
        doc_ref.set(profile_doc)
        profile_id = doc_ref.id

        # Dispatch background analysis
        config = req.model_dump()
        background_tasks.add_task(_run_qdi_background, profile_id, config)

        logger.info(f"Created quantization profile {profile_id} for org {req.orgId}")

        return {
            "profileId": profile_id,
            "status": "PROCESSING",
        }

    except Exception as e:
        logger.error(f"Failed to create quantization profile: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create profile: {str(e)}")


@router.get("/profiles")
async def list_quantization_profiles(orgId: str):
    """List all quantization profiles for an organization."""
    try:
        db = firestore.client()
        query = (
            db.collection("quantization_profiles")
            .where("orgId", "==", orgId)
        )
        docs = query.stream()

        profiles = []
        for doc in docs:
            data = doc.to_dict()
            profiles.append({
                "id": doc.id,
                "name": data.get("name", "Untitled"),
                "status": data.get("status", "UNKNOWN"),
                "createdAt": data.get("createdAt"),
                "completedAt": data.get("completedAt"),
                "overall_qdi": data.get("overall_qdi"),
                "overall_accuracy_drop_pct": data.get("overall_accuracy_drop_pct"),
                "full_precision_accuracy": data.get("full_precision_accuracy"),
                "quantized_accuracy": data.get("quantized_accuracy"),
                "flagged_count": data.get("flagged_count"),
                "total_samples": data.get("total_samples"),
                "simulated_quantization": data.get("simulated_quantization"),
                "sourceAuditId": data.get("sourceAuditId"),
                "error": data.get("error"),
            })

        # Sort in memory by createdAt descending (newest first)
        profiles.sort(key=lambda p: p.get("createdAt") or "", reverse=True)

        return profiles

    except Exception as e:
        logger.error(f"Failed to list quantization profiles: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to list profiles: {str(e)}")


@router.get("/profiles/{profile_id}")
async def get_quantization_profile(profile_id: str):
    """Get a single quantization profile with full results."""
    try:
        db = firestore.client()
        doc = db.collection("quantization_profiles").document(profile_id).get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Profile not found")

        data = doc.to_dict()

        # Parse results JSON if present
        results = data.get("results")
        if results and isinstance(results, str):
            try:
                results = json.loads(results)
            except Exception:
                pass

        return {
            "id": doc.id,
            "name": data.get("name"),
            "status": data.get("status"),
            "createdAt": data.get("createdAt"),
            "completedAt": data.get("completedAt"),
            "orgId": data.get("orgId"),
            "datasetStoragePath": data.get("datasetStoragePath"),
            "fullModelStoragePath": data.get("fullModelStoragePath"),
            "quantizedModelStoragePath": data.get("quantizedModelStoragePath"),
            "protectedCols": data.get("protectedCols"),
            "labelCol": data.get("labelCol"),
            "positiveLabel": data.get("positiveLabel"),
            "sourceAuditId": data.get("sourceAuditId"),
            "simulated_quantization": data.get("simulated_quantization"),
            "results": results,
            "error": data.get("error"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get quantization profile: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get profile: {str(e)}")


@router.delete("/profiles/{profile_id}")
async def delete_quantization_profile(profile_id: str):
    """Delete a quantization profile."""
    try:
        db = firestore.client()
        doc_ref = db.collection("quantization_profiles").document(profile_id)
        doc = doc_ref.get()

        if not doc.exists:
            raise HTTPException(status_code=404, detail="Profile not found")

        doc_ref.delete()
        return {"deleted": True, "profileId": profile_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete quantization profile: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete profile: {str(e)}")
