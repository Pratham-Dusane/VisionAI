"""
Audit router - Create, retrieve, list audits.
Runs full analysis pipeline (Phase 4) async via BackgroundTasks.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path
from typing import Any
from itertools import combinations
import numpy as np
import pandas as pd
import traceback
import math

from services.analysis.pipeline import run_full_pipeline
from services.analysis.model_bias_evaluator import load_model
from services.analysis.data_bias_scanner import scan_data_bias
from services.analysis.severity_scorer import compute_severity_score
from services.reporting.audit_serializer import serialize_legal_export
from services.reporting.audit_serializer import serialize_anonymized_export
from services.reporting.pdf_generator import generate_audit_pdf_bytes
from services.reporting.pdf_generator import generate_anonymized_audit_pdf_bytes
from services.gemini.stakeholder_formatter import get_cached_narrative_sync
from services.org_settings import get_org_settings
from core.firebase_init import download_from_storage, cleanup_temp_file

try:
    from google.cloud import bigquery
except Exception:
    bigquery = None

from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

router = APIRouter()


def _build_pdf_branding(db, audit: dict) -> dict:
    org_name = "Organization"
    org_logo_url = ""
    org_id = audit.get("orgId")

    if org_id:
        org_doc = db.collection("organizations").document(org_id).get()
        if org_doc.exists:
            org_data = org_doc.to_dict() or {}
            org_name = org_data.get("name") or org_name
            settings = org_data.get("settings", {}) or {}
            org_logo_url = str(settings.get("org_logo_url") or "").strip()

    stakeholder = str(audit.get("stakeholder") or "Technical Stakeholder")
    return {
        "orgName": org_name,
        "orgLogoUrl": org_logo_url,
        "stakeholder": stakeholder,
    }


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


class PredictRequest(BaseModel):
    values: dict[str, Any]
    threshold: float | None = None


class MinimumFlipRequest(BaseModel):
    values: dict[str, Any]
    threshold: float | None = None
    maxChanges: int = 3


class RedTeamRequest(BaseModel):
    minGroupSize: int = 25


def _pythonize(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _pythonize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_pythonize(v) for v in value]
    if isinstance(value, tuple):
        return [_pythonize(v) for v in value]
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def _value_equals(a: Any, b: Any) -> bool:
    if pd.isna(a) and pd.isna(b):
        return True
    return str(a) == str(b)


def _to_json_row(row: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in row.items():
        if pd.isna(v):
            out[k] = None
        else:
            out[k] = _pythonize(v)
    return out


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


def _get_feature_columns(df: pd.DataFrame, label_col: str) -> list[str]:
    return [c for c in df.columns if c != label_col]


def _build_input_profile(
    df: pd.DataFrame,
    label_col: str,
    values: dict[str, Any],
) -> dict[str, Any]:
    feature_cols = _get_feature_columns(df, label_col)
    if not feature_cols:
        return {}

    seed_row = df[feature_cols].iloc[0].to_dict()
    profile: dict[str, Any] = {}

    for col in feature_cols:
        if col in values:
            profile[col] = _cast_like_series(df[col], values[col])
        else:
            profile[col] = seed_row.get(col)

    return profile


def _build_feature_frame_for_prediction(
    df_features: pd.DataFrame,
    profile: dict[str, Any],
) -> pd.DataFrame:
    row_df = pd.DataFrame([profile], columns=df_features.columns)
    row_df = row_df.fillna(df_features.median(numeric_only=True).to_dict())
    return row_df


def _build_model_matrix(model, feature_df: pd.DataFrame) -> pd.DataFrame:
    X = pd.get_dummies(feature_df, drop_first=True).fillna(0)
    if hasattr(model, "feature_names_in_"):
        X = X.reindex(columns=list(model.feature_names_in_), fill_value=0)
    return X


def _predict_scores_df(model, feature_df: pd.DataFrame) -> np.ndarray:
    X = _build_model_matrix(model, feature_df)
    return _predict_scores(model, X)


def _predict_single_profile(
    model,
    df_features: pd.DataFrame,
    profile: dict[str, Any],
    threshold: float,
) -> tuple[float, int]:
    row_df = _build_feature_frame_for_prediction(df_features, profile)

    # If model does not expose feature_names_in_, build a combined matrix so one-hot
    # categories are aligned with the source dataset.
    if hasattr(model, "feature_names_in_"):
        X_row = _build_model_matrix(model, row_df)
    else:
        combined = pd.concat([df_features, row_df], ignore_index=True)
        combined_X = pd.get_dummies(combined, drop_first=True).fillna(0)
        X_row = combined_X.iloc[[-1]].copy()

    score = float(_predict_scores(model, X_row)[0])
    decision = int(score >= threshold)
    return score, decision


def _candidate_values(series: pd.Series, cap: int = 10) -> list[Any]:
    s = series.dropna()
    if s.empty:
        return []

    if pd.api.types.is_numeric_dtype(s.dtype):
        qs = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]
        vals = sorted(set(float(v) for v in s.quantile(qs).tolist()))
        if pd.api.types.is_integer_dtype(s.dtype):
            vals = sorted(set(int(round(v)) for v in vals))
        return vals[:cap]

    freq_vals = s.astype(str).value_counts().head(cap).index.tolist()
    return freq_vals


def _extract_worst_di(data_bias: dict[str, Any]) -> float:
    worst_di = 1.0
    for result in data_bias.values():
        di = result.get("metrics", {}).get("disparate_impact")
        if isinstance(di, (int, float)):
            worst_di = min(worst_di, float(di))
    return round(worst_di, 4)


def _compute_sector_benchmark(
    db,
    org_id: str,
    domain: str,
    fairness_score: float,
    row_count: int,
    has_model: bool,
    di_worst: float,
) -> dict[str, Any]:
    settings = get_org_settings(db, org_id) if org_id else {}
    opt_in = bool(settings.get("benchmarking_opt_in", False))

    peer_scores: list[float] = []

    if bigquery is not None:
        try:
            bq = bigquery.Client()
            table_ref = "visionai_analytics.sector_benchmarks"

            if opt_in:
                bq.insert_rows_json(table_ref, [{
                    "audit_date": datetime.utcnow().isoformat(),
                    "domain": domain,
                    "fairness_score": fairness_score,
                    "di_worst": di_worst,
                    "has_model": has_model,
                    "row_count": row_count,
                    "opt_in": True,
                }])

            query = """
                SELECT fairness_score
                FROM `visionai_analytics.sector_benchmarks`
                WHERE domain = @domain AND opt_in = TRUE
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("domain", "STRING", domain),
                ]
            )
            rows = bq.query(query, job_config=job_config).result()
            peer_scores = [float(r.fairness_score) for r in rows if r.fairness_score is not None]
        except Exception:
            peer_scores = []

    if not peer_scores:
        if opt_in:
            db.collection("sector_benchmarks").add({
                "audit_date": datetime.utcnow().isoformat(),
                "domain": domain,
                "fairness_score": fairness_score,
                "di_worst": di_worst,
                "has_model": has_model,
                "row_count": row_count,
                "opt_in": True,
            })

        docs = (
            db.collection("sector_benchmarks")
            .where(filter=FieldFilter("domain", "==", domain))
            .where(filter=FieldFilter("opt_in", "==", True))
            .stream()
        )
        for doc in docs:
            data = doc.to_dict() or {}
            score = data.get("fairness_score")
            if isinstance(score, (int, float)):
                peer_scores.append(float(score))

    if not peer_scores:
        return {
            "domain": domain,
            "optedIn": opt_in,
            "peerCount": 0,
            "worseThanPercent": None,
            "outperformPercent": None,
            "message": "Benchmarking data is not available yet for this domain.",
            "computedAt": datetime.utcnow().isoformat(),
        }

    higher = sum(1 for s in peer_scores if s > fairness_score)
    lower = sum(1 for s in peer_scores if s < fairness_score)
    count = len(peer_scores)

    worse_than_pct = round((higher / count) * 100, 1)
    outperform_pct = round((lower / count) * 100, 1)

    return {
        "domain": domain,
        "optedIn": opt_in,
        "peerCount": count,
        "worseThanPercent": worse_than_pct,
        "outperformPercent": outperform_pct,
        "message": (
            f"Your model's fairness score of {round(fairness_score, 1)} is lower than "
            f"{worse_than_pct}% of {domain} models audited on VisionAI."
        ),
        "computedAt": datetime.utcnow().isoformat(),
    }


def _find_minimum_flip(
    model,
    df: pd.DataFrame,
    audit: dict,
    values: dict[str, Any],
    threshold: float,
    max_changes: int,
) -> dict[str, Any]:
    label_col = audit["labelCol"]
    protected_cols = set(audit.get("protectedCols", []))
    feature_cols = _get_feature_columns(df, label_col)
    df_features = df[feature_cols].copy()

    current_profile = _build_input_profile(df, label_col, values)
    current_score, current_decision = _predict_single_profile(model, df_features, current_profile, threshold)

    if current_decision == 1:
        return {
            "flipped": False,
            "alreadyAccepted": True,
            "threshold": threshold,
            "currentDecision": "ACCEPT",
            "currentScore": round(current_score, 4),
            "currentProfile": _to_json_row(current_profile),
            "acceptedProfile": _to_json_row(current_profile),
            "changedFields": [],
        }

    editable_features = [c for c in feature_cols if c not in protected_cols]
    candidate_map = {c: _candidate_values(df[c]) for c in editable_features}
    changed_fields: list[dict[str, Any]] = []
    seen = set()

    for _ in range(max(1, min(max_changes, 6))):
        best = None
        for feature in editable_features:
            if feature in seen:
                continue

            candidates = candidate_map.get(feature, [])
            for candidate in candidates:
                if _value_equals(candidate, current_profile.get(feature)):
                    continue

                trial_profile = dict(current_profile)
                trial_profile[feature] = _cast_like_series(df[feature], candidate)

                trial_score, trial_decision = _predict_single_profile(
                    model,
                    df_features,
                    trial_profile,
                    threshold,
                )

                if best is None or trial_score > best["score"]:
                    best = {
                        "feature": feature,
                        "old": current_profile.get(feature),
                        "new": trial_profile.get(feature),
                        "score": trial_score,
                        "decision": trial_decision,
                        "profile": trial_profile,
                    }

        if not best:
            break

        current_profile = best["profile"]
        current_score = float(best["score"])
        current_decision = int(best["decision"])
        seen.add(best["feature"])

        changed_fields.append({
            "feature": best["feature"],
            "from": _pythonize(best["old"]),
            "to": _pythonize(best["new"]),
        })

        if current_decision == 1:
            break

    return {
        "flipped": current_decision == 1,
        "alreadyAccepted": False,
        "threshold": threshold,
        "currentDecision": "REJECT",
        "currentScore": round(float(current_score), 4),
        "currentProfile": _to_json_row(_build_input_profile(df, label_col, values)),
        "acceptedProfile": _to_json_row(current_profile) if current_decision == 1 else None,
        "changedFields": changed_fields,
    }


def _run_red_team(
    model,
    df: pd.DataFrame,
    audit: dict,
    min_group_size: int,
) -> dict[str, Any]:
    label_col = audit["labelCol"]
    protected_cols = [c for c in audit.get("protectedCols", []) if c in df.columns]
    if not protected_cols:
        raise ValueError("Red-team analysis requires protected attributes.")

    feature_cols = _get_feature_columns(df, label_col)
    scores = _predict_scores_df(model, df[feature_cols])

    thresholds = [round(x, 2) for x in np.arange(0.1, 0.901, 0.02)]
    slice_candidates: list[dict[str, Any]] = []

    max_combo = min(3, len(protected_cols))
    for size in range(1, max_combo + 1):
        for cols in combinations(protected_cols, size):
            group_df = (
                df[list(cols)]
                .dropna()
                .groupby(list(cols))
                .size()
                .reset_index(name="count")
            )

            for _, row in group_df.iterrows():
                if int(row["count"]) < min_group_size:
                    continue

                criteria = {col: row[col] for col in cols}
                slice_candidates.append({
                    "columns": list(cols),
                    "criteria": criteria,
                    "count": int(row["count"]),
                })

    if not slice_candidates:
        raise ValueError("No demographic slices met the minimum group size.")

    worst = None
    evaluated = 0

    for threshold in thresholds:
        preds = (scores >= threshold).astype(int)

        for candidate in slice_candidates:
            mask = np.ones(len(df), dtype=bool)
            for col, val in candidate["criteria"].items():
                mask &= (df[col] == val).values

            if mask.sum() < min_group_size or (~mask).sum() == 0:
                continue

            subgroup_rate = float(preds[mask].mean()) if mask.sum() else 0.0
            reference_rate = float(preds[~mask].mean()) if (~mask).sum() else 0.0
            if reference_rate <= 0:
                continue

            di = subgroup_rate / reference_rate
            spd = subgroup_rate - reference_rate
            evaluated += 1

            if worst is None or di < worst["diRatio"]:
                parts = [f"{k}={v}" for k, v in candidate["criteria"].items()]
                slice_label = ", ".join(parts)
                worst = {
                    "threshold": threshold,
                    "slice": slice_label,
                    "criteria": _pythonize(candidate["criteria"]),
                    "sampleSize": int(mask.sum()),
                    "diRatio": round(float(di), 4),
                    "statisticalParityDifference": round(float(spd), 4),
                    "subgroupPositiveRate": round(subgroup_rate, 4),
                    "referencePositiveRate": round(reference_rate, 4),
                }

    if worst is None:
        raise ValueError("Unable to identify a valid worst-case demographic slice.")

    worst["message"] = (
        f"Worst case found: At threshold {worst['threshold']}, {worst['slice']} face a DI of "
        f"{worst['diRatio']} - the most discriminated-against configuration in your model."
    )

    return {
        "auditId": audit.get("id"),
        "evaluatedThresholds": len(thresholds),
        "evaluatedSlices": len(slice_candidates),
        "evaluationsRun": evaluated,
        "worstCase": worst,
        "computedAt": datetime.utcnow().isoformat(),
    }


def _build_plain_english_influences(
    model,
    df_features: pd.DataFrame,
    profile: dict[str, Any],
    explainability: dict[str, Any],
) -> list[dict[str, Any]]:
    row_df = _build_feature_frame_for_prediction(df_features, profile)

    if hasattr(model, "coef_"):
        if hasattr(model, "feature_names_in_"):
            X_row = _build_model_matrix(model, row_df)
            feature_names = list(X_row.columns)
        else:
            combined = pd.concat([df_features, row_df], ignore_index=True)
            X = pd.get_dummies(combined, drop_first=True).fillna(0)
            X_row = X.iloc[[-1]]
            feature_names = list(X_row.columns)

        coef = np.asarray(model.coef_, dtype=float)
        if coef.ndim > 1:
            coef = coef[-1]

        vec = X_row.iloc[0].values.astype(float)
        contrib = coef[: len(vec)] * vec[: len(coef)]

        idx = np.argsort(np.abs(contrib))[::-1][:4]
        out = []
        for i in idx:
            impact = float(contrib[i])
            direction = "increased" if impact >= 0 else "decreased"
            out.append({
                "feature": feature_names[i],
                "impact": round(impact, 4),
                "explanation": (
                    f"Your value on '{feature_names[i]}' {direction} the model score in this decision."
                ),
            })
        return out

    fallback = []
    for attr_data in explainability.values():
        top_features = attr_data.get("top_features", []) if isinstance(attr_data, dict) else []
        for item in top_features[:4]:
            fallback.append({
                "feature": item.get("feature"),
                "impact": item.get("importance"),
                "explanation": (
                    f"'{item.get('feature')}' was one of the strongest contributors in the model's global analysis."
                ),
            })
        if fallback:
            return fallback

    return []


def _build_bias_context(audit: dict, row: pd.Series) -> dict[str, Any]:
    data_bias = audit.get("dataBias", {})
    protected_cols = audit.get("protectedCols", [])

    concerns: list[str] = []
    for col in protected_cols:
        if col not in data_bias or col not in row.index:
            continue

        finding = data_bias[col]
        di = finding.get("metrics", {}).get("disparate_impact")
        privileged = finding.get("privileged_group")
        row_group = row[col]

        if isinstance(di, (int, float)) and di < 0.8 and str(row_group) != str(privileged):
            concerns.append(
                f"Applicants in group '{row_group}' for '{col}' were found to have lower approval rates in this audit."
            )

    return {
        "systemicBiasDetected": len(concerns) > 0,
        "notes": concerns,
    }


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
        db = firestore.client()
        results = run_full_pipeline(config, audit_id)

        fairness_score = float(results.get("severity", {}).get("fairness_score", 0))
        benchmark = _compute_sector_benchmark(
            db=db,
            org_id=config.get("orgId", ""),
            domain=config.get("domain", "Other"),
            fairness_score=fairness_score,
            row_count=int(results.get("schema", {}).get("row_count", 0)),
            has_model=not bool(config.get("dataOnly", True)),
            di_worst=_extract_worst_di(results.get("dataBias", {})),
        )

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
            "biasOriginTracer": results.get("biasOriginTracer", []),
            "modelDecisionBias": results.get("modelDecisionBias", {}),
            "benchmarking": benchmark,
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
        branding = _build_pdf_branding(db, audit)
        pdf_bytes = generate_audit_pdf_bytes(audit_id, audit, branding=branding)
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
    """Export anonymized whistleblower report as PDF."""
    try:
        db = firestore.client()
        doc = db.collection("audits").document(audit_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")

        audit = doc.to_dict()
        branding = _build_pdf_branding(db, audit)
        pdf_bytes = generate_anonymized_audit_pdf_bytes(audit_id, audit, branding=branding)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="audit-{audit_id}-anonymized.pdf"'
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


@router.get("/{audit_id}/narrative")
async def get_narrative_compat(audit_id: str, type: str = "technical"):
    """Compatibility endpoint: /narrative?type=technical|executive|legal."""
    return await get_narrative(audit_id, type)


@router.get("/{audit_id}/sample-row")
async def get_sample_row(audit_id: str):
    """Return a representative row that pre-populates the adversarial simulator form."""
    local_data_path = None
    try:
        db = firestore.client()
        doc = db.collection("audits").document(audit_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")

        audit = doc.to_dict()
        local_data_path = download_from_storage(audit["storagePath"])
        df = _load_dataframe(local_data_path)

        if df.empty:
            raise HTTPException(status_code=400, detail="Dataset is empty")

        row_index = min(3, len(df) - 1)
        row = df.iloc[row_index].to_dict()

        return {
            "auditId": audit_id,
            "rowIndex": int(row_index),
            "sampleRow": _to_json_row(row),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch sample row: {str(e)}")
    finally:
        if local_data_path:
            cleanup_temp_file(local_data_path)


@router.post("/{audit_id}/predict")
async def predict_decision(audit_id: str, req: PredictRequest):
    """Predict decision outcome for a custom profile row."""
    local_data_path = None
    local_model_path = None
    try:
        db = firestore.client()
        doc = db.collection("audits").document(audit_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")

        audit = doc.to_dict()
        if audit.get("dataOnly") or not audit.get("modelStoragePath"):
            raise HTTPException(status_code=400, detail="Predict endpoint requires a model-backed audit")

        local_data_path = download_from_storage(audit["storagePath"])
        local_model_path = download_from_storage(audit["modelStoragePath"])

        df = _load_dataframe(local_data_path)
        model = load_model(str(local_model_path))
        if model is None:
            raise HTTPException(status_code=400, detail="Unable to load model")

        threshold = float(req.threshold if req.threshold is not None else audit.get("threshold", 0.5))
        label_col = audit["labelCol"]
        feature_cols = _get_feature_columns(df, label_col)
        df_features = df[feature_cols].copy()
        profile = _build_input_profile(df, label_col, req.values)

        score, decision = _predict_single_profile(model, df_features, profile, threshold)
        return {
            "auditId": audit_id,
            "threshold": threshold,
            "score": round(float(score), 4),
            "decision": "ACCEPT" if decision == 1 else "REJECT",
            "profile": _to_json_row(profile),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to predict outcome: {str(e)}")
    finally:
        if local_data_path:
            cleanup_temp_file(local_data_path)
        if local_model_path:
            cleanup_temp_file(local_model_path)


@router.post("/{audit_id}/minimum-flip")
async def find_minimum_flip(audit_id: str, req: MinimumFlipRequest):
    """Greedy counterfactual search for minimum non-protected changes that flip a rejection."""
    local_data_path = None
    local_model_path = None
    try:
        db = firestore.client()
        doc = db.collection("audits").document(audit_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")

        audit = doc.to_dict()
        if audit.get("dataOnly") or not audit.get("modelStoragePath"):
            raise HTTPException(status_code=400, detail="Minimum flip endpoint requires a model-backed audit")

        local_data_path = download_from_storage(audit["storagePath"])
        local_model_path = download_from_storage(audit["modelStoragePath"])

        df = _load_dataframe(local_data_path)
        model = load_model(str(local_model_path))
        if model is None:
            raise HTTPException(status_code=400, detail="Unable to load model")

        threshold = float(req.threshold if req.threshold is not None else audit.get("threshold", 0.5))
        result = _find_minimum_flip(
            model=model,
            df=df,
            audit=audit,
            values=req.values,
            threshold=threshold,
            max_changes=int(req.maxChanges),
        )

        return {
            "auditId": audit_id,
            **result,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute minimum flip: {str(e)}")
    finally:
        if local_data_path:
            cleanup_temp_file(local_data_path)
        if local_model_path:
            cleanup_temp_file(local_model_path)


@router.post("/{audit_id}/red-team")
async def run_red_team(audit_id: str, req: RedTeamRequest):
    """Run adversarial threshold + demographic slice search and return worst-case fairness scenario."""
    local_data_path = None
    local_model_path = None
    try:
        db = firestore.client()
        doc_ref = db.collection("audits").document(audit_id)
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")

        audit = doc.to_dict()
        if audit.get("dataOnly") or not audit.get("modelStoragePath"):
            raise HTTPException(status_code=400, detail="Red-team endpoint requires a model-backed audit")

        local_data_path = download_from_storage(audit["storagePath"])
        local_model_path = download_from_storage(audit["modelStoragePath"])

        df = _load_dataframe(local_data_path)
        model = load_model(str(local_model_path))
        if model is None:
            raise HTTPException(status_code=400, detail="Unable to load model")

        audit_with_id = dict(audit)
        audit_with_id["id"] = audit_id

        result = _run_red_team(
            model=model,
            df=df,
            audit=audit_with_id,
            min_group_size=max(10, int(req.minGroupSize)),
        )

        doc_ref.update({
            "redTeamLatest": result,
            "updatedAt": datetime.utcnow().isoformat(),
        })

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to run red-team analysis: {str(e)}")
    finally:
        if local_data_path:
            cleanup_temp_file(local_data_path)
        if local_model_path:
            cleanup_temp_file(local_model_path)


@router.get("/{audit_id}/explain/{row_index}")
async def explain_rejection(audit_id: str, row_index: int):
    """Public explanation endpoint for Explain-My-Rejection mode."""
    local_data_path = None
    local_model_path = None
    try:
        db = firestore.client()
        doc = db.collection("audits").document(audit_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")

        audit = doc.to_dict()
        org_id = audit.get("orgId")
        settings = get_org_settings(db, org_id)
        if not settings.get("explain_rejection_enabled", False):
            raise HTTPException(status_code=403, detail="Explain My Rejection is disabled by this organization")

        if audit.get("dataOnly") or not audit.get("modelStoragePath"):
            raise HTTPException(status_code=400, detail="Explain endpoint requires a model-backed audit")

        local_data_path = download_from_storage(audit["storagePath"])
        local_model_path = download_from_storage(audit["modelStoragePath"])

        df = _load_dataframe(local_data_path)
        if row_index < 0 or row_index >= len(df):
            raise HTTPException(status_code=404, detail="Row index out of range")

        model = load_model(str(local_model_path))
        if model is None:
            raise HTTPException(status_code=400, detail="Unable to load model")

        row = df.iloc[row_index]
        label_col = audit["labelCol"]
        feature_cols = _get_feature_columns(df, label_col)
        df_features = df[feature_cols].copy()
        profile = _build_input_profile(df, label_col, row.to_dict())

        threshold = float(audit.get("threshold", 0.5))
        score, decision = _predict_single_profile(model, df_features, profile, threshold)
        influences = _build_plain_english_influences(
            model=model,
            df_features=df_features,
            profile=profile,
            explainability=audit.get("explainability", {}) or {},
        )

        counterfactual = _find_minimum_flip(
            model=model,
            df=df,
            audit=audit,
            values=profile,
            threshold=threshold,
            max_changes=3,
        )

        org_doc = db.collection("organizations").document(org_id).get() if org_id else None
        org_name = "Company A"
        if org_doc and org_doc.exists:
            org_name = org_doc.to_dict().get("name") or "Company A"

        bias_context = _build_bias_context(audit, row)

        return {
            "auditId": audit_id,
            "rowIndex": row_index,
            "organization": org_name,
            "decision": "ACCEPT" if decision == 1 else "REJECT",
            "score": round(float(score), 4),
            "message": (
                f"Based on our analysis of the automated decision system used by {org_name}, "
                "the following factors most influenced this outcome."
            ),
            "influences": influences,
            "counterfactual": {
                "changedFields": counterfactual.get("changedFields", []),
                "acceptedProfile": counterfactual.get("acceptedProfile"),
                "canFlip": bool(counterfactual.get("flipped", False)),
            },
            "biasContext": bias_context,
            "profile": _to_json_row(profile),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate explanation: {str(e)}")
    finally:
        if local_data_path:
            cleanup_temp_file(local_data_path)
        if local_model_path:
            cleanup_temp_file(local_model_path)
