import logging
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from firebase_admin import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from services.feature_store.connector import (
    VertexFeatureStoreConnector,
    FeastConnector,
    GenericRESTConnector,
    run_feature_store_bias_check
)

logger = logging.getLogger("feature_stores_router")

router = APIRouter()


class ConnectionConfig(BaseModel):
    # Vertex AI configuration
    project: str | None = None
    location: str | None = None
    featurestore_id: str | None = None
    entity_type_id: str | None = None
    entity_ids: list[str] | None = None
    
    # Feast configuration
    feast_server_url: str | None = None
    feature_service_name: str | None = None
    
    # Generic REST configuration
    endpoint: str | None = None
    headers: dict | None = None
    response_data_key: str | None = None


class TestConnectionRequest(BaseModel):
    store_type: str  # "vertex" | "feast" | "rest"
    connection_config: ConnectionConfig
    protected_cols: list[str]
    label_col: str
    positive_label: str
    is_mock: bool = False


class RegisterStoreRequest(BaseModel):
    org_id: str
    store_type: str  # "vertex" | "feast" | "rest"
    connection_config: ConnectionConfig
    protected_cols: list[str]
    label_col: str
    positive_label: str
    polling_interval_hours: int
    is_mock: bool = False


def _get_connector(store_type: str, config: ConnectionConfig, is_mock: bool):
    """Instantiate the appropriate connector based on configuration."""
    if store_type == "vertex":
        if not is_mock:
            if not all([config.project, config.location, config.featurestore_id, config.entity_type_id]):
                raise HTTPException(
                    status_code=400, 
                    detail="Project ID, Location, Featurestore ID, and Entity Type ID are required for Vertex AI Feature Store."
                )
        return VertexFeatureStoreConnector(
            project=config.project or "mock-project",
            location=config.location or "mock-location",
            featurestore_id=config.featurestore_id or "mock-fs",
            entity_type_id=config.entity_type_id or "mock-entity",
            is_mock=is_mock
        )
    elif store_type == "feast":
        if not is_mock and not all([config.feast_server_url, config.feature_service_name]):
            raise HTTPException(
                status_code=400,
                detail="Server URL and Feature Service Name are required for Feast."
            )
        return FeastConnector(
            feast_server_url=config.feast_server_url or "http://mock-feast:8080",
            feature_service_name=config.feature_service_name or "mock-service",
            is_mock=is_mock
        )
    elif store_type == "rest":
        if not is_mock and not config.endpoint:
            raise HTTPException(
                status_code=400,
                detail="Endpoint URL is required for Generic REST Feature Store."
            )
        return GenericRESTConnector(
            endpoint=config.endpoint or "http://mock-api/features",
            headers=config.headers or {},
            response_data_key=config.response_data_key or "data",
            is_mock=is_mock
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported feature store type: {store_type}")


@router.post("/test")
async def test_feature_store_connection(req: TestConnectionRequest):
    """Attempt to connect and retrieve a sample snapshot from the feature store."""
    try:
        connector = _get_connector(req.store_type, req.connection_config, req.is_mock)
        
        feature_ids = list(set(req.protected_cols + [req.label_col]))
        entity_ids = req.connection_config.entity_ids or ["entity_1", "entity_2", "entity_3"]
        
        # Run test read
        if req.store_type == "rest":
            df = await connector.read_feature_snapshot(feature_ids=feature_ids)
        elif req.store_type == "feast":
            df = await connector.read_feature_snapshot(feature_ids=feature_ids, entity_ids=entity_ids)
        else:  # vertex
            df = await connector.read_feature_snapshot(feature_ids=feature_ids, entity_ids=entity_ids)
            
        if df.empty:
            return {
                "status": "error",
                "message": "Connection succeeded, but feature store returned no data (empty snapshot)."
            }
            
        return {
            "status": "success",
            "message": f"Successfully connected to Feature Store. Retrieved {len(df)} rows and {len(df.columns)} features.",
            "columns": list(df.columns),
            "sample_row_count": len(df)
        }
    except Exception as e:
        logger.exception("Failed to test connection")
        raise HTTPException(
            status_code=400,
            detail=f"Connection test failed: {str(e)}"
        )


@router.post("/register")
async def register_feature_store(req: RegisterStoreRequest):
    """Save feature store registration inside Firestore."""
    try:
        db = firestore.client()
        registration_id = f"fs_reg_{uuid4().hex[:12]}"
        
        doc_data = {
            "org_id": req.org_id,
            "store_type": req.store_type,
            "connection_config": req.connection_config.model_dump(),
            "protected_cols": req.protected_cols,
            "label_col": req.label_col,
            "positive_label": req.positive_label,
            "polling_interval_hours": req.polling_interval_hours,
            "is_mock": req.is_mock,
            "last_polled": None,
            "last_di_worst": 1.0,
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        db.collection("feature_store_registrations").document(registration_id).set(doc_data)
        
        return {
            "status": "success",
            "registrationId": registration_id,
            "message": "Feature store registration created successfully."
        }
    except Exception as e:
        logger.exception("Failed to register feature store")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create registration: {str(e)}"
        )


@router.get("/{org_id}")
def list_feature_stores(org_id: str):
    """Retrieve all feature store registrations for an organization."""
    try:
        db = firestore.client()
        query = db.collection("feature_store_registrations").where(filter=FieldFilter("org_id", "==", org_id))
        docs = query.stream()
        
        registrations = []
        for doc in docs:
            data = doc.to_dict() or {}
            data["id"] = doc.id
            registrations.append(data)
            
        return registrations
    except Exception as e:
        logger.exception("Failed to list feature stores")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load registrations: {str(e)}"
        )


@router.delete("/{registration_id}")
def delete_feature_store(registration_id: str):
    """Remove feature store registration from Firestore."""
    try:
        db = firestore.client()
        ref = db.collection("feature_store_registrations").document(registration_id)
        doc = ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Feature store registration not found.")
            
        ref.delete()
        return {
            "status": "success",
            "message": "Feature store registration deleted successfully."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to delete feature store")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete registration: {str(e)}"
        )


@router.post("/{registration_id}/poll-now")
async def poll_feature_store_now(registration_id: str):
    """Manually trigger dynamic polling bias check on registered feature store."""
    try:
        db = firestore.client()
        ref = db.collection("feature_store_registrations").document(registration_id)
        doc = ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Feature store registration not found.")
            
        reg = doc.to_dict() or {}
        
        # Build connection config model
        config = ConnectionConfig(**reg.get("connection_config", {}))
        is_mock = reg.get("is_mock", False)
        
        connector = _get_connector(reg["store_type"], config, is_mock)
        
        # Prepare kwargs
        kwargs = {}
        if reg["store_type"] == "rest":
            kwargs["params"] = {}
        else:
            kwargs["entity_ids"] = config.entity_ids or ["entity_1", "entity_2", "entity_3"]
            
        # Run bias check
        results = await run_feature_store_bias_check(
            connector=connector,
            protected_cols=reg["protected_cols"],
            label_col=reg["label_col"],
            positive_label=reg["positive_label"],
            org_id=reg["org_id"],
            pipeline_id=registration_id,
            **kwargs
        )
        
        if "error" in results:
            ref.update({
                "status": "error",
                "last_polled": datetime.now(timezone.utc).isoformat()
            })
            raise HTTPException(status_code=400, detail=results["error"])
            
        # Compute worst disparate impact
        worst_di = 1.0
        for attr, res in results.items():
            di = res.get("disparate_impact")
            if di is not None:
                worst_di = min(worst_di, di)
                
        # Update registration status & metrics
        ref.update({
            "status": "active",
            "last_polled": datetime.now(timezone.utc).isoformat(),
            "last_di_worst": worst_di
        })
        
        return {
            "status": "success",
            "message": "Polled successfully.",
            "results": results,
            "worstDi": worst_di
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to poll feature store")
        raise HTTPException(
            status_code=500,
            detail=f"Polling job failed: {str(e)}"
        )
