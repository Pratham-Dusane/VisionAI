from pydantic import BaseModel
from typing import Literal

class SentinelConfig(BaseModel):
    # Identity
    sentinel_id: str
    org_id: str
    model_name: str                        # Human-readable name for the proxied model

    # Target model
    target_endpoint: str                   # The actual model endpoint URL
    target_auth_header: str | None = None  # Bearer token for the target model if needed
    target_timeout_seconds: float = 10.0

    # Feature mapping
    protected_attributes: list[str]        # Which fields in incoming requests are protected attrs
    prediction_field: str                  # Key in model response that contains the prediction
    positive_prediction_value: str         # Value that means "approved/hired/positive"
    privileged_group_values: dict[str, str] # { "gender": "Male", "race": "White" }

    # Circuit breaker thresholds
    rolling_window_size: int = 1000        # Number of recent decisions to track
    di_threshold: float = 0.8             # DI below this trips the breaker
    min_decisions_before_trip: int = 50   # Don't trip on first 50 decisions (cold start)
    evaluation_interval_seconds: int = 30 # How often the agent recalculates DI

    # Breaker behavior
    breaker_mode: Literal["shadow", "intercept", "block_all"] = "intercept"
    # shadow: log violations but don't intercept (monitoring only)
    # intercept: intercept negative decisions for flagged demographics, return MANUAL_REVIEW
    # block_all: when breaker trips, ALL decisions go to manual review

    # Cooldown
    auto_reset_minutes: int | None = 60   # Auto-reset breaker after N minutes. None = manual reset only

    # Notifications
    alert_webhook_url: str | None = None  # Slack/webhook URL for breaker trip alerts
    alert_email: str | None = None

    # Credentials
    gemini_api_key: str | None = None
