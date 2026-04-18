"""
Historical Harm Calculator - PRD §7.8
Estimate individuals harmed over deployment period.
"""

from datetime import datetime


def calculate_historical_harm(
    deployment_start_str: str | None,
    monthly_decisions: int | None,
    di_ratio: float | None,
    protected_attribute: str,
    unprivileged_group: str,
    group_proportion: float,
) -> dict | None:
    """
    Formula:
    months_deployed = months between deployment_start and now
    total_decisions = months * monthly_decisions
    decisions_for_group = total * group_proportion
    harm_rate = max(0, 1 - di_ratio)
    estimated_harmed = decisions_for_group * harm_rate
    """
    if not deployment_start_str or not monthly_decisions or di_ratio is None:
        return None

    try:
        deployment_start = datetime.fromisoformat(deployment_start_str)
    except (ValueError, TypeError):
        try:
            deployment_start = datetime.strptime(deployment_start_str, "%Y-%m-%d")
        except (ValueError, TypeError):
            return None

    now = datetime.now()
    delta_days = (now - deployment_start).days
    months_deployed = max(1, delta_days // 30)

    total_decisions = months_deployed * monthly_decisions
    decisions_for_group = int(total_decisions * group_proportion)
    harm_rate = max(0, 1 - di_ratio)
    estimated_harmed = int(decisions_for_group * harm_rate)

    if estimated_harmed == 0:
        return None

    return {
        "months_deployed": months_deployed,
        "total_decisions": total_decisions,
        "decisions_affecting_group": decisions_for_group,
        "estimated_individuals_harmed": estimated_harmed,
        "protected_attribute": protected_attribute,
        "unprivileged_group": unprivileged_group,
        "headline": (
            f"Over {months_deployed} months of deployment, approximately "
            f"{estimated_harmed:,} {unprivileged_group} individuals may have received "
            f"unfavorable decisions due to detected bias in {protected_attribute}."
        ),
        "disclaimer": "This is a statistical estimate based on measured bias metrics. Actual impact may vary.",
    }
