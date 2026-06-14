import pytest
from fastapi.testclient import TestClient
from core.firebase_init import initialize_firebase

# Initialize Firebase for tests
initialize_firebase()

from main import app
from services.feature_store.connector import VertexFeatureStoreConnector, run_feature_store_bias_check

client = TestClient(app)


@pytest.mark.asyncio
async def test_vertex_connector_mock():
    # Test connector in mock mode
    connector = VertexFeatureStoreConnector(
        project="mock-project",
        location="asia-south1",
        featurestore_id="mock-fs",
        entity_type_id="mock-entity",
        is_mock=True
    )
    
    # Try fetching a mock snapshot
    df = await connector.read_feature_snapshot(
        feature_ids=["age", "gender", "race", "loan_approved"],
        entity_ids=["app_1", "app_2", "app_3"]
    )
    
    assert not df.empty
    assert "age" in df.columns
    assert "gender" in df.columns
    assert "race" in df.columns
    assert "loan_approved" in df.columns
    assert len(df) == 150


@pytest.mark.asyncio
async def test_bias_check_runner_mock():
    connector = VertexFeatureStoreConnector(
        project="mock-project",
        location="asia-south1",
        featurestore_id="mock-fs",
        entity_type_id="mock-entity",
        is_mock=True
    )
    
    # Run bias checks
    results = await run_feature_store_bias_check(
        connector=connector,
        protected_cols=["age", "gender", "race"],
        label_col="loan_approved",
        positive_label="1",
        org_id="test-org",
        pipeline_id="test-reg-id",
        entity_ids=["app_1", "app_2"]
    )
    
    assert "age" in results
    assert "gender" in results
    assert "race" in results
    assert "disparate_impact" in results["age"]
    assert "statistical_parity_difference" in results["age"]
    assert results["age"]["row_count"] == 150


def test_test_connection_endpoint():
    payload = {
        "store_type": "vertex",
        "connection_config": {
            "project": "mock-project",
            "location": "asia-south1",
            "featurestore_id": "mock-fs",
            "entity_type_id": "mock-entity"
        },
        "protected_cols": ["age", "gender"],
        "label_col": "loan_approved",
        "positive_label": "1",
        "is_mock": True
    }
    
    response = client.post("/api/feature-stores/test", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "Retrieved 150 rows" in data["message"]


def test_register_and_list_endpoints():
    reg_payload = {
        "org_id": "test-org-456",
        "store_type": "vertex",
        "connection_config": {
            "project": "mock-project",
            "location": "asia-south1",
            "featurestore_id": "mock-fs",
            "entity_type_id": "mock-entity"
        },
        "protected_cols": ["age", "gender"],
        "label_col": "loan_approved",
        "positive_label": "1",
        "polling_interval_hours": 6,
        "is_mock": True
    }
    
    # 1. Register
    response = client.post("/api/feature-stores/register", json=reg_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    reg_id = data["registrationId"]
    assert reg_id is not None
    
    # 2. List
    response = client.get("/api/feature-stores/test-org-456")
    assert response.status_code == 200
    list_data = response.json()
    assert len(list_data) >= 1
    matched = [item for item in list_data if item["id"] == reg_id]
    assert len(matched) == 1
    assert matched[0]["store_type"] == "vertex"
    
    # 3. Poll manual
    poll_response = client.post(f"/api/feature-stores/{reg_id}/poll-now")
    assert poll_response.status_code == 200
    poll_data = poll_response.json()
    assert poll_data["status"] == "success"
    assert "age" in poll_data["results"]
    
    # 4. Delete
    del_response = client.delete(f"/api/feature-stores/{reg_id}")
    assert del_response.status_code == 200
    assert del_response.json()["status"] == "success"
