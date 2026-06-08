"""
What-If Simulator router — PRD v2 §1
POST /api/audits/{audit_id}/whatif/predict  → live prediction + local sensitivity
GET  /api/audits/{audit_id}/whatif/random-row → random row from dataset
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any
from datetime import datetime
from pathlib import Path
import pandas as pd
import numpy as np
import math
import json
import logging

from services.analysis.model_bias_evaluator import load_model
from core.firebase_init import download_from_storage, cleanup_temp_file

router = APIRouter()
logger = logging.getLogger("whatif")


class WhatIfPredictRequest(BaseModel):
    features: dict[str, Any]
    threshold: float | None = None


# ── helpers (duplicated subset from audits.py to keep router self-contained) ──

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
    if isinstance(value, dict):
        return {str(k): _pythonize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_pythonize(v) for v in value]
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def _get_feature_columns(df: pd.DataFrame, label_col: str) -> list[str]:
    return [c for c in df.columns if c != label_col]


def _cast_like_series(series: pd.Series, value: Any) -> Any:
    if value is None:
        return None
    try:
        if pd.api.types.is_integer_dtype(series.dtype):
            return int(float(value))
        if pd.api.types.is_float_dtype(series.dtype):
            return float(value)
        if pd.api.types.is_bool_dtype(series.dtype):
            if isinstance(value, bool):
                return value
            return str(value).strip().lower() in {"1", "true", "yes", "y"}
    except Exception:
        pass
    return value


def _predict_scores(model, X: pd.DataFrame) -> np.ndarray:
    if hasattr(model, "predict_proba"):
        probs = np.asarray(model.predict_proba(X))
        if probs.ndim == 1:
            return probs
        if probs.shape[1] == 1:
            return probs[:, 0]
        return probs[:, -1]

    if hasattr(model, "decision_function"):
        raw = np.asarray(model.decision_function(X), dtype=float)
        if raw.ndim > 1:
            raw = raw[:, -1]
        min_v, max_v = float(np.min(raw)), float(np.max(raw))
        if max_v - min_v <= 1e-9:
            return np.full(len(raw), 0.5)
        return (raw - min_v) / (max_v - min_v)

    pred = model.predict(X)
    try:
        return np.asarray(pred, dtype=float)
    except Exception:
        s = pd.Series(pred).astype(str).str.lower()
        return np.where(s.isin(["1", "true", "yes", "approved", "positive"]), 1.0, 0.0)


def _build_model_matrix(model, feature_df: pd.DataFrame) -> pd.DataFrame:
    X = pd.get_dummies(feature_df, drop_first=True).fillna(0)
    if hasattr(model, "feature_names_in_"):
        X = X.reindex(columns=list(model.feature_names_in_), fill_value=0)
    return X


def _predict_single(model, df_features: pd.DataFrame, profile: dict, threshold: float):
    """Return (score, decision) for a single profile."""
    row_df = pd.DataFrame([profile], columns=df_features.columns)
    row_df = row_df.fillna(df_features.median(numeric_only=True).to_dict())

    if hasattr(model, "feature_names_in_"):
        X = _build_model_matrix(model, row_df)
    else:
        combined = pd.concat([df_features, row_df], ignore_index=True)
        X = pd.get_dummies(combined, drop_first=True).fillna(0).iloc[[-1]]

    score = float(_predict_scores(model, X)[0])
    return score, int(score >= threshold)


def _compute_contributions(
    model,
    df_features: pd.DataFrame,
    profile: dict,
    base_score: float,
    schema_columns: list[dict],
    protected_cols: list[str],
) -> dict[str, float]:
    """
    Fast local sensitivity: perturb each feature ±1 std (numeric) or flip
    to next category, measure prediction delta.
    """
    contributions: dict[str, float] = {}

    # Build stats lookup from schema columns
    stats_map: dict[str, dict] = {}
    for col_info in schema_columns:
        stats_map[col_info["name"]] = col_info

    for col in df_features.columns:
        if col in protected_cols:
            # Skip protected — don't show sensitivity to protected attrs
            continue

        col_info = stats_map.get(col, {})
        perturbed = dict(profile)

        if pd.api.types.is_numeric_dtype(df_features[col]):
            std = float(df_features[col].std())
            if std < 1e-9:
                contributions[col] = 0.0
                continue
            current_val = profile.get(col, 0)
            try:
                perturbed[col] = float(current_val) + std
            except (ValueError, TypeError):
                contributions[col] = 0.0
                continue
        else:
            # Categorical: flip to a different value
            unique_vals = df_features[col].dropna().unique().tolist()
            current_val = str(profile.get(col, ""))
            others = [str(v) for v in unique_vals if str(v) != current_val]
            if not others:
                contributions[col] = 0.0
                continue
            perturbed[col] = others[0]

        try:
            new_score, _ = _predict_single(model, df_features, perturbed, 0.5)
            contributions[col] = round(new_score - base_score, 4)
        except Exception:
            contributions[col] = 0.0

    return contributions


# ── Endpoints ──

@router.post("/{audit_id}/whatif/predict")
async def whatif_predict(audit_id: str, req: WhatIfPredictRequest):
    """Run live prediction on user-constructed profile + compute feature contributions."""
    local_data_path = None
    local_model_path = None
    try:
        from firebase_admin import firestore as fs
        db = fs.client()
        doc = db.collection("audits").document(audit_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")

        audit = doc.to_dict()

        if audit.get("dataOnly") or not audit.get("modelStoragePath"):
            raise HTTPException(
                status_code=400,
                detail="What-If Simulator requires a model-backed audit",
            )

        # Deserialize schema if stored as JSON string
        schema = audit.get("schema", {})
        if isinstance(schema, str):
            try:
                schema = json.loads(schema)
            except Exception:
                schema = {}

        local_data_path = download_from_storage(audit["storagePath"])
        local_model_path = download_from_storage(audit["modelStoragePath"])

        df = _load_dataframe(local_data_path)
        model = load_model(str(local_model_path))
        if model is None:
            raise HTTPException(status_code=400, detail="Unable to load model")

        label_col = audit["labelCol"]
        feature_cols = _get_feature_columns(df, label_col)
        df_features = df[feature_cols].copy()
        protected_cols = audit.get("protectedCols", [])
        threshold = float(
            req.threshold if req.threshold is not None
            else audit.get("threshold", 0.5)
        )

        # Build profile from features dict (fill missing with dataset defaults)
        profile: dict[str, Any] = {}
        seed_row = df_features.iloc[0].to_dict()
        for col in feature_cols:
            if col in req.features:
                profile[col] = _cast_like_series(df[col], req.features[col])
            else:
                profile[col] = seed_row.get(col)

        # Predict
        score, decision = _predict_single(model, df_features, profile, threshold)

        # Confidence (from raw probability spread)
        confidence = None
        if hasattr(model, "predict_proba"):
            confidence = max(score, 1.0 - score)

        # Feature contributions
        schema_columns = schema.get("columns", [])
        contributions = _compute_contributions(
            model, df_features, profile, score,
            schema_columns, protected_cols,
        )

        positive_label = str(audit.get("positiveLabel", "1"))
        prediction_label = positive_label if decision == 1 else "REJECTED"

        return {
            "auditId": audit_id,
            "prediction": prediction_label,
            "decision": "APPROVED" if decision == 1 else "REJECTED",
            "confidence": round(confidence, 4) if confidence else None,
            "rawScore": round(score, 4),
            "threshold": threshold,
            "featureContributions": _pythonize(contributions),
            "profile": _pythonize(profile),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"What-If predict failed: {e}")
        raise HTTPException(status_code=500, detail=f"What-If prediction failed: {str(e)}")
    finally:
        if local_data_path:
            cleanup_temp_file(local_data_path)
        if local_model_path:
            cleanup_temp_file(local_model_path)


@router.get("/{audit_id}/whatif/random-row")
async def whatif_random_row(audit_id: str):
    """Return a random row from the audit dataset as a feature dict."""
    local_data_path = None
    try:
        from firebase_admin import firestore as fs
        db = fs.client()
        doc = db.collection("audits").document(audit_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")

        audit = doc.to_dict()
        local_data_path = download_from_storage(audit["storagePath"])
        df = _load_dataframe(local_data_path)

        if df.empty:
            raise HTTPException(status_code=400, detail="Dataset is empty")

        label_col = audit.get("labelCol", "")
        feature_cols = _get_feature_columns(df, label_col)

        row = df[feature_cols].sample(1).iloc[0].to_dict()
        # Cast numpy types to native Python
        row = {k: (v.item() if hasattr(v, "item") else v) for k, v in row.items()}
        # Handle NaN
        row = {k: (None if isinstance(v, float) and math.isnan(v) else v) for k, v in row.items()}

        return {
            "auditId": audit_id,
            "features": row,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"What-If random-row failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch random row: {str(e)}")
    finally:
        if local_data_path:
            cleanup_temp_file(local_data_path)
