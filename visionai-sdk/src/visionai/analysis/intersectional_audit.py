"""
Intersectional Audit — Pairwise protected attribute fairness analysis.

Computes DI for every combination of two protected attributes.
Groups below statistical significance threshold are flagged LOW_CONFIDENCE.
"""

from itertools import combinations
import pandas as pd

MIN_SAMPLE_SIGNIFICANT = 30


def intersectional_audit(
    df: pd.DataFrame,
    protected_cols: list,
    label_col: str,
    positive_label: str,
) -> list:
    """
    For every pair of protected attributes, compute DI for each intersection.

    Returns:
        List of intersection result dicts sorted by DI (ascending).
    """
    results = []
    overall_pos_rate = _pos_rate(df, label_col, positive_label)
    if overall_pos_rate == 0:
        return results

    min_group_floor = max(3, int(len(df) * 0.01))

    for col_a, col_b in combinations(protected_cols, 2):
        if col_a not in df.columns or col_b not in df.columns:
            continue

        for val_a in df[col_a].dropna().unique():
            for val_b in df[col_b].dropna().unique():
                mask = (df[col_a] == val_a) & (df[col_b] == val_b)
                group_df = df[mask]

                n = len(group_df)
                if n < min_group_floor:
                    continue

                pos_rate = _pos_rate(group_df, label_col, positive_label)
                di = round(pos_rate / overall_pos_rate, 4) if overall_pos_rate > 0 else None

                low_confidence = n < MIN_SAMPLE_SIGNIFICANT
                severity = "PASS"
                if di is not None:
                    if low_confidence:
                        severity = "LOW_CONFIDENCE" if di < 0.8 else "PASS"
                    else:
                        if di < 0.6:
                            severity = "CRITICAL"
                        elif di < 0.8:
                            severity = "HIGH"

                statistical_note = None
                if low_confidence and di is not None and di < 0.8:
                    statistical_note = (
                        f"Sample size n={n} is below the statistical significance "
                        f"threshold (n>={MIN_SAMPLE_SIGNIFICANT}). This disparity may "
                        f"reflect random variation rather than systemic bias."
                    )

                results.append({
                    "group": f"{col_a}={val_a} x {col_b}={val_b}",
                    "col_a": col_a, "val_a": str(val_a),
                    "col_b": col_b, "val_b": str(val_b),
                    "sample_size": n,
                    "positive_rate": round(float(pos_rate), 4),
                    "di_vs_overall": di,
                    "severity": severity,
                    "low_confidence": low_confidence,
                    "statistical_note": statistical_note,
                })

    return sorted(results, key=lambda x: x.get("di_vs_overall") or 1.0)


def _pos_rate(df, label_col, positive_label):
    if label_col not in df.columns or len(df) == 0:
        return 0.0
    col = df[label_col]
    count = (col == positive_label).sum()
    if count > 0:
        return count / len(df)
    try:
        num = float(positive_label)
        count = (col.astype(float) == num).sum()
        return count / len(df) if count > 0 else 0.0
    except (ValueError, TypeError):
        pass
    try:
        count = (col.astype(str).str.lower() == positive_label.lower()).sum()
        return count / len(df)
    except Exception:
        return 0.0
