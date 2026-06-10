"""
Transfer Bias Router — PRD §2
API endpoints for Bias Transfer Learning Detector.

Provides CRUD operations for transfer bias analyses and
runs bias source isolation comparing base model profiles
against fine-tuned model bias.

All data stored in Firestore collection 'transfer_bias_analyses'.
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
from services.analysis.transfer_learning_detector import (
    compute_finetuned_bias,
    detect_transfer_bias,
)

logger = logging.getLogger(__name__)
router = APIRouter()


class TransferBiasRequest(BaseModel):
    orgId: str
    name: str = "Untitled Analysis"
    datasetStoragePath: str
    fineTunedModelStoragePath: str
    baseModelName: str
    domain: str = "generic"
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


def _load_model(local_path: Path):
    """Load a model from disk based on file extension."""
    import joblib
    import sys

    ext = local_path.suffix.lower()

    if ext in (".pkl", ".joblib"):
        # Inject wrapper classes for demo models
        import types
        main_mod = sys.modules.get("__main__")
        if main_mod is None:
            main_mod = types.ModuleType("__main__")
            sys.modules["__main__"] = main_mod

        # BiasedFineTunedModel class for demo
        if not hasattr(main_mod, "BiasedFineTunedModel"):
            class BiasedFineTunedModel:
                def __init__(self, base_model=None, bias_weights=None, predictions=None, probabilities=None):
                    self.base_model = base_model
                    self.bias_weights = bias_weights or {}
                    self.predictions = predictions
                    self.probabilities = probabilities
                def predict(self, X):
                    import numpy as np
                    if self.predictions is not None:
                        if hasattr(X, "index"):
                            return np.array([self.predictions[i] if i < len(self.predictions) else 0 for i in X.index])
                        return np.array(self.predictions[:len(X)])
                    if self.base_model is not None:
                        return self.base_model.predict(X)
                    return [0] * len(X)
                def predict_proba(self, X):
                    import numpy as np
                    if self.probabilities is not None:
                        if hasattr(X, "index"):
                            default_prob = [0.5, 0.5]
                            return np.array([self.probabilities[i] if i < len(self.probabilities) else default_prob for i in X.index])
                        return np.array(self.probabilities[:len(X)])
                    if self.base_model is not None and hasattr(self.base_model, "predict_proba"):
                        return self.base_model.predict_proba(X)
                    return [[0.5, 0.5]] * len(X)
            setattr(main_mod, "BiasedFineTunedModel", BiasedFineTunedModel)

        return joblib.load(str(local_path))

    elif ext == ".onnx":
        try:
            import onnxruntime as ort
            session = ort.InferenceSession(str(local_path))

            class OnnxModelWrapper:
                def __init__(self, sess):
                    self._sess = sess
                    self._input_name = sess.get_inputs()[0].name

                def predict(self, X):
                    import numpy as np
                    arr = np.array(X, dtype=np.float32)
                    out = self._sess.run(None, {self._input_name: arr})
                    return out[0].flatten()

            return OnnxModelWrapper(session)
        except ImportError:
            raise ValueError("onnxruntime is required for .onnx models")

    elif ext == ".tflite":
        raise ValueError("TFLite models are not yet supported for transfer bias analysis")
    else:
        raise ValueError(f"Unsupported model format: {ext}")


def _run_analysis_background(analysis_id: str, config: dict):
    """Background task: download files, run transfer bias analysis, save results to Firestore."""
    local_dataset_path = None
    local_model_path = None

    try:
        db = firestore.client()
        doc_ref = db.collection("transfer_bias_analyses").document(analysis_id)

        # Download files from Firebase Storage
        logger.info(f"[TBD:{analysis_id}] Downloading dataset from {config['datasetStoragePath']}")
        local_dataset_path = download_from_storage(config["datasetStoragePath"])

        logger.info(f"[TBD:{analysis_id}] Downloading fine-tuned model from {config['fineTunedModelStoragePath']}")
        local_model_path = download_from_storage(config["fineTunedModelStoragePath"])

        # Load dataset
        df = _load_dataframe(local_dataset_path)
        logger.info(f"[TBD:{analysis_id}] Dataset loaded: {len(df)} rows, {len(df.columns)} columns")

        # Load fine-tuned model
        model = _load_model(local_model_path)
        logger.info(f"[TBD:{analysis_id}] Fine-tuned model loaded")

        # Determine feature columns
        protected_cols = config["protectedCols"]
        label_col = config["labelCol"]
        positive_label = config["positiveLabel"]

        if config.get("featureCols"):
            feature_cols = config["featureCols"]
        else:
            # Auto-detect: all columns except protected + label
            exclude = set(protected_cols + [label_col])
            feature_cols = [c for c in df.columns if c not in exclude]

        # Step 1: Compute fine-tuned model bias
        logger.info(f"[TBD:{analysis_id}] Computing fine-tuned model bias...")
        finetuned_bias = compute_finetuned_bias(
            df=df,
            model=model,
            protected_cols=protected_cols,
            label_col=label_col,
            positive_label=positive_label,
            feature_cols=feature_cols,
        )
        logger.info(f"[TBD:{analysis_id}] Fine-tuned bias computed for {len(finetuned_bias)} attributes")

        # Step 2: Run transfer bias detection
        logger.info(f"[TBD:{analysis_id}] Running transfer bias detection against {config['baseModelName']}...")
        results = detect_transfer_bias(
            base_model_name=config["baseModelName"],
            domain=config["domain"],
            finetuned_bias=finetuned_bias,
            protected_cols=protected_cols,
        )
        logger.info(f"[TBD:{analysis_id}] Transfer bias analysis complete: {results['summary']['risk_level']} risk")

        # Save results
        doc_ref.update({
            "status": "COMPLETE",
            "completedAt": datetime.utcnow().isoformat(),
            "results": json.loads(json.dumps(results, default=str)),
            "summary": results["summary"],
        })
        logger.info(f"[TBD:{analysis_id}] Results saved to Firestore")

    except Exception as e:
        logger.error(f"[TBD:{analysis_id}] Analysis failed: {traceback.format_exc()}")
        try:
            db = firestore.client()
            db.collection("transfer_bias_analyses").document(analysis_id).update({
                "status": "FAILED",
                "error": str(e),
                "completedAt": datetime.utcnow().isoformat(),
            })
        except Exception:
            pass
    finally:
        if local_dataset_path:
            cleanup_temp_file(local_dataset_path)
        if local_model_path:
            cleanup_temp_file(local_model_path)


def _run_analysis_from_audit_background(analysis_id: str, config: dict):
    """
    Background task for audit-based analysis.
    Uses the audit's EXISTING bias results — no recomputation.
    """
    try:
        db = firestore.client()
        doc_ref = db.collection("transfer_bias_analyses").document(analysis_id)

        # Fetch the audit document
        audit_id = config["sourceAuditId"]
        logger.info(f"[TBD:{analysis_id}] Loading existing audit {audit_id}")
        audit_doc = db.collection("audits").document(audit_id).get()

        if not audit_doc.exists:
            raise ValueError(f"Audit {audit_id} not found")

        audit_data = audit_doc.to_dict()

        # Extract existing bias results from the audit
        # The audit stores bias in 'dataBias' field
        data_bias_raw = audit_data.get("dataBias", {})
        if isinstance(data_bias_raw, str):
            try:
                data_bias_raw = json.loads(data_bias_raw)
            except Exception:
                data_bias_raw = {}

        # Convert audit's dataBias format to our finetuned_bias format
        finetuned_bias = {}
        protected_cols = config["protectedCols"]

        for col in protected_cols:
            col_data = data_bias_raw.get(col, {})
            if col_data:
                metrics = col_data.get("metrics", {})
                finetuned_bias[col] = {
                    "disparate_impact": metrics.get("disparate_impact", 1.0),
                    "statistical_parity_difference": metrics.get("statistical_parity_difference", 0.0),
                    "privileged_group": col_data.get("privileged_group", "N/A"),
                    "group_rates": col_data.get("group_rates", {}),
                }

        logger.info(f"[TBD:{analysis_id}] Extracted existing bias for {len(finetuned_bias)} attributes from audit")

        # Run transfer bias detection using existing results — NO recomputation
        results = detect_transfer_bias(
            base_model_name=config["baseModelName"],
            domain=config["domain"],
            finetuned_bias=finetuned_bias,
            protected_cols=protected_cols,
        )
        logger.info(f"[TBD:{analysis_id}] Transfer bias analysis complete: {results['summary']['risk_level']} risk")

        # Save results
        doc_ref.update({
            "status": "COMPLETE",
            "completedAt": datetime.utcnow().isoformat(),
            "results": json.loads(json.dumps(results, default=str)),
            "summary": results["summary"],
        })
        logger.info(f"[TBD:{analysis_id}] Results saved to Firestore")

    except Exception as e:
        logger.error(f"[TBD:{analysis_id}] Audit-based analysis failed: {traceback.format_exc()}")
        try:
            db = firestore.client()
            db.collection("transfer_bias_analyses").document(analysis_id).update({
                "status": "FAILED",
                "error": str(e),
                "completedAt": datetime.utcnow().isoformat(),
            })
        except Exception:
            pass


# ─── Endpoints ─────────────────────────────────────────────────────────────


@router.post("/analyze")
async def create_analysis(req: TransferBiasRequest, bg: BackgroundTasks):
    """Create a new transfer bias analysis and start processing in the background."""
    db = firestore.client()

    analysis_id = db.collection("transfer_bias_analyses").document().id
    now = datetime.utcnow().isoformat()

    doc = {
        "orgId": req.orgId,
        "name": req.name,
        "baseModelName": req.baseModelName,
        "domain": req.domain,
        "datasetStoragePath": req.datasetStoragePath,
        "fineTunedModelStoragePath": req.fineTunedModelStoragePath,
        "protectedCols": req.protectedCols,
        "labelCol": req.labelCol,
        "positiveLabel": req.positiveLabel,
        "featureCols": req.featureCols,
        "sourceAuditId": req.sourceAuditId,
        "status": "PROCESSING",
        "createdAt": now,
        "completedAt": None,
        "results": None,
        "summary": None,
        "error": None,
    }

    db.collection("transfer_bias_analyses").document(analysis_id).set(doc)

    config = {
        "datasetStoragePath": req.datasetStoragePath,
        "fineTunedModelStoragePath": req.fineTunedModelStoragePath,
        "baseModelName": req.baseModelName,
        "domain": req.domain,
        "protectedCols": req.protectedCols,
        "labelCol": req.labelCol,
        "positiveLabel": req.positiveLabel,
        "featureCols": req.featureCols,
        "sourceAuditId": req.sourceAuditId,
    }

    # Choose the right background task based on whether we're using an existing audit
    if req.sourceAuditId:
        bg.add_task(_run_analysis_from_audit_background, analysis_id, config)
    else:
        bg.add_task(_run_analysis_background, analysis_id, config)

    return {"analysisId": analysis_id, "status": "PROCESSING"}


@router.get("/analyses")
async def list_analyses(orgId: str):
    """List all transfer bias analyses for an organization."""
    db = firestore.client()

    docs = (
        db.collection("transfer_bias_analyses")
        .where("orgId", "==", orgId)
        .stream()
    )

    analyses = []
    for doc in docs:
        data = doc.to_dict()
        analyses.append({
            "id": doc.id,
            "name": data.get("name", "Untitled"),
            "createdAt": data.get("createdAt"),
            "status": data.get("status"),
            "baseModelName": data.get("baseModelName"),
            "domain": data.get("domain"),
            "sourceAuditId": data.get("sourceAuditId"),
            "summary": data.get("summary"),
            "error": data.get("error"),
        })

    # Sort by creation date descending (in-memory to avoid Firestore index requirements)
    analyses.sort(key=lambda a: a.get("createdAt", ""), reverse=True)

    return analyses


@router.get("/analyses/{analysis_id}")
async def get_analysis(analysis_id: str):
    """Get a single transfer bias analysis with full results."""
    db = firestore.client()
    doc = db.collection("transfer_bias_analyses").document(analysis_id).get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Analysis not found")

    data = doc.to_dict()
    return {
        "id": doc.id,
        "name": data.get("name", "Untitled"),
        "createdAt": data.get("createdAt"),
        "completedAt": data.get("completedAt"),
        "status": data.get("status"),
        "orgId": data.get("orgId"),
        "baseModelName": data.get("baseModelName"),
        "domain": data.get("domain"),
        "datasetStoragePath": data.get("datasetStoragePath"),
        "fineTunedModelStoragePath": data.get("fineTunedModelStoragePath"),
        "protectedCols": data.get("protectedCols", []),
        "labelCol": data.get("labelCol"),
        "positiveLabel": data.get("positiveLabel"),
        "sourceAuditId": data.get("sourceAuditId"),
        "results": data.get("results"),
        "summary": data.get("summary"),
        "error": data.get("error"),
    }


@router.delete("/analyses/{analysis_id}")
async def delete_analysis(analysis_id: str):
    """Delete a transfer bias analysis."""
    db = firestore.client()
    doc = db.collection("transfer_bias_analyses").document(analysis_id).get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Analysis not found")

    db.collection("transfer_bias_analyses").document(analysis_id).delete()
    return {"deleted": True, "analysisId": analysis_id}
