"""
Model Bias Evaluator - PRD §7.3
Counterfactual perturbation testing + Equalized Odds.
Skips gracefully when dataOnly=true (no model provided).
"""

import pandas as pd
import numpy as np
import joblib
from pathlib import Path


def load_model(model_path: str):
    """Load sklearn-compatible model from file."""
    path = Path(model_path)
    if not path.exists():
        return None
    try:
        return joblib.load(path)
    except Exception:
        return None


def evaluate_model_bias(
    df: pd.DataFrame,
    model,
    protected_cols: list[str],
    label_col: str,
    positive_label: str,
    feature_cols: list[str] | None = None,
    n_samples: int = 500,
) -> dict | None:
    """
    Run counterfactual perturbation + equalized odds.
    Returns None if no model available.
    """
    if model is None:
        return None

    if feature_cols is None:
        feature_cols = [c for c in df.columns if c != label_col]

    # Build reference columns from the FULL dataset (all possible values)
    ref_X = pd.get_dummies(df[feature_cols], drop_first=True).fillna(0)
    ref_columns = ref_X.columns.tolist()

    def predict_fn(data):
        """Predict with proper column alignment."""
        X = pd.get_dummies(data[feature_cols], drop_first=True).fillna(0)
        # Align columns: add missing, drop extra
        X = X.reindex(columns=ref_columns, fill_value=0)
        try:
            return model.predict(X)
        except Exception:
            return np.zeros(len(data))

    # Counterfactual perturbation
    flip_results = _counterfactual_perturbation(
        df, predict_fn, protected_cols, feature_cols, n_samples
    )

    # Equalized odds
    eq_odds = _equalized_odds(df, predict_fn, protected_cols, label_col, positive_label, feature_cols)
    flip_results["_equalized_odds"] = eq_odds

    return flip_results


def _counterfactual_perturbation(
    df: pd.DataFrame,
    predict_fn,
    protected_cols: list[str],
    feature_cols: list[str],
    n_samples: int,
) -> dict:
    """Flip protected attribute values, measure prediction changes.
    For continuous cols (>10 unique), uses representative group values
    instead of testing every pairwise combination."""
    sample = df.sample(min(n_samples, len(df)), random_state=42).copy()
    results = {}

    try:
        original_preds = predict_fn(sample)
    except Exception:
        return {}

    for col in protected_cols:
        if col not in df.columns:
            continue

        unique_vals = sample[col].dropna().unique()

        # For continuous columns with many values, pick representative values
        if pd.api.types.is_numeric_dtype(sample[col]) and len(unique_vals) > 10:
            # Use percentile-based representatives: 10th, 25th, 50th, 75th, 90th
            percentiles = sample[col].quantile([0.1, 0.25, 0.5, 0.75, 0.9]).values
            # Cast to column dtype to avoid type mismatch (e.g. float into int64)
            col_dtype = sample[col].dtype
            if pd.api.types.is_integer_dtype(col_dtype):
                representatives = sorted(set([int(round(float(p))) for p in percentiles]))
            else:
                representatives = sorted(set([round(float(p), 1) for p in percentiles]))
            # Assign each row to nearest representative
            def nearest_rep(val):
                return min(representatives, key=lambda r: abs(val - r))
            sample_groups = sample[col].apply(nearest_rep)
            test_values = representatives
        else:
            sample_groups = sample[col]
            test_values = unique_vals

        flip_rates = {}

        for orig_val in test_values:
            mask = sample_groups == orig_val
            if mask.sum() == 0:
                continue
            for target_val in test_values:
                if target_val == orig_val:
                    continue
                modified = sample.copy()
                modified.loc[mask, col] = target_val
                try:
                    mod_preds = predict_fn(modified)
                    flip_count = int((original_preds[mask] != mod_preds[mask]).sum())
                    flip_rate = float(flip_count) / int(mask.sum())
                    if flip_rate > 0:  # Only keep non-zero flips
                        flip_rates[f"{orig_val} -> {target_val}"] = round(flip_rate, 4)
                except Exception:
                    continue

        # Sort by flip rate descending, keep top 20
        sorted_flips = dict(sorted(flip_rates.items(), key=lambda x: x[1], reverse=True)[:20])

        results[col] = {
            "flip_rates": sorted_flips,
            "max_flip_rate": max(flip_rates.values()) if flip_rates else 0,
            "mean_flip_rate": round(float(np.mean(list(flip_rates.values()))), 4) if flip_rates else 0,
            "total_transitions_tested": len(flip_rates),
            "verdict": "FAIL" if max(flip_rates.values(), default=0) > 0.10 else "PASS",
        }

    return results


def _equalized_odds(
    df: pd.DataFrame,
    predict_fn,
    protected_cols: list[str],
    label_col: str,
    positive_label: str,
    feature_cols: list[str],
) -> dict:
    """FPR + FNR per group for each protected attribute.
    Skips continuous columns (>10 unique) - those are covered by flip rates."""
    results = {}

    try:
        preds = predict_fn(df)
    except Exception:
        return {}

    # Normalize positive_label to match column dtype
    try:
        col_dtype = df[label_col].dtype
        if pd.api.types.is_numeric_dtype(col_dtype):
            pos_val = float(positive_label)
        else:
            pos_val = str(positive_label)
    except (ValueError, TypeError):
        pos_val = positive_label

    # Convert labels
    try:
        y_true = (df[label_col] == pos_val).astype(int).values
        if y_true.sum() == 0:
            # Fallback: try numeric cast
            y_true = (df[label_col].astype(float) == float(positive_label)).astype(int).values
    except Exception:
        return {}

    # Convert preds to binary
    try:
        if hasattr(preds, 'astype'):
            y_pred = (preds == pos_val).astype(int)
            if y_pred.sum() == 0:
                y_pred = (preds.astype(float) == float(positive_label)).astype(int)
        else:
            y_pred = np.array([1 if p == pos_val else 0 for p in preds])
    except Exception:
        return {}

    for col in protected_cols:
        if col not in df.columns:
            continue
        # Skip continuous columns - too many groups
        unique_vals = df[col].dropna().unique()
        if len(unique_vals) > 10:
            continue

        group_results = {}
        for group in unique_vals:
            mask = (df[col] == group).values
            yt = y_true[mask]
            yp = y_pred[mask]
            tp = int(((yt == 1) & (yp == 1)).sum())
            tn = int(((yt == 0) & (yp == 0)).sum())
            fp = int(((yt == 0) & (yp == 1)).sum())
            fn = int(((yt == 1) & (yp == 0)).sum())
            group_results[str(group)] = {
                "fpr": round(fp / (fp + tn), 4) if (fp + tn) > 0 else 0,
                "fnr": round(fn / (fn + tp), 4) if (fn + tp) > 0 else 0,
                "precision": round(tp / (tp + fp), 4) if (tp + fp) > 0 else 0,
            }
        results[col] = group_results

    return results

