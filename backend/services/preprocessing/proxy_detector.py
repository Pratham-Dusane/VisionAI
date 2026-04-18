"""
Proxy Detector - Find columns correlated with protected attributes.
Per VisionAI PRD §6.3.

Uses Cramér's V for categorical×categorical and Eta-squared for categorical×numeric
to detect proxy variables that could enable indirect discrimination.
"""

from scipy.stats import chi2_contingency
import pandas as pd
import numpy as np


def detect_proxies(
    df: pd.DataFrame,
    protected_cols: list[str],
    threshold: float = 0.3,
) -> list[dict]:
    """
    For each non-protected column, measure its statistical association
    with each protected column. Flag anything above threshold as a proxy risk.
    """
    warnings = []

    for protected_col in protected_cols:
        if protected_col not in df.columns:
            continue
        for other_col in df.columns:
            if other_col == protected_col or other_col in protected_cols:
                continue

            association = 0.0
            method = None

            try:
                if df[protected_col].dtype == object and df[other_col].dtype == object:
                    # Both categorical: Cramér's V
                    contingency = pd.crosstab(df[protected_col], df[other_col])
                    chi2, _, _, _ = chi2_contingency(contingency)
                    n = contingency.sum().sum()
                    min_dim = min(contingency.shape) - 1
                    association = float(np.sqrt(chi2 / (n * min_dim))) if min_dim > 0 else 0
                    method = "Cramér's V"

                elif df[protected_col].dtype == object and pd.api.types.is_numeric_dtype(df[other_col]):
                    # Categorical protected, numeric other: ANOVA eta-squared
                    groups = [
                        df[other_col][df[protected_col] == val].dropna()
                        for val in df[protected_col].unique()
                    ]
                    grand_mean = df[other_col].mean()
                    ss_between = sum(
                        len(g) * (g.mean() - grand_mean) ** 2
                        for g in groups
                        if len(g) > 0
                    )
                    ss_total = ((df[other_col] - grand_mean) ** 2).sum()
                    association = float(ss_between / ss_total) if ss_total > 0 else 0
                    method = "Eta-squared (ANOVA)"

            except Exception:
                continue

            if association >= threshold:
                warnings.append({
                    'proxy_column': other_col,
                    'protected_column': protected_col,
                    'association_score': round(float(association), 4),
                    'method': method,
                    'risk_level': 'HIGH' if association >= 0.5 else 'MEDIUM',
                    'explanation': (
                        f"'{other_col}' has {method} of {association:.2f} with '{protected_col}'. "
                        f"If '{protected_col}' is excluded from the model but '{other_col}' is kept, "
                        f"the model may still discriminate via this proxy."
                    ),
                })

    return sorted(warnings, key=lambda x: x['association_score'], reverse=True)
