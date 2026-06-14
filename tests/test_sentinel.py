import pytest
from pydantic import ValidationError
from sentinel.config import SentinelConfig
from backend.routers.sentinel import CreateSentinelRequest

def test_sentinel_config_validation():
    # Verify that valid configuration payload parses correctly
    config_dict = {
        "sentinel_id": "sentinel-test-123",
        "org_id": "org-test-456",
        "model_name": "Test Loan Model",
        "target_endpoint": "https://api.model-provider.com/v1/predict",
        "protected_attributes": ["gender", "race"],
        "prediction_field": "prediction",
        "positive_prediction_value": "approved",
        "privileged_group_values": {"gender": "Male", "race": "White"},
        "di_threshold": 0.8,
        "rolling_window_size": 1000,
        "min_decisions_before_trip": 50,
        "evaluation_interval_seconds": 30,
        "breaker_mode": "intercept"
    }
    
    config = SentinelConfig(**config_dict)
    assert config.sentinel_id == "sentinel-test-123"
    assert config.di_threshold == 0.8
    assert "gender" in config.protected_attributes
    assert config.privileged_group_values["gender"] == "Male"

def test_sentinel_config_invalid():
    # Verify validation fails on missing required parameters
    invalid_dict = {
        "sentinel_id": "sentinel-test-123",
        # missing org_id and target_endpoint
        "model_name": "Test Loan Model",
    }
    
    with pytest.raises(ValidationError):
        SentinelConfig(**invalid_dict)

def test_create_sentinel_request_schema():
    request_dict = {
        "model_name": "Applicant Screening Model",
        "target_endpoint": "https://endpoint.com",
        "protected_attributes": ["age"],
        "prediction_field": "result.class",
        "positive_prediction_value": "1",
        "privileged_group_values": {"age": "adult"},
    }
    
    req = CreateSentinelRequest(**request_dict)
    assert req.model_name == "Applicant Screening Model"
    assert req.di_threshold == 0.8  # default value
    assert req.min_decisions_before_trip == 50  # default value
