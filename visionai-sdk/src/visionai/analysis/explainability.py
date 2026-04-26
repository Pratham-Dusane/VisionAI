"""
Explainability Layer — SHAP values per demographic group.

Computes SHAP values and identifies features with disproportionate
impact across demographic groups. Requires ``shap`` package.
Install with: ``pip install visionai[shap]``
"""

import pandas as pd
import numpy as np


def compute_shap_by_group(
    model,
    df: pd.DataFrame,
    protected_col: str,
    feature_cols: list,
) -> dict:
    """
    Compute SHAP values for full dataset, split by demographic group.

    Returns dict with shap_by_group, disparity_flags, top_features.
    Returns None if model is None.
    """
    if model is None:
        return None

    try:
        import shap
    except ImportError:
        return {
            "shap_by_group": {},
            "disparity_flags": [],
            "error": "shap package not installed. Run: pip install visionai[shap]",
        }

    X = df[feature_cols].copy()
    X = pd.get_dummies(X, drop_first=True).fillna(0)
    actual_cols = list(X.columns)

    try:
        try:
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X)
        except Exception:
            background = shap.sample(X, min(50, len(X)))
            if hasattr(model, 'predict_proba'):
                explainer = shap.KernelExplainer(model.predict_proba, background)
            else:
                explainer = shap.KernelExplainer(model.predict, background)
            shap_values = explainer.shap_values(X)

        sv = np.array(shap_values)

        if isinstance(shap_values, list) and len(shap_values) == 2:
            sv = np.array(shap_values[1])

        if sv.ndim == 3:
            sv = sv[:, :, 1] if sv.shape[2] == 2 else sv[:, :, 0]

        if sv.ndim != 2:
            return {
                "shap_by_group": {},
                "disparity_flags": [],
                "error": f"Unexpected SHAP output shape: {sv.shape}",
            }

        if sv.shape[1] != len(actual_cols):
            n = min(sv.shape[1], len(actual_cols))
            sv = sv[:, :n]
            actual_cols = actual_cols[:n]

        shap_df = pd.DataFrame(sv, columns=actual_cols, index=X.index)

        group_shap = {}
        for group in df[protected_col].dropna().unique():
            mask = df[protected_col] == group
            aligned_mask = mask.reindex(shap_df.index).fillna(False)
            group_shap[str(group)] = {
                col: round(float(shap_df.loc[aligned_mask, col].abs().mean()), 6)
                for col in actual_cols
            }

        disparity_flags = []
        groups = list(group_shap.keys())
        if len(groups) >= 2:
            for feature in actual_cols:
                vals = [group_shap[g].get(feature, 0) for g in groups]
                max_v, min_v = max(vals), min(vals)
                if min_v > 0 and (max_v / min_v) > 2.0:
                    disparity_flags.append({
                        "feature": feature,
                        "disparity_ratio": round(max_v / min_v, 2),
                        "group_values": {g: round(group_shap[g].get(feature, 0), 4) for g in groups},
                        "explanation": (
                            f"'{feature}' has {max_v/min_v:.1f}x higher impact on decisions "
                            f"for some groups vs others."
                        ),
                    })

        overall_importance = {
            col: round(float(shap_df[col].abs().mean()), 6)
            for col in actual_cols
        }
        top_features = sorted(overall_importance.items(), key=lambda x: x[1], reverse=True)[:15]

        return {
            "shap_by_group": group_shap,
            "disparity_flags": sorted(disparity_flags, key=lambda x: x["disparity_ratio"], reverse=True),
            "top_features": [{"feature": f, "importance": v} for f, v in top_features],
        }

    except Exception as e:
        return {
            "shap_by_group": {},
            "disparity_flags": [],
            "error": f"SHAP computation failed: {str(e)}",
        }


def compute_explainability_all(
    model,
    df: pd.DataFrame,
    protected_cols: list,
    feature_cols: list,
) -> dict:
    """Run SHAP for each protected attribute."""
    if model is None:
        return None

    results = {}
    for col in protected_cols:
        if col not in df.columns:
            continue
        result = compute_shap_by_group(model, df, col, feature_cols)
        if result:
            results[col] = result

    return results if results else None
