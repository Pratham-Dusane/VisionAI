"""
Auto-Binner — Bin continuous protected attributes into meaningful groups.

Detects age, income, credit score, zip code patterns via keyword matching
and value-range heuristics. Falls back to quartile binning for unknown
high-cardinality numeric columns.
"""

import pandas as pd
import numpy as np


# ── Bin Specifications ──

AGE_BINS = {
    "bins": [0, 25, 35, 45, 55, 65, 200],
    "labels": ["<25", "25-34", "35-44", "45-54", "55-64", "65+"],
}

INCOME_BINS = {
    "bins": [0, 30_000, 50_000, 75_000, 100_000, 150_000, float("inf")],
    "labels": ["<30K", "30K-50K", "50K-75K", "75K-100K", "100K-150K", "150K+"],
}

CREDIT_SCORE_BINS = {
    "bins": [0, 580, 670, 740, 800, 900],
    "labels": ["Poor(<580)", "Fair(580-669)", "Good(670-739)", "VeryGood(740-799)", "Excellent(800+)"],
}

KEYWORD_RULES = [
    (["age", "years_old", "yearsold", "applicant_age", "borrower_age",
      "customer_age", "employee_age", "patient_age", "user_age"], AGE_BINS),
    (["income", "salary", "wage", "earning", "compensation", "pay",
      "annual_pay", "monthly_pay", "yearly"], INCOME_BINS),
    (["credit_score", "creditscore", "fico", "credit_rating",
      "creditrating", "score"], CREDIT_SCORE_BINS),
    (["zip_code", "zipcode", "zip", "postal_code", "postalcode",
      "postal", "postcode"], "region"),
]

GENERIC_THRESHOLD = 10


def auto_bin_protected_columns(
    df: pd.DataFrame,
    protected_cols: list,
) -> tuple:
    """
    Auto-detect and bin continuous protected attributes.

    Returns:
        Tuple of (modified DataFrame, bin_report dict)
    """
    df = df.copy()
    bin_report = {}

    for col in protected_cols:
        if col not in df.columns:
            continue

        if not pd.api.types.is_numeric_dtype(df[col]):
            continue

        n_unique = df[col].nunique()

        # Step A: Keyword matching
        col_lower = col.lower().replace(" ", "").replace("-", "")
        matched_spec = None

        for keywords, spec in KEYWORD_RULES:
            for kw in keywords:
                kw_clean = kw.replace("_", "").replace(" ", "")
                if kw_clean in col_lower or col_lower in kw_clean:
                    matched_spec = spec
                    break
            if matched_spec is not None:
                break

        # Step B: Value-range heuristics
        if matched_spec is None and len(df[col].dropna()) > 0:
            matched_spec = _detect_by_value_range(df[col].dropna())

        # Step C: Generic threshold
        if matched_spec is None:
            if n_unique > GENERIC_THRESHOLD:
                df, info = _quartile_bin(df, col)
                bin_report[col] = info
            continue

        # Apply matched spec
        if matched_spec == "region":
            df[col] = df[col].astype(str).str[:3].apply(lambda x: f"Region_{x}")
            bin_report[col] = {
                "method": "region_prefix",
                "description": "Grouped by first 3 digits (region)",
                "n_groups": int(df[col].nunique()),
            }
        elif isinstance(matched_spec, dict):
            df, info = _apply_named_bins(df, col, matched_spec)
            bin_report[col] = info
        else:
            df, info = _quartile_bin(df, col)
            bin_report[col] = info

    return df, bin_report


def _detect_by_value_range(series: pd.Series):
    """Guess semantic type from value distribution."""
    vmin, vmax = series.min(), series.max()
    median = series.median()

    if vmin >= 0 and vmax <= 120 and 15 <= median <= 80:
        if series.dropna().apply(lambda x: float(x).is_integer()).all():
            return AGE_BINS

    if 200 <= vmin <= 400 and 700 <= vmax <= 900:
        return CREDIT_SCORE_BINS

    if vmin >= 1_000 and vmax <= 10_000_000 and median >= 10_000:
        return INCOME_BINS

    if vmin >= 10_000 and vmax <= 99_999:
        if series.dropna().apply(lambda x: float(x).is_integer()).all():
            return "region"

    return None


def _apply_named_bins(df, col, spec):
    """Apply predefined bin edges and labels."""
    bins = list(spec["bins"])
    labels = list(spec["labels"])
    col_max = df[col].max()

    if bins[-1] != float("inf") and col_max > bins[-1]:
        bins.append(float("inf"))
        labels.append(f">{int(bins[-2])}+")

    col_min = df[col].min()
    if col_min < bins[0]:
        bins[0] = col_min - 1

    while len(bins) > 2 and bins[1] < col_min:
        bins.pop(0)
        labels.pop(0)

    if len(labels) != len(bins) - 1:
        labels = labels[:len(bins) - 1]
        while len(labels) < len(bins) - 1:
            labels.append(f"Bin_{len(labels)+1}")

    try:
        df[col] = pd.cut(
            df[col], bins=bins, labels=labels,
            include_lowest=True, duplicates="drop",
        ).astype(str)
        df[col] = df[col].replace("nan", "Unknown")
        return df, {
            "method": "named_bins",
            "bins": [str(b) for b in bins],
            "labels": labels,
            "n_groups": int(df[col].nunique()),
        }
    except Exception:
        return _quartile_bin(df, col)


def _quartile_bin(df, col):
    """Fallback: bin into quartiles."""
    try:
        df[col] = pd.qcut(
            df[col], q=4,
            labels=["Q1(Low)", "Q2(MedLow)", "Q3(MedHigh)", "Q4(High)"],
            duplicates="drop",
        ).astype(str)
        df[col] = df[col].replace("nan", "Unknown")
        return df, {
            "method": "quartile",
            "n_groups": int(df[col].nunique()),
            "description": "Auto-binned into quartiles",
        }
    except Exception:
        try:
            q25 = df[col].quantile(0.25)
            q75 = df[col].quantile(0.75)
            edges = sorted(set([df[col].min() - 1, q25, q75, df[col].max() + 1]))
            if len(edges) < 3:
                edges = sorted(set([df[col].min() - 1, df[col].median(), df[col].max() + 1]))

            n_labels = len(edges) - 1
            label_names = ["Low", "Medium", "High"][:n_labels]
            while len(label_names) < n_labels:
                label_names.append(f"Bin_{len(label_names)+1}")

            df[col] = pd.cut(
                df[col], bins=edges, labels=label_names,
                include_lowest=True, duplicates="drop",
            ).astype(str)
            df[col] = df[col].replace("nan", "Unknown")
            return df, {
                "method": "tertile",
                "n_groups": int(df[col].nunique()),
                "description": "Auto-binned into Low/Medium/High",
            }
        except Exception:
            return df, {"method": "none", "description": "Binning failed, used raw values"}
