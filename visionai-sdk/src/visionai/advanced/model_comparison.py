"""
Model Comparison — Diff two audit results to show improved/worsened metrics.
"""
from dataclasses import dataclass, field


@dataclass
class ComparisonResult:
    improved: list = field(default_factory=list)
    worsened: list = field(default_factory=list)
    unchanged: list = field(default_factory=list)
    score_delta: int = 0
    grade_a: str = ""
    grade_b: str = ""


def compare_audits(result_a, result_b):
    """
    Compare two AuditResult objects (or dicts).
    Returns ComparisonResult with improved/worsened/unchanged lists.
    """
    a = _to_dict(result_a)
    b = _to_dict(result_b)

    improved, worsened, unchanged = [], [], []

    # Score comparison
    sa = a.get("fairness_score", 0)
    sb = b.get("fairness_score", 0)
    delta = sb - sa

    # Data bias per attribute
    db_a = a.get("data_bias", {})
    db_b = b.get("data_bias", {})
    all_attrs = set(list(db_a.keys()) + list(db_b.keys()))

    for attr in all_attrs:
        di_a = db_a.get(attr, {}).get("metrics", {}).get("disparate_impact")
        di_b = db_b.get(attr, {}).get("metrics", {}).get("disparate_impact")
        if di_a is not None and di_b is not None:
            if di_b > di_a + 0.02:
                improved.append(f"{attr} DI: {di_a:.2f} → {di_b:.2f}")
            elif di_b < di_a - 0.02:
                worsened.append(f"{attr} DI: {di_a:.2f} → {di_b:.2f}")
            else:
                unchanged.append(f"{attr} DI: {di_a:.2f} → {di_b:.2f}")

    return ComparisonResult(
        improved=improved, worsened=worsened, unchanged=unchanged,
        score_delta=delta,
        grade_a=a.get("letter_grade", "?"),
        grade_b=b.get("letter_grade", "?"),
    )


def _to_dict(obj):
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    return vars(obj) if hasattr(obj, "__dict__") else {}
