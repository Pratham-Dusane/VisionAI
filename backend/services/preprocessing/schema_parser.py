"""
Schema Parser — Auto-detect sensitive/protected columns from uploaded datasets.
Per VisionAI PRD §6.2.
"""

import pandas as pd
import numpy as np

SENSITIVE_KEYWORDS = {
    'gender': 0.95, 'sex': 0.95, 'race': 0.98, 'ethnicity': 0.98,
    'age': 0.85, 'religion': 0.95, 'nationality': 0.90,
    'disability': 0.92, 'marital': 0.80, 'pregnant': 0.95,
    'zip': 0.70, 'zipcode': 0.70, 'postal': 0.70,
    'surname': 0.65, 'lastname': 0.65, 'name': 0.60,
    'income': 0.60, 'salary': 0.60,
}


def parse_schema(df: pd.DataFrame) -> dict:
    """
    Analyze DataFrame columns for types, distributions, and sensitivity.
    Returns column metadata with auto-flagged sensitive attributes.
    """
    columns = []
    for col in df.columns:
        col_lower = col.lower().replace('_', '').replace(' ', '')
        sensitivity_score = 0.0
        flagged_reason = None

        # Check column name against sensitive keywords
        for keyword, score in SENSITIVE_KEYWORDS.items():
            if keyword in col_lower:
                sensitivity_score = score
                flagged_reason = f"Column name contains sensitive keyword '{keyword}'"
                break

        # Check value distribution for binary categorical that looks like gender
        if df[col].dtype == object and df[col].nunique() <= 5:
            values_lower = [str(v).lower() for v in df[col].dropna().unique()]
            gender_indicators = {'male', 'female', 'm', 'f', 'man', 'woman'}
            if any(v in gender_indicators for v in values_lower):
                sensitivity_score = max(sensitivity_score, 0.90)
                flagged_reason = "Column values match known gender categories"

            # Check for race/ethnicity value patterns
            race_indicators = {'white', 'black', 'asian', 'hispanic', 'latino', 'african', 'caucasian'}
            if any(v in race_indicators for v in values_lower):
                sensitivity_score = max(sensitivity_score, 0.92)
                flagged_reason = "Column values match known race/ethnicity categories"

        # Sample values — handle small datasets
        n_sample = min(5, len(df[col].dropna()))
        sample_values = []
        if n_sample > 0:
            sample_values = df[col].dropna().sample(n_sample, random_state=42).tolist()
            # Convert numpy types to native Python for JSON serialization
            sample_values = [_to_native(v) for v in sample_values]

        columns.append({
            'name': col,
            'dtype': str(df[col].dtype),
            'unique_count': int(df[col].nunique()),
            'null_count': int(df[col].isnull().sum()),
            'sample_values': sample_values,
            'sensitivity_score': round(sensitivity_score, 2),
            'flagged_reason': flagged_reason,
            'auto_flagged': sensitivity_score >= 0.65,
        })

    return {
        'row_count': len(df),
        'column_count': len(df.columns),
        'columns': columns,
    }


def _to_native(val):
    """Convert numpy/pandas types to native Python for JSON serialization."""
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, (np.bool_,)):
        return bool(val)
    if isinstance(val, (pd.Timestamp,)):
        return val.isoformat()
    return val
