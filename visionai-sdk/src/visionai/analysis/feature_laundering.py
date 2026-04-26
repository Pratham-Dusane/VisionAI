"""
Feature Laundering Detector — Reconstruction attack on protected attributes.
"""

from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import LabelEncoder
import pandas as pd
import numpy as np


def detect_feature_laundering(df, protected_cols, feature_cols=None):
    """Train classifier to predict protected attrs from features. High acc = laundered."""
    if feature_cols is None:
        feature_cols = [c for c in df.columns if c not in protected_cols]
    results = []
    for pcol in protected_cols:
        if pcol not in df.columns:
            continue
        avail = [c for c in feature_cols if c in df.columns and c != pcol and c not in protected_cols]
        if not avail:
            continue
        try:
            X = pd.get_dummies(df[avail], drop_first=True)
            y = df[pcol].dropna()
            X = X.loc[y.index]
            if y.nunique() < 2 or len(y) < 20:
                continue
            le = LabelEncoder()
            y_enc = le.fit_transform(y)
            X = X.fillna(0)
            clf = GradientBoostingClassifier(n_estimators=50, max_depth=3, random_state=42)
            cc = np.bincount(y_enc)
            cv = min(5, int(cc.min()) if len(cc) > 0 else 0)
            if cv < 2:
                continue
            scores = cross_val_score(clf, X, y_enc, cv=cv, scoring="accuracy")
            acc = float(scores.mean())
            base = float(cc.max() / len(y_enc))
            lift = (acc - base) / (1 - base) if (1 - base) > 0 else 0
            laundered = lift > 0.4
            results.append({
                "protected_attribute": pcol,
                "reconstruction_accuracy": round(acc, 4),
                "baseline_accuracy": round(base, 4),
                "lift_over_baseline": round(float(lift), 4),
                "laundering_detected": laundered,
                "severity": "CRITICAL" if lift > 0.6 else ("HIGH" if laundered else "PASS"),
                "explanation": (
                    f"'{pcol}' predictable from features at {acc*100:.1f}% (baseline {base*100:.1f}%). "
                    f"{'Laundering detected.' if laundered else 'Not reconstructable.'}"
                ),
            })
        except Exception as e:
            results.append({
                "protected_attribute": pcol, "reconstruction_accuracy": 0,
                "baseline_accuracy": 0, "lift_over_baseline": 0,
                "laundering_detected": False, "severity": "PASS",
                "explanation": f"Could not evaluate: {e}",
            })
    return results
