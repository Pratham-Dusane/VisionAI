"""End-to-end tests for FairnessAudit orchestrator."""
import pytest
import pandas as pd
import numpy as np
from pathlib import Path

from visionai import FairnessAudit, AuditResult


@pytest.fixture
def sample_df():
    """Create a sample dataset for testing."""
    np.random.seed(42)
    n = 200
    return pd.DataFrame({
        "gender": np.random.choice(["Male", "Female"], n, p=[0.6, 0.4]),
        "race": np.random.choice(["White", "Black", "Asian"], n, p=[0.5, 0.3, 0.2]),
        "age": np.random.randint(22, 65, n),
        "income": np.random.randint(25000, 150000, n),
        "credit_score": np.random.randint(550, 850, n),
        "approved": np.random.choice([0, 1], n, p=[0.4, 0.6]),
    })


def test_audit_from_dataframe(sample_df):
    """Test full audit pipeline with DataFrame input."""
    audit = FairnessAudit(
        data=sample_df,
        label_col="approved",
        positive_label="1",
        protected_cols=["gender", "race"],
    )
    results = audit.run()

    assert isinstance(results, AuditResult)
    assert 0 <= results.fairness_score <= 100
    assert results.letter_grade in ("A", "B", "C", "D", "F")
    assert isinstance(results.data_bias, dict)
    assert len(results.profiles) == 2  # gender, race
    assert isinstance(results.intersectional, list)
    assert isinstance(results.feature_laundering, list)
    assert isinstance(results.regulation_map, list)


def test_audit_summary(sample_df):
    """Test summary output."""
    audit = FairnessAudit(
        data=sample_df,
        label_col="approved",
        positive_label="1",
        protected_cols=["gender"],
    )
    results = audit.run()
    summary = results.summary()
    assert "Fairness Score" in summary
    assert "Grade" in summary


def test_audit_to_dict(sample_df):
    """Test JSON export."""
    audit = FairnessAudit(
        data=sample_df,
        label_col="approved",
        positive_label="1",
        protected_cols=["gender"],
    )
    results = audit.run()
    d = results.to_dict()
    assert isinstance(d, dict)
    assert "fairness_score" in d
    assert "data_bias" in d


def test_audit_to_json(sample_df, tmp_path):
    """Test JSON file export."""
    audit = FairnessAudit(
        data=sample_df,
        label_col="approved",
        positive_label="1",
        protected_cols=["gender"],
    )
    results = audit.run()
    out = tmp_path / "report.json"
    results.to_json(str(out))
    assert out.exists()
    assert out.stat().st_size > 100


def test_audit_anonymize(sample_df):
    """Test whistleblower anonymization."""
    audit = FairnessAudit(
        data=sample_df,
        label_col="approved",
        positive_label="1",
        protected_cols=["gender"],
    )
    results = audit.run()
    anon = results.anonymize(org_name="TestCorp")
    assert anon.get("_anonymization", {}).get("anonymized") is True
    assert "_integrity_hash" in anon


def test_schema_parsing(sample_df):
    """Test standalone schema parsing."""
    from visionai import parse_schema
    schema = parse_schema(sample_df)
    assert schema["row_count"] == 200
    assert schema["column_count"] == 6
    assert any(c["auto_flagged"] for c in schema["columns"])


def test_data_bias_scanner(sample_df):
    """Test standalone data bias scanning."""
    from visionai import scan_data_bias
    bias = scan_data_bias(sample_df, "approved", "1", ["gender"])
    assert "gender" in bias
    assert "metrics" in bias["gender"]
    assert "disparate_impact" in bias["gender"]["metrics"]


def test_proxy_detector(sample_df):
    """Test standalone proxy detection."""
    from visionai import detect_proxies
    proxies = detect_proxies(sample_df, ["gender"])
    assert isinstance(proxies, list)


def test_shadow_testing(sample_df):
    """Test shadow testing without model."""
    audit = FairnessAudit(
        data=sample_df,
        label_col="approved",
        positive_label="1",
        protected_cols=["gender", "race"],
    )
    audit.run()
    result = audit.shadow_test()
    assert "missing_intersections" in result
    assert "shadow_profiles" in result


def test_shadow_testing_with_biased_finetuned_model(sample_df, tmp_path):
    """Test that load_model can successfully unpickle BiasedFineTunedModel."""
    import joblib
    from services.analysis.model_bias_evaluator import load_model, ensure_demo_wrappers_registered
    
    ensure_demo_wrappers_registered()
    import sys
    BiasedFineTunedModel = sys.modules["__main__"].BiasedFineTunedModel
    
    # Create and dump a model instance
    model = BiasedFineTunedModel(predictions=[1]*len(sample_df), probabilities=[[0.1, 0.9]]*len(sample_df))
    model_file = tmp_path / "model.joblib"
    joblib.dump(model, model_file)
    
    # Unpickle it using load_model
    loaded_model = load_model(str(model_file))
    assert loaded_model is not None
    assert loaded_model.__class__.__name__ == "BiasedFineTunedModel"
