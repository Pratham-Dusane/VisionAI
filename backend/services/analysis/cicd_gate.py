"""
Phase 8 CI/CD audit gate.
Runs a lightweight fairness evaluation suitable for deployment gating.
"""

from datetime import datetime
from pathlib import Path

import pandas as pd

from core.firebase_init import cleanup_temp_file, download_from_storage
from services.analysis.data_bias_scanner import scan_data_bias
from services.analysis.model_bias_evaluator import evaluate_model_bias, load_model
from services.analysis.severity_scorer import compute_severity_score
from services.preprocessing.auto_binner import auto_bin_protected_columns


def _load_dataframe(local_path: Path) -> pd.DataFrame:
    ext = local_path.suffix.lower()
    if ext == ".csv":
        return pd.read_csv(local_path)
    if ext == ".json":
        return pd.read_json(local_path)
    if ext == ".parquet":
        return pd.read_parquet(local_path)
    raise ValueError(f"Unsupported dataset format: {ext}")


def _build_violations(
    data_bias: dict,
    model_bias: dict | None,
    fairness_threshold: float,
    protected_cols: list[str],
) -> list[dict]:
    violations: list[dict] = []

    for attr in protected_cols:
        if attr not in data_bias:
            violations.append(
                {
                    "type": "INSUFFICIENT_GROUP_DIVERSITY",
                    "attribute": attr,
                    "measured": None,
                    "threshold": None,
                    "message": f"Unable to compute fairness metrics for {attr}. At least two groups are required.",
                }
            )

    for attr, result in data_bias.items():
        di = result.get("metrics", {}).get("disparate_impact")
        if isinstance(di, (int, float)) and float(di) < fairness_threshold:
            violations.append(
                {
                    "type": "DATA_DI_BELOW_THRESHOLD",
                    "attribute": attr,
                    "measured": round(float(di), 4),
                    "threshold": fairness_threshold,
                    "message": f"Disparate impact for {attr} is below the configured threshold.",
                }
            )

    if model_bias:
        for attr, result in model_bias.items():
            if attr == "_equalized_odds":
                continue

            max_flip = result.get("max_flip_rate")
            if isinstance(max_flip, (int, float)) and float(max_flip) > 0.2:
                violations.append(
                    {
                        "type": "MODEL_FLIP_RATE_HIGH",
                        "attribute": attr,
                        "measured": round(float(max_flip), 4),
                        "threshold": 0.2,
                        "message": f"Counterfactual flip rate for {attr} exceeds 0.2.",
                    }
                )

        eq_odds = model_bias.get("_equalized_odds", {})
        if isinstance(eq_odds, dict):
            for attr, groups in eq_odds.items():
                if not isinstance(groups, dict):
                    continue
                fprs = [
                    float(g.get("fpr", 0.0))
                    for g in groups.values()
                    if isinstance(g, dict)
                ]
                if len(fprs) >= 2:
                    gap = max(fprs) - min(fprs)
                    if gap > 0.1:
                        violations.append(
                            {
                                "type": "EQUALIZED_ODDS_FPR_GAP",
                                "attribute": attr,
                                "measured": round(float(gap), 4),
                                "threshold": 0.1,
                                "message": f"Equalized odds FPR gap for {attr} exceeds 0.1.",
                            }
                        )

    return violations


def run_cicd_audit_gate(config: dict) -> dict:
    """
    Lightweight fairness gate used by CI/CD.

    Required config keys:
      - dataset_gcs_path
      - label_col
      - positive_label
      - protected_cols
      - fairness_threshold
    Optional:
      - model_gcs_path
      - domain
    """
    started = datetime.utcnow()
    local_dataset_path = None
    local_model_path = None

    dataset_path = str(config.get("dataset_gcs_path", "")).strip()
    raw_model_path = config.get("model_gcs_path")
    model_path = str(raw_model_path).strip() if raw_model_path else ""
    label_col = str(config.get("label_col", "")).strip()
    positive_label = str(config.get("positive_label", "")).strip()
    protected_cols = [str(c).strip() for c in (config.get("protected_cols") or []) if str(c).strip()]
    fairness_threshold = float(config.get("fairness_threshold", 0.8))

    if not dataset_path:
        raise ValueError("dataset_gcs_path is required")
    if not label_col:
        raise ValueError("context.label_col is required")
    if not positive_label:
        raise ValueError("context.positive_label is required")
    if not protected_cols:
        raise ValueError("context.protected_cols is required")
    if fairness_threshold <= 0 or fairness_threshold > 1:
        raise ValueError("context.fairness_threshold must be > 0 and <= 1")

    try:
        local_dataset_path = download_from_storage(dataset_path)
        df_raw = _load_dataframe(local_dataset_path)

        if label_col not in df_raw.columns:
            raise ValueError(f"Label column '{label_col}' not found in dataset")

        missing_protected = [col for col in protected_cols if col not in df_raw.columns]
        if missing_protected:
            raise ValueError(f"Protected columns missing in dataset: {missing_protected}")

        # Bin continuous protected columns so group-level fairness metrics stay stable.
        df_binned, _ = auto_bin_protected_columns(df_raw.copy(), protected_cols)

        data_bias = scan_data_bias(
            df_binned,
            label_col,
            positive_label,
            protected_cols,
        )

        if not data_bias:
            raise ValueError(
                "Unable to compute fairness metrics. Ensure protected columns contain at least two groups."
            )

        model_bias = None
        if model_path:
            local_model_path = download_from_storage(model_path)
            model = load_model(str(local_model_path))
            if model is None:
                raise ValueError("Failed to load model from model_gcs_path")

            raw_feature_cols = [c for c in df_raw.columns if c != label_col]
            model_bias = evaluate_model_bias(
                df_raw,
                model,
                protected_cols,
                label_col,
                positive_label,
                raw_feature_cols,
                n_samples=min(120, len(df_raw)),
            )

        severity = compute_severity_score(
            data_bias=data_bias,
            proxies=[],
            intersectional=[],
            feature_laundering=[],
            model_bias=model_bias,
        )

        violations = _build_violations(
            data_bias,
            model_bias,
            fairness_threshold,
            protected_cols,
        )
        fairness_score = round(float(severity.get("fairness_score", 0.0)), 2)

        ended = datetime.utcnow()
        elapsed_ms = int((ended - started).total_seconds() * 1000)

        return {
            "status": "PASS" if len(violations) == 0 else "FAIL",
            "fairness_score": fairness_score,
            "letter_grade": severity.get("letter_grade", "?"),
            "violations": violations,
            "penalties": severity.get("penalties", []),
            "dataset": {
                "path": dataset_path,
                "row_count": int(len(df_raw)),
                "column_count": int(len(df_raw.columns)),
            },
            "model": {
                "path": model_path or None,
                "evaluated": bool(model_bias is not None),
            },
            "context": {
                "domain": config.get("domain", "other"),
                "label_col": label_col,
                "positive_label": positive_label,
                "protected_cols": protected_cols,
                "fairness_threshold": fairness_threshold,
            },
            "started_at": started.isoformat(),
            "completed_at": ended.isoformat(),
            "elapsed_ms": elapsed_ms,
        }
    finally:
        if local_dataset_path:
            cleanup_temp_file(local_dataset_path)
        if local_model_path:
            cleanup_temp_file(local_model_path)
