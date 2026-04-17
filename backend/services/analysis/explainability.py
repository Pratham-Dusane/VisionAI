"""
Explainability Layer — PRD §7.4
SHAP values per demographic group. Requires model.
Skips gracefully when dataOnly=true.
"""

import pandas as pd
import numpy as np


def compute_shap_by_group(
    model,
    df: pd.DataFrame,
    protected_col: str,
    feature_cols: list[str],
) -> dict | None:
    """
    Compute SHAP values for full dataset, split by demographic group.
    Compare mean absolute SHAP values. If feature has dramatically higher
    SHAP for one group, it's used differently for different demographics.
    """
    if model is None:
        return None

    try:
        import shap
    except ImportError:
        return {
            "shap_by_group": {},
            "disparity_flags": [],
            "error": "shap package not installed. Run: pip install shap",
        }

    X = df[feature_cols].copy()
    X = pd.get_dummies(X, drop_first=True).fillna(0)
    actual_cols = list(X.columns)

    try:
        # Try TreeExplainer first (fast for tree models)
        try:
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(X)
        except Exception:
            # Fallback to KernelExplainer (works for any model)
            background = shap.sample(X, min(50, len(X)))
            if hasattr(model, 'predict_proba'):
                explainer = shap.KernelExplainer(model.predict_proba, background)
            else:
                explainer = shap.KernelExplainer(model.predict, background)
            shap_values = explainer.shap_values(X)

        # Handle multi-class / multi-output SHAP values
        sv = np.array(shap_values)

        # TreeExplainer for binary classifiers: list of [class0_array, class1_array]
        if isinstance(shap_values, list) and len(shap_values) == 2:
            sv = np.array(shap_values[1])  # positive class

        # TreeExplainer can also return 3D: (n_samples, n_features, n_classes)
        if sv.ndim == 3:
            sv = sv[:, :, 1] if sv.shape[2] == 2 else sv[:, :, 0]

        # Final sanity check: must be 2D
        if sv.ndim != 2:
            return {
                "shap_by_group": {},
                "disparity_flags": [],
                "error": f"Unexpected SHAP output shape: {sv.shape}. Expected 2D array.",
            }

        # Build SHAP dataframe
        if sv.shape[1] != len(actual_cols):
            # Shape mismatch — truncate to min
            n = min(sv.shape[1], len(actual_cols))
            sv = sv[:, :n]
            actual_cols = actual_cols[:n]

        shap_df = pd.DataFrame(sv, columns=actual_cols, index=X.index)

        # Split by demographic group
        group_shap = {}
        for group in df[protected_col].dropna().unique():
            mask = df[protected_col] == group
            aligned_mask = mask.reindex(shap_df.index).fillna(False)
            group_shap[str(group)] = {
                col: round(float(shap_df.loc[aligned_mask, col].abs().mean()), 6)
                for col in actual_cols
            }

        # Find disparity flags — features with >2x difference between groups
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

        # Top features by mean absolute SHAP
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
    protected_cols: list[str],
    feature_cols: list[str],
) -> dict | None:
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
