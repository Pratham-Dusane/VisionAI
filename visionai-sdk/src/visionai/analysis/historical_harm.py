"""Historical Harm Calculator — Estimate individuals harmed over deployment period."""
from datetime import datetime


def calculate_historical_harm(deployment_start_str, monthly_decisions, di_ratio, protected_attribute, unprivileged_group, group_proportion):
    """Estimate harm count. Returns dict or None."""
    if not deployment_start_str or not monthly_decisions or di_ratio is None:
        return None
    try:
        ds = datetime.fromisoformat(str(deployment_start_str))
    except (ValueError, TypeError):
        try:
            ds = datetime.strptime(str(deployment_start_str), "%Y-%m-%d")
        except (ValueError, TypeError):
            return None
    months = max(1, (datetime.now() - ds).days // 30)
    total = months * monthly_decisions
    group_dec = int(total * group_proportion)
    harmed = int(group_dec * max(0, 1 - di_ratio))
    if harmed == 0:
        return None
    return {
        "months_deployed": months, "total_decisions": total,
        "decisions_affecting_group": group_dec,
        "estimated_individuals_harmed": harmed,
        "protected_attribute": protected_attribute,
        "unprivileged_group": unprivileged_group,
        "headline": f"Over {months} months, ~{harmed:,} {unprivileged_group} individuals may have been harmed by bias in {protected_attribute}.",
        "disclaimer": "Statistical estimate. Actual impact may vary.",
    }
