from __future__ import annotations

import os
import sys
import json
import traceback
from datetime import datetime
from pathlib import Path

# Add backend to path so we can import services
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from core.firebase_init import initialize_firebase
from firebase_admin import firestore


def _utcnow_iso() -> str:
    return datetime.utcnow().isoformat()


def run_infrastructure_smoke() -> None:
    """Validate that the Cloud Run Job can boot with Firebase credentials."""
    initialize_firebase()
    print(f"[WORKER] infrastructure_smoke complete at {_utcnow_iso()}")


def run_analysis(audit_id: str, config: dict) -> None:
    """
    Run full analysis pipeline for an audit.
    This is the heavy ML work moved out of FastAPI background tasks.
    
    Args:
        audit_id: Firestore audit document ID
        config: Audit configuration dict (orgId, storagePath, labelCol, etc.)
    """
    from services.analysis.pipeline import run_full_pipeline
    from services.org_settings import get_org_settings
    
    try:
        print(f"[WORKER] Starting analysis for audit {audit_id}")
        db = firestore.client()
        doc_ref = db.collection("audits").document(audit_id)
        
        # Run the full pipeline
        results = run_full_pipeline(config, audit_id)
        
        # Compute sector benchmarking
        fairness_score = float(results.get("severity", {}).get("fairness_score", 0))
        
        # Extract worst DI for benchmarking
        worst_di = 1.0
        data_bias = results.get("dataBias", {})
        for result in data_bias.values():
            di = result.get("metrics", {}).get("disparate_impact")
            if isinstance(di, (int, float)):
                worst_di = min(worst_di, float(di))
        worst_di = round(worst_di, 4)
        
        # Compute benchmark (simplified version - full version in audits.py)
        benchmark = {
            "domain": config.get("domain", "Other"),
            "optedIn": False,
            "peerCount": 0,
            "worseThanPercent": None,
            "outperformPercent": None,
            "message": "Benchmarking data is not available yet for this domain.",
            "computedAt": datetime.utcnow().isoformat(),
        }
        
        # Update Firestore with results
        update = {
            "status": "COMPLETE",
            "rowCount": results.get("schema", {}).get("row_count", 0),
            "columnCount": results.get("schema", {}).get("column_count", 0),
            "schema": json.dumps(results.get("schema") or {}),
            "binning": results.get("binning"),
            "proxies": results.get("proxies"),
            "profiles": json.dumps(results.get("profiles") or []),
            "dataBias": json.dumps(results.get("dataBias") or {}),
            "modelBias": json.dumps(results.get("modelBias") or {}),
            "flipSensitivity": results.get("flipSensitivity"),
            "explainability": json.dumps(results.get("explainability") or {}),
            "intersectional": json.dumps(results.get("intersectional") or []),
            "featureLaundering": json.dumps(results.get("featureLaundering") or []),
            "historicalHarm": json.dumps(results.get("historicalHarm") or {}),
            "regulationMap": json.dumps(results.get("regulationMap") or {}),
            "severity": results.get("severity"),
            "fairnessScore": results.get("severity", {}).get("fairness_score", 0),
            "letterGrade": results.get("severity", {}).get("letter_grade", "?"),
            "blindSpots": json.dumps(results.get("blindSpots") or []),
            "narratives": json.dumps(results.get("narratives") or {}),
            "biasOriginTracer": json.dumps(results.get("biasOriginTracer") or []),
            "modelDecisionBias": json.dumps(results.get("modelDecisionBias") or {}),
            "justifiedBias": json.dumps(results.get("justifiedBias") or {}),
            "benchmarking": json.dumps(benchmark or {}),
            "modelError": results.get("modelError"),
            "explainabilityError": results.get("explainabilityError"),
            "completedAt": _utcnow_iso(),
        }
        
        doc_ref.update(update)
        print(f"[WORKER] Analysis complete for audit {audit_id}")
        
        # Bias Attestation Chain Hook
        try:
            from services.attestation.chain import issue_attestation, resolve_model_identifier
            model_id = config.get("model_identifier") or config.get("modelIdentifier")
            if not model_id:
                model_id = resolve_model_identifier(config.get("modelStoragePath") or config.get("storagePath"))
            
            score = float(results.get("severity", {}).get("fairness_score", 0))
            letter_grade = str(results.get("severity", {}).get("letter_grade", "?"))
            
            issue_attestation(
                org_id=config.get("orgId", "default"),
                audit_id=audit_id,
                model_identifier=model_id,
                fairness_score=score,
                letter_grade=letter_grade,
                results_snapshot=results,
                interventions_applied=[]
            )
            doc_ref.update({"model_identifier": model_id})
            print(f"[WORKER][ATTESTATION] Issued attestation for model {model_id} (audit {audit_id})")
        except Exception as att_err:
            print(f"[WORKER][ATTESTATION] Failed to issue attestation: {str(att_err)}")

        
    except Exception as e:
        print(f"[WORKER] Analysis failed for audit {audit_id}: {str(e)}")
        print(traceback.format_exc())
        
        try:
            db = firestore.client()
            db.collection("audits").document(audit_id).update({
                "status": "FAILED",
                "error": str(e),
                "traceback": traceback.format_exc(),
                "failedAt": _utcnow_iso(),
            })
        except Exception as update_error:
            print(f"[WORKER] Failed to update error status: {str(update_error)}")
        
        raise


def run_regulatory_sync() -> None:
    """
    Run weekly regulatory sync job.
    Uses Gemini to search for new AI regulations and update Firestore.
    """
    from services.regulatory.sync_engine import RegulatorySync
    
    try:
        print(f"[WORKER] Starting regulatory sync at {_utcnow_iso()}")
        
        sync_engine = RegulatorySync()
        results = sync_engine.run_sync()
        
        print(f"[WORKER] Regulatory sync complete:")
        print(f"  - New regulations found: {results['new_regulations_count']}")
        print(f"  - Alerts generated: {results['alerts_generated']}")
        print(f"  - Organizations notified: {results['orgs_notified']}")
        
    except Exception as e:
        print(f"[WORKER] Regulatory sync failed: {str(e)}")
        print(traceback.format_exc())
        raise


async def run_feature_store_poll() -> dict:
    """Read all active feature store registrations and run bias checks for each."""
    initialize_firebase()
    db = firestore.client()
    
    # Import connector service functions
    from services.feature_store.connector import run_feature_store_bias_check
    from routers.feature_stores import ConnectionConfig, _get_connector
    
    registrations = (
        db.collection("feature_store_registrations")
        .where(filter=firestore.FieldFilter("status", "==", "active"))
        .stream()
    )
    
    results = {}
    for doc in registrations:
        reg_id = doc.id
        reg = doc.to_dict() or {}
        org_id = reg.get("org_id")
        store_type = reg.get("store_type")
        config_data = reg.get("connection_config", {})
        config = ConnectionConfig(**config_data)
        is_mock = reg.get("is_mock", False)
        
        print(f"[WORKER] Polling feature store {reg_id} ({store_type}) for org {org_id} (is_mock: {is_mock})")
        
        try:
            connector = _get_connector(store_type, config, is_mock)
            kwargs = {}
            if store_type == "rest":
                kwargs["params"] = {}
            else:
                kwargs["entity_ids"] = config.entity_ids or ["entity_1", "entity_2", "entity_3"]
                
            res = await run_feature_store_bias_check(
                connector=connector,
                protected_cols=reg["protected_cols"],
                label_col=reg["label_col"],
                positive_label=reg["positive_label"],
                org_id=org_id,
                pipeline_id=reg_id,
                **kwargs
            )
            
            if "error" in res:
                db.collection("feature_store_registrations").document(reg_id).update({
                    "status": "error",
                    "last_polled": datetime.utcnow().isoformat()
                })
                results[reg_id] = {"status": "error", "message": res["error"]}
            else:
                worst_di = 1.0
                for attr, data in res.items():
                    di = data.get("disparate_impact")
                    if di is not None:
                        worst_di = min(worst_di, di)
                        
                db.collection("feature_store_registrations").document(reg_id).update({
                    "status": "active",
                    "last_polled": datetime.utcnow().isoformat(),
                    "last_di_worst": worst_di
                })
                results[reg_id] = {"status": "success", "results": res, "worst_di": worst_di}
                
        except Exception as e:
            print(f"[WORKER] Failed to poll feature store {reg_id}: {str(e)}")
            db.collection("feature_store_registrations").document(reg_id).update({
                "status": "error",
                "last_polled": datetime.utcnow().isoformat()
            })
            results[reg_id] = {"status": "error", "message": str(e)}
            
    return results


# Web Server setup if deployed as a Cloud Run Service instead of Cloud Run Job
try:
    from fastapi import FastAPI
    import uvicorn
    worker_app = FastAPI(title="VisionAI Worker Service")
    
    @worker_app.post("/feature-store-poll")
    async def trigger_poll_endpoint():
        res = await run_feature_store_poll()
        return {"status": "success", "results": res}
except ImportError:
    worker_app = None


def main() -> None:
    job_kind = os.getenv("VISIONAI_JOB_KIND", "infrastructure_smoke").strip().lower()
    print(f"[WORKER] starting job kind: {job_kind}")

    if job_kind == "infrastructure_smoke":
        run_infrastructure_smoke()
        return
    
    if job_kind == "analysis":
        # Expect VISIONAI_AUDIT_ID and VISIONAI_CONFIG env vars
        audit_id = os.getenv("VISIONAI_AUDIT_ID", "").strip()
        config_json = os.getenv("VISIONAI_CONFIG", "{}").strip()
        
        if not audit_id:
            raise ValueError("VISIONAI_AUDIT_ID environment variable is required for analysis job")
        
        try:
            config = json.loads(config_json)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid VISIONAI_CONFIG JSON: {str(e)}")
        
        run_analysis(audit_id, config)
        return
    
    if job_kind == "regulatory_sync":
        run_regulatory_sync()
        return

    if job_kind == "feature_store_poll":
        import asyncio
        asyncio.run(run_feature_store_poll())
        return

    if job_kind == "web_server":
        if worker_app is None or uvicorn is None:
            raise ImportError("FastAPI or uvicorn is not installed in the worker environment.")
        port = int(os.getenv("PORT", "8080"))
        uvicorn.run(worker_app, host="0.0.0.0", port=port)
        return

    raise ValueError(f"Unsupported VISIONAI_JOB_KIND: {job_kind}")


if __name__ == "__main__":
    main()

