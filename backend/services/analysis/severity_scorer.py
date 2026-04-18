"""
Severity Scorer - PRD §7.6
Aggregate all findings → single 0-100 fairness score + letter grade.
"""


def compute_severity_score(
    data_bias: dict,
    proxies: list[dict],
    intersectional: list[dict],
    feature_laundering: list[dict],
    model_bias: dict | None = None,
) -> dict:
    """
    Scoring:
    Start at 100, subtract penalties.

    Penalties:
    - DI < 0.6 per attribute: -20
    - DI 0.6-0.8 per attribute: -10
    - Equalized Odds FPR gap > 0.1: -8 per attribute
    - Model flip rate > 0.2 per attribute: -12
    - Feature laundering detected: -15
    - Proxy variables: -3 per HIGH risk (max -15)
    - Intersectional CRITICAL: -5 per (max -20)
    """
    score = 100
    penalties = []

    # Data bias penalties
    for attr, result in data_bias.items():
        di = result.get("metrics", {}).get("disparate_impact")
        if di is not None:
            if di < 0.6:
                score -= 20
                penalties.append(f"DI < 0.6 for {attr}: -20")
            elif di < 0.8:
                score -= 10
                penalties.append(f"DI < 0.8 for {attr}: -10")

    # Model bias penalties
    if model_bias:
        for attr, result in model_bias.items():
            max_flip = result.get("max_flip_rate", 0)
            if max_flip > 0.2:
                score -= 12
                penalties.append(f"Flip rate > 0.2 for {attr}: -12")

        # Equalized odds
        eq_odds = model_bias.get("_equalized_odds", {})
        for attr, groups in eq_odds.items():
            fprs = [g.get("fpr", 0) for g in groups.values()]
            if len(fprs) >= 2 and (max(fprs) - min(fprs)) > 0.1:
                score -= 8
                penalties.append(f"EO FPR gap > 0.1 for {attr}: -8")

    # Feature laundering
    for fl in feature_laundering:
        if fl.get("laundering_detected"):
            score -= 15
            penalties.append(f"Feature laundering detected for {fl['protected_attribute']}: -15")

    # Proxy variables
    high_proxies = [p for p in proxies if p.get("risk_level") == "HIGH"]
    proxy_penalty = min(len(high_proxies) * 3, 15)
    if proxy_penalty > 0:
        score -= proxy_penalty
        penalties.append(f"{len(high_proxies)} HIGH-risk proxies: -{proxy_penalty}")

    # Intersectional
    critical_intersections = [i for i in intersectional if i.get("severity") == "CRITICAL"]
    inter_penalty = min(len(critical_intersections) * 5, 20)
    if inter_penalty > 0:
        score -= inter_penalty
        penalties.append(f"{len(critical_intersections)} CRITICAL intersections: -{inter_penalty}")

    score = max(0, score)

    # Letter grade
    if score >= 80:
        grade = "A"
    elif score >= 65:
        grade = "B"
    elif score >= 50:
        grade = "C"
    elif score >= 35:
        grade = "D"
    else:
        grade = "F"

    return {
        "fairness_score": score,
        "letter_grade": grade,
        "penalties": penalties,
    }
