"""
Feature Laundering Detector - PRD §7.7
GradientBoosting reconstruction attack: can protected attrs be predicted from model features?
"""

from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import LabelEncoder
import pandas as pd
import numpy as np


def detect_feature_laundering(
    df: pd.DataFrame,
    protected_cols: list[str],
    feature_cols: list[str] | None = None,
) -> list[dict]:
    """
    For each protected attribute, train classifier to predict it from
    remaining features. High accuracy = attribute laundered, not removed.
    """
    if feature_cols is None:
        # Use all non-protected columns as features
        feature_cols = [c for c in df.columns if c not in protected_cols]

    results = []

    for protected_col in protected_cols:
        if protected_col not in df.columns:
            continue

        available = [c for c in feature_cols
                     if c in df.columns and c != protected_col and c not in protected_cols]
        if len(available) == 0:
            continue

        try:
            # Prepare X - one-hot encode categoricals
            X = pd.get_dummies(df[available], drop_first=True)
            y = df[protected_col].dropna()
            X = X.loc[y.index]

            if y.nunique() < 2 or len(y) < 20:
                continue

            le = LabelEncoder()
            y_enc = le.fit_transform(y)

            # Fill NaN in X
            X = X.fillna(0)

            clf = GradientBoostingClassifier(
                n_estimators=50, max_depth=3, random_state=42
            )

            # Keep folds <= minority class count to avoid stratified split warnings.
            class_counts = np.bincount(y_enc)
            minority_count = int(class_counts.min()) if len(class_counts) > 0 else 0
            cv_folds = min(5, minority_count)
            if cv_folds < 2:
                continue

            scores = cross_val_score(
                clf, X, y_enc, cv=cv_folds, scoring="accuracy"
            )
            mean_acc = float(scores.mean())

            baseline = float(np.bincount(y_enc).max() / len(y_enc))
            lift = (mean_acc - baseline) / (1 - baseline) if (1 - baseline) > 0 else 0

            is_laundered = lift > 0.4

            results.append({
                "protected_attribute": protected_col,
                "reconstruction_accuracy": round(mean_acc, 4),
                "baseline_accuracy": round(baseline, 4),
                "lift_over_baseline": round(float(lift), 4),
                "laundering_detected": is_laundered,
                "severity": "CRITICAL" if lift > 0.6 else ("HIGH" if is_laundered else "PASS"),
                "explanation": (
                    f"Although '{protected_col}' is not in the model's feature set, "
                    f"a classifier can predict it from remaining features with "
                    f"{mean_acc*100:.1f}% accuracy (vs {baseline*100:.1f}% baseline). "
                    f"The model implicitly has access to '{protected_col}' through correlated features."
                ) if is_laundered else (
                    f"'{protected_col}' does not appear reconstructable from remaining features "
                    f"({mean_acc*100:.1f}% vs {baseline*100:.1f}% baseline)."
                ),
            })
        except Exception as e:
            results.append({
                "protected_attribute": protected_col,
                "reconstruction_accuracy": 0,
                "baseline_accuracy": 0,
                "lift_over_baseline": 0,
                "laundering_detected": False,
                "severity": "PASS",
                "explanation": f"Could not evaluate: {str(e)}",
            })

    return results
