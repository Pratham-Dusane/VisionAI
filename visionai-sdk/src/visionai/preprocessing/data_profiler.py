"""
Data Profiler — Per-group distribution statistics.

Computes class imbalance, label distribution per demographic group,
and SMOTE oversampling recommendations.
"""

import pandas as pd
import numpy as np


def profile_data(
    df: pd.DataFrame,
    protected_cols: list,
    label_col: str,
    positive_label: str,
) -> list:
    """
    For each protected attribute, compute group distributions,
    label rates, imbalance ratios, and SMOTE recommendations.

    Returns:
        List of profile dicts, one per protected attribute.
    """
    profiles = []

    for attr in protected_cols:
        if attr not in df.columns:
            continue

        # Group counts
        group_counts = df[attr].value_counts().to_dict()
        total = sum(group_counts.values())
        group_percentages = {
            k: round(v / total * 100, 1) for k, v in group_counts.items()
        }

        # Label distribution per group
        label_dist = {}
        if label_col in df.columns:
            for group_val in group_counts.keys():
                group_df = df[df[attr] == group_val]
                group_total = len(group_df)
                if group_total == 0:
                    continue

                pos_count = _count_positive(group_df, label_col, positive_label)
                pos_rate = round(pos_count / group_total * 100, 1)
                neg_rate = round(100 - pos_rate, 1)

                label_dist[str(group_val)] = {
                    "positive": pos_rate,
                    "negative": neg_rate,
                }

        # Imbalance ratio
        counts_list = list(group_counts.values())
        imbalance_ratio = round(max(counts_list) / min(counts_list), 2) if min(counts_list) > 0 else float('inf')
        imbalance_warning = imbalance_ratio > 2.0

        # SMOTE recommendations
        smote_recs = _recommend_smote(
            {str(k): v for k, v in group_counts.items()}
        )

        profiles.append({
            'attribute': attr,
            'group_counts': {str(k): int(v) for k, v in group_counts.items()},
            'group_percentages': {str(k): v for k, v in group_percentages.items()},
            'label_distribution_per_group': label_dist,
            'imbalance_ratio': imbalance_ratio,
            'imbalance_warning': imbalance_warning,
            'smote_recommendations': smote_recs,
        })

    return profiles


def _count_positive(group_df: pd.DataFrame, label_col: str, positive_label: str) -> int:
    """Count positive outcomes with flexible type matching."""
    col = group_df[label_col]

    count = (col == positive_label).sum()
    if count > 0:
        return int(count)

    try:
        numeric_label = float(positive_label)
        count = (col.astype(float) == numeric_label).sum()
        if count > 0:
            return int(count)
    except (ValueError, TypeError):
        pass

    try:
        count = (col.astype(str).str.lower() == positive_label.lower()).sum()
        return int(count)
    except Exception:
        return 0


def _recommend_smote(group_counts: dict) -> dict:
    """Recommend synthetic oversampling to balance groups."""
    if not group_counts:
        return {}

    max_count = max(group_counts.values())
    recommendations = {}
    for group, count in group_counts.items():
        if count < max_count:
            needed = max_count - count
            recommendations[group] = {
                'synthetic_samples_needed': needed,
                'current_count': count,
                'target_count': max_count,
                'explanation': f"Add {needed} synthetic {group} samples to reach {max_count} (balanced)",
            }
    return recommendations
