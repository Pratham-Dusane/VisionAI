"""
Flip Sensitivity Score - PRD §7.9
How many feature changes needed to flip individual predictions.
Requires model. Skips when dataOnly.
"""

import pandas as pd
import numpy as np


def compute_flip_sensitivity(
    model,
    df: pd.DataFrame,
    feature_cols: list[str],
    protected_cols: list[str],
    max_rows: int = 200,
) -> dict | None:
    """
    For each individual, perturb non-protected features by ±1 std.
    Count how many features must change to flip prediction.
    Low flip count = vulnerable to arbitrary discrimination.
    """
    if model is None:
        return None

    non_protected = [c for c in feature_cols if c not in protected_cols]
    X = df[feature_cols].copy()

    # Limit rows for performance
    if len(X) > max_rows:
        X = X.sample(max_rows, random_state=42)

    try:
        X_numeric = pd.get_dummies(X, drop_first=True).fillna(0)
        base_preds = model.predict(X_numeric)
    except Exception:
        return None

    flip_counts = []

    for i in range(len(X)):
        row_flips = 0
        for feat in non_protected:
            if feat not in df.columns or not pd.api.types.is_numeric_dtype(df[feat]):
                continue
            std = df[feat].std()
            if std == 0:
                continue
            for delta in [std, -std]:
                try:
                    perturbed = X_numeric.iloc[i].copy()
                    if feat in perturbed.index:
                        perturbed[feat] = perturbed[feat] + delta
                    pred = model.predict(perturbed.values.reshape(1, -1))[0]
                    if pred != base_preds[i]:
                        row_flips += 1
                        break
                except Exception:
                    continue
        flip_counts.append(row_flips)

    flip_arr = np.array(flip_counts)
    vulnerable = int((flip_arr <= 1).sum())
    vuln_pct = round(float((flip_arr <= 1).mean() * 100), 2)

    return {
        "mean_flip_count": round(float(flip_arr.mean()), 2),
        "median_flip_count": round(float(np.median(flip_arr)), 2),
        "most_vulnerable_count": vulnerable,
        "most_vulnerable_percentage": vuln_pct,
        "explanation": (
            f"{vulnerable} individuals ({vuln_pct}% of sample) "
            f"are on the decision boundary - a single feature change flips their outcome."
        ),
    }
