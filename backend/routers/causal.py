"""
Causal Fairness router — PRD v2 §5
GET /api/audits/{audit_id}/causal → on-demand causal path analysis
"""

from fastapi import APIRouter, HTTPException
from typing import Any
from pathlib import Path
import pandas as pd
import math
import json
import logging

from services.analysis.causal_fairness import run_causal_analysis
from services.preprocessing.auto_binner import auto_bin_protected_columns
from core.firebase_init import download_from_storage, cleanup_temp_file

router = APIRouter()
logger = logging.getLogger("causal_router")


def _get_causal_gemini_model():
    import os
    import google.generativeai as genai
    
    # Try API key first (since it's easier and works locally)
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_BIAS_API_KEY")
    if api_key:
        try:
            logger.info("[CAUSAL] Configuring google-generativeai with API key...")
            genai.configure(api_key=api_key)
            return genai.GenerativeModel("gemini-2.5-flash")
        except Exception as e:
            logger.error(f"[CAUSAL] Failed configuring with API key: {e}")
            
    # Fallback to Vertex AI model helper
    from services.gemini.model_helper import get_gemini_model
    return get_gemini_model()


def _load_dataframe(local_path: Path) -> pd.DataFrame:
    ext = local_path.suffix.lower()
    if ext == ".csv":
        return pd.read_csv(local_path)
    if ext == ".json":
        return pd.read_json(local_path)
    if ext == ".parquet":
        return pd.read_parquet(local_path)
    raise ValueError(f"Unsupported dataset format: {ext}")


def _pythonize(value: Any) -> Any:
    # Quick utility to make values JSON-serializable if not already
    import numpy as np
    if isinstance(value, dict):
        return {str(k): _pythonize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_pythonize(v) for v in value]
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


@router.get("/{audit_id}/causal")
async def get_causal_fairness(audit_id: str, force: bool = False):
    """
    On-demand causal fairness analysis. Checks Firestore cache first unless forced.
    """
    from firebase_admin import firestore as fs
    db = fs.client()
    doc = db.collection("audits").document(audit_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Audit not found")

    audit = doc.to_dict()
    
    # Check Firestore cache
    if not force:
        cached = audit.get("causalFairness")
        if cached:
            try:
                parsed = json.loads(cached) if isinstance(cached, str) else cached
                has_error = False
                if isinstance(parsed, dict) and "per_attribute" in parsed:
                    for attr, info in parsed["per_attribute"].items():
                        if isinstance(info, dict) and "error" in info:
                            has_error = True
                            break
                if not has_error:
                    return parsed
            except Exception:
                pass

    # Check that audit is completed
    if audit.get("status") != "COMPLETE":
        raise HTTPException(
            status_code=400,
            detail="Causal analysis requires a completed audit dataset.",
        )

    # Perform analysis on-demand
    local_data_path = None
    try:
        local_data_path = download_from_storage(audit["storagePath"])
        df_raw = _load_dataframe(local_data_path)
        
        protected_cols = audit.get("protectedCols", [])
        
        # Bin continuous protected cols to match pipeline behavior
        df, _ = auto_bin_protected_columns(df_raw, protected_cols)
        
        gemini = _get_causal_gemini_model()
        
        causal_res = run_causal_analysis(
            df=df,
            protected_cols=protected_cols,
            label_col=audit["labelCol"],
            positive_label=audit.get("positiveLabel", 1),
            domain=audit.get("domain", "Other"),
            gemini_model=gemini,
        )
        
        # Save cache back to Firestore (stored as JSON string to match schema fields pattern)
        db.collection("audits").document(audit_id).update({
            "causalFairness": json.dumps(causal_res)
        })
        
        return causal_res

    except Exception as e:
        logger.error(f"On-demand causal analysis failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Causal analysis failed: {str(e)}",
        )
    finally:
        if local_data_path:
            cleanup_temp_file(local_data_path)
