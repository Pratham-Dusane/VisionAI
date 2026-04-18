"""
Data Bias Scanner - PRD §7.2
Disparate Impact, Statistical Parity Difference, label skew per group.
"""

import pandas as pd
import numpy as np


def scan_data_bias(
    df: pd.DataFrame,
    label_col: str,
    positive_label: str,
    protected_cols: list[str],
) -> dict:
    """
    For each protected attribute, compute DI ratio and SPD.
    Auto-detect privileged group (highest positive rate).
    """
    results = {}

    overall_pos_rate = _positive_rate(df, label_col, positive_label)

    for col in protected_cols:
        if col not in df.columns:
            continue

        groups = df[col].dropna().unique()
        if len(groups) < 2:
            continue

        # Compute positive rate per group
        group_rates = {}
        for g in groups:
            mask = df[col] == g
            rate = _positive_rate(df[mask], label_col, positive_label)
            group_rates[str(g)] = rate

        # Privileged = group with highest positive rate
        privileged = max(group_rates, key=group_rates.get)
        p_priv = group_rates[privileged]

        # Unprivileged = everyone else combined
        unpriv_mask = df[col] != _cast_value(df[col], privileged)
        p_unpriv = _positive_rate(df[unpriv_mask], label_col, positive_label)

        # Disparate Impact
        di = round(p_unpriv / p_priv, 4) if p_priv > 0 else None

        # Statistical Parity Difference
        spd = round(p_unpriv - p_priv, 4)

        # Verdict
        if di is None:
            verdict = "N/A"
            severity = "PASS"
        elif di < 0.6:
            verdict = "FAIL"
            severity = "CRITICAL"
        elif di < 0.8:
            verdict = "FAIL"
            severity = "HIGH"
        else:
            verdict = "PASS"
            severity = "PASS"

        # Label skew flags
        skew_flags = []
        for g, rate in group_rates.items():
            diff = abs(rate - overall_pos_rate)
            if diff > 0.15:
                skew_flags.append({
                    "group": g,
                    "positive_rate": round(rate, 4),
                    "deviation": round(diff, 4),
                })

        explanation = (
            f"Unprivileged groups receive positive outcomes at "
            f"{p_unpriv*100:.1f}% vs {p_priv*100:.1f}% for {privileged}. "
            f"DI of {di:.2f} is {'below' if di and di < 0.8 else 'above'} "
            f"the legal threshold of 0.80."
        ) if di else "Insufficient data to compute DI."

        results[col] = {
            "attribute": col,
            "privileged_group": privileged,
            "group_rates": {k: round(v, 4) for k, v in group_rates.items()},
            "metrics": {
                "disparate_impact": di,
                "statistical_parity_difference": spd,
                "positive_rate_privileged": round(p_priv, 4),
                "positive_rate_unprivileged": round(p_unpriv, 4),
            },
            "verdict": verdict,
            "severity": severity,
            "explanation": explanation,
            "skew_flags": skew_flags,
        }

    return results


def _positive_rate(df: pd.DataFrame, label_col: str, positive_label: str) -> float:
    """Flexible positive rate computation with type coercion."""
    if label_col not in df.columns or len(df) == 0:
        return 0.0

    col = df[label_col]

    # Try exact match
    count = (col == positive_label).sum()
    if count > 0:
        return count / len(df)

    # Try numeric
    try:
        num = float(positive_label)
        count = (col.astype(float) == num).sum()
        if count > 0:
            return count / len(df)
    except (ValueError, TypeError):
        pass

    # Case-insensitive string
    try:
        count = (col.astype(str).str.lower() == positive_label.lower()).sum()
        return count / len(df)
    except Exception:
        return 0.0


def _cast_value(series: pd.Series, val_str: str):
    """Cast string back to series dtype for comparison."""
    try:
        if pd.api.types.is_numeric_dtype(series):
            return float(val_str)
        return val_str
    except (ValueError, TypeError):
        return val_str
