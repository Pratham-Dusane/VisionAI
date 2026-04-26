"""
Generative Shadow Testing - Zero-Shot Fairness (v2)
Statistical synthetic profile generation for missing demographic intersections.
No LLM dependency — profiles are sampled from approved-applicant median distributions.
"""

import uuid
from itertools import combinations
from typing import List, Dict, Any, Optional
import numpy as np
import pandas as pd


# ─── Configuration ───────────────────────────────────────────────────
PROFILES_PER_INTERSECTION = 100   # statistically significant sample size
MAX_INTERSECTIONS = 15            # cap to keep runtime reasonable
STATISTICAL_SIGNIFICANCE_N = 30   # minimum n for disparity flag


def get_existing_intersections(
    df: pd.DataFrame,
    protected_cols: List[str],
) -> List[str]:
    """Get unique intersection keys present in dataset."""
    valid_cols = [c for c in protected_cols if c in df.columns]
    if not valid_cols:
        return []

    intersections = set()
    for _, row in df[valid_cols].drop_duplicates().iterrows():
        key = "|".join(str(row[c]) for c in valid_cols)
        intersections.add(key)

    return list(intersections)


def _get_missing_intersections(
    df: pd.DataFrame,
    protected_cols: List[str],
    existing: List[str],
) -> List[Dict[str, Any]]:
    """
    Identify demographic intersections NOT present in the dataset.
    Returns list of dicts like {'gender': 'Female', 'race': 'Other'}.
    """
    valid_cols = [c for c in protected_cols if c in df.columns]
    if len(valid_cols) < 2:
        # With 1 column, generate missing values from known categories
        if len(valid_cols) == 1:
            col = valid_cols[0]
            present = set(df[col].dropna().unique())
            # Can't generate missing from nothing — return empty
            return []
        return []

    existing_set = set(existing)

    # Build all possible combos from unique values in each column
    value_lists = [df[c].dropna().unique().tolist() for c in valid_cols]
    # Cartesian product
    from itertools import product
    all_combos = list(product(*value_lists))

    missing = []
    for combo in all_combos:
        key = "|".join(str(v) for v in combo)
        if key not in existing_set:
            missing.append(dict(zip(valid_cols, combo)))

    return missing[:MAX_INTERSECTIONS]


def _compute_approved_medians(
    df: pd.DataFrame,
    label_col: str,
    positive_label: str,
) -> Dict[str, float]:
    """
    Compute median values of numeric features from APPROVED applicants.
    This creates the "highly qualified financial baseline" for shadow profiles.
    """
    col = df[label_col]
    # Try direct match
    mask = col == positive_label
    if mask.sum() == 0:
        # Numeric fallback
        try:
            num = float(positive_label)
            mask = col.astype(float) == num
        except (ValueError, TypeError):
            pass
    if mask.sum() == 0:
        # String fallback
        try:
            mask = col.astype(str).str.lower() == str(positive_label).lower()
        except Exception:
            pass

    approved = df[mask] if mask.sum() > 0 else df

    medians = {}
    for c in approved.columns:
        if c == label_col:
            continue
        if pd.api.types.is_numeric_dtype(approved[c]):
            medians[c] = float(approved[c].median())
    return medians


def _compute_column_modes(
    df: pd.DataFrame,
    label_col: str,
    protected_cols: List[str],
) -> Dict[str, Any]:
    """Compute mode (most frequent value) for categorical non-protected columns."""
    modes = {}
    for c in df.columns:
        if c == label_col or c in protected_cols:
            continue
        if not pd.api.types.is_numeric_dtype(df[c]):
            mode_vals = df[c].dropna().mode()
            if len(mode_vals) > 0:
                modes[c] = mode_vals.iloc[0]
    return modes


def generate_shadow_profiles(
    df: pd.DataFrame,
    label_col: str,
    positive_label: str,
    protected_cols: List[str],
    existing_intersections: List[str],
    profiles_per_intersection: int = PROFILES_PER_INTERSECTION,
) -> tuple[pd.DataFrame, List[Dict[str, Any]]]:
    """
    Generate synthetic profiles for missing demographic intersections
    using approved-applicant median financial baselines.

    Returns:
        (shadow_df, missing_intersections)
        shadow_df: DataFrame with all feature columns + demographics
        missing_intersections: list of intersection dicts that were generated
    """
    valid_cols = [c for c in protected_cols if c in df.columns]
    feature_cols = [c for c in df.columns if c != label_col]

    # Find missing intersections
    missing = _get_missing_intersections(df, valid_cols, existing_intersections)
    if not missing:
        return pd.DataFrame(columns=feature_cols), []

    # Compute financial baselines from approved applicants
    approved_medians = _compute_approved_medians(df, label_col, positive_label)
    cat_modes = _compute_column_modes(df, label_col, valid_cols)

    # Add small noise to numeric features for realism
    rng = np.random.default_rng(42)

    all_rows = []
    for intersection in missing:
        for i in range(profiles_per_intersection):
            row: Dict[str, Any] = {}

            for col in feature_cols:
                if col in intersection:
                    # Protected attribute value from this intersection
                    row[col] = intersection[col]
                elif col.lower() in ('applicant_id', 'id', 'application_id', 'loan_id'):
                    # Generate dummy ID
                    row[col] = f"SHADOW-{uuid.uuid4().hex[:8].upper()}"
                elif col in approved_medians:
                    # Numeric feature: sample from median ± 10% noise
                    median_val = approved_medians[col]
                    noise = rng.normal(0, abs(median_val) * 0.10) if median_val != 0 else 0
                    val = median_val + noise

                    # Respect original dtype
                    if pd.api.types.is_integer_dtype(df[col]):
                        val = int(round(val))
                    else:
                        val = round(val, 4)

                    # Clamp to observed range
                    col_min = float(df[col].min())
                    col_max = float(df[col].max())
                    val = max(col_min, min(col_max, val))
                    row[col] = val
                elif col in cat_modes:
                    # Categorical: use mode
                    row[col] = cat_modes[col]
                else:
                    # Fallback: None (will be median-filled during prediction)
                    row[col] = None

            all_rows.append(row)

    shadow_df = pd.DataFrame(all_rows, columns=feature_cols)
    return shadow_df, missing


def compute_shadow_summary(
    results: List[Dict[str, Any]],
    baseline_positive_rate: float,
    protected_cols: List[str],
) -> Dict[str, Any]:
    """
    Compute per-intersection summary statistics from shadow test results.

    Returns summary dict with intersection-level DI analysis.
    """
    # Group results by intersection
    intersection_groups: Dict[str, List[Dict]] = {}
    for r in results:
        demo = r.get("demographics", {})
        key = " × ".join(f"{k}={v}" for k, v in sorted(demo.items()))
        if key not in intersection_groups:
            intersection_groups[key] = []
        intersection_groups[key].append(r)

    intersections = []
    flagged_count = 0

    for name, group in sorted(intersection_groups.items()):
        n = len(group)
        accepts = sum(1 for r in group if r.get("decision") == "ACCEPT")
        approval_rate = round(accepts / n, 4) if n > 0 else 0

        # DI = shadow approval rate / baseline positive rate
        di = round(approval_rate / baseline_positive_rate, 4) if baseline_positive_rate > 0 else None

        # Only flag disparity if statistically significant
        disparity = False
        if di is not None and di < 0.80 and n >= STATISTICAL_SIGNIFICANCE_N:
            disparity = True
            flagged_count += 1

        intersections.append({
            "name": name,
            "n": n,
            "approvalRate": approval_rate,
            "di": di,
            "disparity": disparity,
        })

    # Sort: disparities first, then by DI ascending
    intersections.sort(key=lambda x: (not x["disparity"], x["di"] or 1.0))

    total = len(results)
    total_accepts = sum(1 for r in results if r.get("decision") == "ACCEPT")
    total_rejects = sum(1 for r in results if r.get("decision") == "REJECT")

    return {
        "totalGenerated": total,
        "baselinePositiveRate": baseline_positive_rate,
        "accepts": total_accepts,
        "rejects": total_rejects,
        "overallApprovalRate": round(total_accepts / total, 4) if total > 0 else 0,
        "intersections": intersections,
        "flaggedCount": flagged_count,
    }
