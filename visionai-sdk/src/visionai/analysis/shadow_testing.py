"""
Generative Shadow Testing — Zero-shot fairness via statistical synthetic profiles.
No LLM dependency. Profiles sampled from approved-applicant median distributions.
"""
import uuid
from itertools import combinations, product
import numpy as np
import pandas as pd

PROFILES_PER_INTERSECTION = 100
MAX_INTERSECTIONS = 15
STATISTICAL_SIGNIFICANCE_N = 30


def get_existing_intersections(df, protected_cols):
    """Get unique intersection keys present in dataset."""
    valid = [c for c in protected_cols if c in df.columns]
    if not valid:
        return []
    keys = set()
    for _, row in df[valid].drop_duplicates().iterrows():
        keys.add("|".join(str(row[c]) for c in valid))
    return list(keys)


def generate_shadow_profiles(df, label_col, positive_label, protected_cols, existing_intersections, profiles_per_intersection=PROFILES_PER_INTERSECTION):
    """Generate synthetic profiles for missing demographic intersections. Returns (shadow_df, missing_list)."""
    valid = [c for c in protected_cols if c in df.columns]
    feat_cols = [c for c in df.columns if c != label_col]
    missing = _get_missing(df, valid, set(existing_intersections))
    if not missing:
        return pd.DataFrame(columns=feat_cols), []
    medians = _approved_medians(df, label_col, positive_label)
    modes = _cat_modes(df, label_col, valid)
    rng = np.random.default_rng(42)
    rows = []
    for inter in missing:
        for _ in range(profiles_per_intersection):
            row = {}
            for col in feat_cols:
                if col in inter:
                    row[col] = inter[col]
                elif col.lower() in ('applicant_id', 'id', 'application_id', 'loan_id'):
                    row[col] = f"SHADOW-{uuid.uuid4().hex[:8].upper()}"
                elif col in medians:
                    m = medians[col]
                    noise = rng.normal(0, abs(m) * 0.10) if m != 0 else 0
                    v = m + noise
                    if pd.api.types.is_integer_dtype(df[col]):
                        v = int(round(v))
                    else:
                        v = round(v, 4)
                    v = max(float(df[col].min()), min(float(df[col].max()), v))
                    row[col] = v
                elif col in modes:
                    row[col] = modes[col]
                else:
                    row[col] = None
            rows.append(row)
    return pd.DataFrame(rows, columns=feat_cols), missing


def compute_shadow_summary(results, baseline_positive_rate, protected_cols):
    """Compute per-intersection summary statistics from shadow test results."""
    groups = {}
    for r in results:
        demo = r.get("demographics", {})
        key = " × ".join(f"{k}={v}" for k, v in sorted(demo.items()))
        groups.setdefault(key, []).append(r)
    inters = []
    flagged = 0
    for name, grp in sorted(groups.items()):
        n = len(grp)
        acc = sum(1 for r in grp if r.get("decision") == "ACCEPT")
        ar = round(acc / n, 4) if n > 0 else 0
        di = round(ar / baseline_positive_rate, 4) if baseline_positive_rate > 0 else None
        disp = di is not None and di < 0.80 and n >= STATISTICAL_SIGNIFICANCE_N
        if disp:
            flagged += 1
        inters.append({"name": name, "n": n, "approvalRate": ar, "di": di, "disparity": disp})
    inters.sort(key=lambda x: (not x["disparity"], x["di"] or 1.0))
    total = len(results)
    return {
        "totalGenerated": total,
        "baselinePositiveRate": baseline_positive_rate,
        "accepts": sum(1 for r in results if r.get("decision") == "ACCEPT"),
        "rejects": sum(1 for r in results if r.get("decision") == "REJECT"),
        "overallApprovalRate": round(sum(1 for r in results if r.get("decision") == "ACCEPT") / total, 4) if total > 0 else 0,
        "intersections": inters,
        "flaggedCount": flagged,
    }


def _get_missing(df, valid_cols, existing_set):
    if len(valid_cols) < 2:
        return []
    vals = [df[c].dropna().unique().tolist() for c in valid_cols]
    missing = []
    for combo in product(*vals):
        key = "|".join(str(v) for v in combo)
        if key not in existing_set:
            missing.append(dict(zip(valid_cols, combo)))
    return missing[:MAX_INTERSECTIONS]


def _approved_medians(df, label_col, positive_label):
    col = df[label_col]
    mask = col == positive_label
    if mask.sum() == 0:
        try:
            mask = col.astype(float) == float(positive_label)
        except (ValueError, TypeError):
            pass
    if mask.sum() == 0:
        try:
            mask = col.astype(str).str.lower() == str(positive_label).lower()
        except Exception:
            pass
    approved = df[mask] if mask.sum() > 0 else df
    return {c: float(approved[c].median()) for c in approved.columns if c != label_col and pd.api.types.is_numeric_dtype(approved[c])}


def _cat_modes(df, label_col, protected_cols):
    modes = {}
    for c in df.columns:
        if c == label_col or c in protected_cols:
            continue
        if not pd.api.types.is_numeric_dtype(df[c]):
            m = df[c].dropna().mode()
            if len(m) > 0:
                modes[c] = m.iloc[0]
    return modes
