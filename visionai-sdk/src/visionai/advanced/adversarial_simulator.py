"""
Adversarial Applicant Simulator — Find minimum feature changes to flip a prediction.
Greedy perturbation search: for each non-protected feature, try ±1 std until flip found.
"""
import pandas as pd
import numpy as np
from dataclasses import dataclass, field


@dataclass
class FlipResult:
    """Result of minimum-flip search for a single row."""
    row_index: int
    original_prediction: int
    flipped_prediction: int
    changes: dict = field(default_factory=dict)
    n_changes: int = 0
    flipped: bool = False


def find_minimum_flip(model, df, feature_cols, protected_cols, row_index=0, label_col=None):
    """
    Find minimum feature changes to flip prediction for a single row.

    Args:
        model: Trained sklearn-compatible model
        df: Dataset DataFrame
        feature_cols: Feature column names
        protected_cols: Protected attribute columns (not perturbed)
        row_index: Row index to analyze
        label_col: Label column to exclude from features

    Returns:
        FlipResult with changes dict, original/flipped prediction.
    """
    if model is None:
        raise ValueError("Model required for adversarial simulation")

    non_prot = [c for c in feature_cols if c not in protected_cols and c != label_col]
    X = pd.get_dummies(df[feature_cols], drop_first=True).fillna(0)

    if hasattr(model, "feature_names_in_"):
        X = X.reindex(columns=list(model.feature_names_in_), fill_value=0)

    row = X.iloc[row_index].copy()
    orig_pred = int(model.predict(row.to_frame().T)[0])

    # Greedy search: try each feature, find minimum set that flips
    changes = {}
    current = row.copy()

    # Sort features by importance (try features with highest variance first)
    feat_order = sorted(non_prot, key=lambda f: df[f].std() if f in df.columns and pd.api.types.is_numeric_dtype(df[f]) else 0, reverse=True)

    for feat in feat_order:
        if feat not in current.index:
            continue
        if not pd.api.types.is_numeric_dtype(df[feat]) if feat in df.columns else True:
            continue

        std = df[feat].std() if feat in df.columns else 1.0
        if std == 0:
            continue

        for direction in [1, -1]:
            test = current.copy()
            delta = std * direction
            test[feat] = current[feat] + delta
            # Clamp to observed range
            if feat in df.columns:
                test[feat] = max(float(df[feat].min()), min(float(df[feat].max()), test[feat]))

            pred = int(model.predict(test.to_frame().T)[0])
            if pred != orig_pred:
                changes[feat] = {"from": float(row[feat]), "to": float(test[feat])}
                current = test.copy()

                return FlipResult(
                    row_index=row_index,
                    original_prediction=orig_pred,
                    flipped_prediction=pred,
                    changes=changes,
                    n_changes=len(changes),
                    flipped=True,
                )

    return FlipResult(
        row_index=row_index,
        original_prediction=orig_pred,
        flipped_prediction=orig_pred,
        changes={},
        n_changes=0,
        flipped=False,
    )
