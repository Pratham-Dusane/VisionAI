"""
Bias Red Team — Worst-case bias search across all thresholds × demographic slices.
Grid search to find the most discriminated-against configuration in a model.
"""
import pandas as pd
import numpy as np
from dataclasses import dataclass


@dataclass
class RedTeamResult:
    worst_case: str
    worst_di: float
    worst_threshold: float
    worst_group: str
    all_results: list


def red_team_search(model, df, feature_cols, protected_cols, label_col, positive_label, thresholds=None):
    """
    Grid search across thresholds × demographic slices for worst-case DI.

    Returns RedTeamResult with worst-case scenario found.
    """
    if model is None:
        raise ValueError("Model required for red team search")

    if thresholds is None:
        thresholds = [round(x * 0.1, 1) for x in range(1, 10)]

    X = pd.get_dummies(df[feature_cols], drop_first=True).fillna(0)
    if hasattr(model, "feature_names_in_"):
        X = X.reindex(columns=list(model.feature_names_in_), fill_value=0)

    # Get probability scores
    if hasattr(model, "predict_proba"):
        scores = model.predict_proba(X)[:, -1]
    elif hasattr(model, "decision_function"):
        raw = model.decision_function(X)
        scores = (raw - raw.min()) / (raw.max() - raw.min() + 1e-9)
    else:
        scores = model.predict(X).astype(float)

    results = []
    worst_di = 1.0
    worst_info = None

    for threshold in thresholds:
        preds = (scores >= threshold).astype(int)
        overall_rate = preds.mean()
        if overall_rate == 0:
            continue

        for col in protected_cols:
            if col not in df.columns:
                continue
            for group in df[col].dropna().unique():
                mask = (df[col] == group).values
                n = mask.sum()
                if n < 10:
                    continue
                group_rate = preds[mask].mean()
                di = round(group_rate / overall_rate, 4) if overall_rate > 0 else None

                entry = {"threshold": threshold, "attribute": col, "group": str(group), "n": int(n), "approval_rate": round(float(group_rate), 4), "di": di}
                results.append(entry)

                if di is not None and di < worst_di:
                    worst_di = di
                    worst_info = entry

    if worst_info:
        desc = f"{worst_info['group']} ({worst_info['attribute']}) @ threshold {worst_info['threshold']}: DI={worst_di}"
    else:
        desc = "No significant disparity found"

    return RedTeamResult(
        worst_case=desc, worst_di=worst_di,
        worst_threshold=worst_info["threshold"] if worst_info else 0.5,
        worst_group=f"{worst_info['attribute']}={worst_info['group']}" if worst_info else "",
        all_results=results,
    )
