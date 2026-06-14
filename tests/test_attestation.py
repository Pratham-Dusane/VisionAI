import pytest
from fastapi.testclient import TestClient
from core.firebase_init import initialize_firebase

# Initialize Firebase for tests
initialize_firebase()

from main import app
from services.attestation.chain import (
    resolve_model_identifier,
    compute_attestation_hash,
    issue_attestation,
    verify_chain_integrity
)

client = TestClient(app)


def test_resolve_model_identifier():
    assert resolve_model_identifier("models/loan_model_v3.pkl") == "loan_model"
    assert resolve_model_identifier("loan-screening-v1.0.joblib") == "loan-screening"
    assert resolve_model_identifier(None) == "default-model"
    assert resolve_model_identifier("hiring_v4.pkl") == "hiring"


@pytest.mark.asyncio
async def test_attestation_flow_and_integrity():
    org_id = "test-org-att-789"
    model_identifier = "test-model-att"
    
    # 1. Clean previous registrations if any
    from firebase_admin import firestore
    db = firestore.client()
    db.collection("attestation_chains").document(f"{org_id}_{model_identifier}").delete()
    
    # 2. Issue version 1
    att1 = issue_attestation(
        org_id=org_id,
        audit_id="audit_v1_123",
        model_identifier=model_identifier,
        fairness_score=90.0,
        letter_grade="A",
        results_snapshot={
            "data_bias": {
                "age": {
                    "metrics": {"disparate_impact": 0.85}
                }
            }
        },
        interventions_applied=[]
    )
    
    assert att1["version"] == 1
    assert att1["previous_hash"] == "GENESIS"
    assert att1["di_worst"] == 0.85
    h1 = att1["hash"]
    
    # 3. Issue version 2
    att2 = issue_attestation(
        org_id=org_id,
        audit_id="audit_v2_456",
        model_identifier=model_identifier,
        fairness_score=75.0,
        letter_grade="C",
        results_snapshot={
            "data_bias": {
                "age": {
                    "metrics": {"disparate_impact": 0.72}
                }
            }
        },
        interventions_applied=["reweighting"]
    )
    
    assert att2["version"] == 2
    assert att2["previous_hash"] == h1
    assert att2["di_worst"] == 0.72
    h2 = att2["hash"]
    
    # 4. Verify integrity programmatically
    verify_res = verify_chain_integrity(org_id, model_identifier)
    assert verify_res["valid"] is True
    assert verify_res["chain_length"] == 2
    
    # 5. Verify via endpoint
    response = client.get(f"/api/attestation/{org_id}/{model_identifier}")
    assert response.status_code == 200
    data = response.json()
    assert data["exists"] is True
    assert data["model_identifier"] == model_identifier
    assert data["latest_hash"] == h2
    assert len(data["history"]) == 2
    
    # 6. Verify integrity endpoint
    verify_response = client.get(f"/api/attestation/{org_id}/{model_identifier}/verify")
    assert verify_response.status_code == 200
    verify_data = verify_response.json()
    assert verify_data["valid"] is True
    assert verify_data["chain_length"] == 2
    
    # Clean up
    db.collection("attestation_chains").document(f"{org_id}_{model_identifier}").delete()
