"""
Auto-Binner — PRD-compliant preprocessing step.
Detects continuous protected attributes and bins them into meaningful groups
BEFORE any fairness analysis runs. Without this, DI/SPD on exact numeric
values like "age=34" or "income=82000" is mathematically useless.

Detection strategy (in priority order):
  1. Column name keyword matching (age, income, score, zip, etc.)
  2. Value range heuristics (18-100 → age-like, 300-850 → score-like, etc.)
  3. Generic quartile binning for any remaining high-cardinality numeric column

Works on datasets of any size. All file types (CSV, JSON, Parquet) are
already handled by the pipeline's _load_dataframe before this step runs.
"""

import pandas as pd
import numpy as np


# ──────────────────────────────────────────────
# 1. KEYWORD → BIN SPEC MAPPING
# ──────────────────────────────────────────────
# Keywords are checked via substring match against lowercased column names.
# Order matters — first match wins.

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

# (keyword_list, bin_spec_or_"region")
KEYWORD_RULES: list[tuple[list[str], dict | str]] = [
    # Age patterns
    (["age", "years_old", "yearsold", "applicant_age", "borrower_age",
      "customer_age", "employee_age", "patient_age", "user_age"], AGE_BINS),

    # Income patterns
    (["income", "salary", "wage", "earning", "compensation", "pay",
      "annual_pay", "monthly_pay", "yearly"], INCOME_BINS),

    # Credit score patterns
    (["credit_score", "creditscore", "fico", "credit_rating",
      "creditrating", "score"], CREDIT_SCORE_BINS),

    # Zip / postal code → region grouping
    (["zip_code", "zipcode", "zip", "postal_code", "postalcode",
      "postal", "postcode"], "region"),
]


# ──────────────────────────────────────────────
# 2. VALUE-RANGE HEURISTICS (fallback when name doesn't match)
# ──────────────────────────────────────────────
# If the column name didn't match any keyword, inspect the actual values.

def _detect_by_value_range(series: pd.Series) -> dict | str | None:
    """Guess the semantic type of a numeric column from its value distribution."""
    vmin, vmax = series.min(), series.max()
    median = series.median()

    # Age-like: min ≥ 0, max ≤ 120, all integers, median 18–80
    if vmin >= 0 and vmax <= 120 and 15 <= median <= 80:
        if series.dropna().apply(lambda x: float(x).is_integer()).all():
            return AGE_BINS

    # Credit-score-like: range roughly 300–850
    if 200 <= vmin <= 400 and 700 <= vmax <= 900:
        return CREDIT_SCORE_BINS

    # Income-like: large numbers, min > 1000, max < 10M
    if vmin >= 1_000 and vmax <= 10_000_000 and median >= 10_000:
        return INCOME_BINS

    # Zip-code-like: 5-digit integers (US) or large integers with leading patterns
    if vmin >= 10_000 and vmax <= 99_999:
        if series.dropna().apply(lambda x: float(x).is_integer()).all():
            return "region"

    return None


# ──────────────────────────────────────────────
# 3. GENERIC THRESHOLD
# ──────────────────────────────────────────────
# If a numeric column has more than this many unique values AND didn't match
# any keyword or heuristic, bin it into quartiles anyway.
GENERIC_THRESHOLD = 10


# ──────────────────────────────────────────────
# 4. MAIN ENTRY POINT
# ──────────────────────────────────────────────

def auto_bin_protected_columns(
    df: pd.DataFrame,
    protected_cols: list[str],
) -> tuple[pd.DataFrame, dict]:
    """
    Auto-detect and bin continuous protected attributes.

    Returns:
        - Modified DataFrame with continuous cols replaced by binned versions
        - Dict of {col_name: bin_info} describing what was done

    Does NOT modify non-protected columns or label column.
    Works on any dataset size (10 rows or 10M rows).
    """
    df = df.copy()
    bin_report = {}

    for col in protected_cols:
        if col not in df.columns:
            continue

        # Skip non-numeric columns (already categorical)
        if not pd.api.types.is_numeric_dtype(df[col]):
            continue

        n_unique = df[col].nunique()

        # ── Step A: Try keyword matching ──
        col_lower = col.lower().replace(" ", "").replace("-", "")
        matched_spec = None

        for keywords, spec in KEYWORD_RULES:
            for kw in keywords:
                kw_clean = kw.replace("_", "").replace(" ", "")
                # Substring match in both directions
                if kw_clean in col_lower or col_lower in kw_clean:
                    matched_spec = spec
                    break
            if matched_spec is not None:
                break

        # ── Step B: Try value-range heuristics (if no keyword match) ──
        if matched_spec is None and len(df[col].dropna()) > 0:
            matched_spec = _detect_by_value_range(df[col].dropna())

        # ── Step C: Generic threshold for unknown numeric columns ──
        if matched_spec is None:
            if n_unique > GENERIC_THRESHOLD:
                # High cardinality unknown numeric → quartile bin
                df, info = _quartile_bin(df, col)
                bin_report[col] = info
            # Low cardinality unknown numeric → leave as-is (could be 0/1 flag)
            continue

        # ── Apply the matched spec ──
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


# ──────────────────────────────────────────────
# 5. BINNING HELPERS
# ──────────────────────────────────────────────

def _apply_named_bins(df: pd.DataFrame, col: str, spec: dict) -> tuple[pd.DataFrame, dict]:
    """Apply predefined bin edges and labels to a column."""
    bins = list(spec["bins"])
    labels = list(spec["labels"])

    col_max = df[col].max()

    # Ensure the last bin covers the data
    if bins[-1] != float("inf") and col_max > bins[-1]:
        bins.append(float("inf"))
        labels.append(f">{int(bins[-2])}+")

    # Ensure the first bin covers the data
    col_min = df[col].min()
    if col_min < bins[0]:
        bins[0] = col_min - 1

    # Trim empty leading bins (e.g., if all ages are 20+ don't create <0 bin)
    # but keep at least 2 bins
    while len(bins) > 2 and bins[1] < col_min:
        bins.pop(0)
        labels.pop(0)

    # Ensure labels match bins
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


def _quartile_bin(df: pd.DataFrame, col: str) -> tuple[pd.DataFrame, dict]:
    """Fallback: bin into quartiles. Works on any dataset size."""
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
        # Last resort: tertile (handles very low cardinality)
        try:
            q25 = df[col].quantile(0.25)
            q75 = df[col].quantile(0.75)
            edges = [df[col].min() - 1, q25, q75, df[col].max() + 1]
            # Deduplicate edges
            edges = sorted(set(edges))
            if len(edges) < 3:
                edges = [df[col].min() - 1, df[col].median(), df[col].max() + 1]
                edges = sorted(set(edges))

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
