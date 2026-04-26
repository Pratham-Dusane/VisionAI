"""Severity Scorer — Aggregate findings into 0-100 fairness score + letter grade."""


def compute_severity_score(data_bias, proxies, intersectional, feature_laundering, model_bias=None):
    """Score = 100 minus weighted penalties. Returns dict with fairness_score, letter_grade, penalties."""
    score = 100
    penalties = []
    for attr, r in data_bias.items():
        di = r.get("metrics", {}).get("disparate_impact")
        if di is not None:
            if di < 0.6:
                score -= 20; penalties.append(f"DI < 0.6 for {attr}: -20")
            elif di < 0.8:
                score -= 10; penalties.append(f"DI < 0.8 for {attr}: -10")
    if model_bias:
        for attr, r in model_bias.items():
            if attr == "_equalized_odds": continue
            mf = r.get("max_flip_rate", 0)
            if mf > 0.2:
                score -= 12; penalties.append(f"Flip rate > 0.2 for {attr}: -12")
        eq = model_bias.get("_equalized_odds", {})
        for attr, groups in eq.items():
            fprs = [g.get("fpr", 0) for g in groups.values()]
            if len(fprs) >= 2 and (max(fprs) - min(fprs)) > 0.1:
                score -= 8; penalties.append(f"EO FPR gap > 0.1 for {attr}: -8")
    for fl in feature_laundering:
        if fl.get("laundering_detected"):
            score -= 15; penalties.append(f"Feature laundering: {fl['protected_attribute']}: -15")
    hp = [p for p in proxies if p.get("risk_level") == "HIGH"]
    pp = min(len(hp) * 3, 15)
    if pp > 0:
        score -= pp; penalties.append(f"{len(hp)} HIGH-risk proxies: -{pp}")
    ci = [i for i in intersectional if i.get("severity") == "CRITICAL"]
    ip = min(len(ci) * 5, 20)
    if ip > 0:
        score -= ip; penalties.append(f"{len(ci)} CRITICAL intersections: -{ip}")
    score = max(0, score)
    grade = "A" if score >= 80 else "B" if score >= 65 else "C" if score >= 50 else "D" if score >= 35 else "F"
    return {"fairness_score": score, "letter_grade": grade, "penalties": penalties}
