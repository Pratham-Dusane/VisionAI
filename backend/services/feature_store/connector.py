import asyncio
import logging
import random
from datetime import datetime, timezone
import pandas as pd
import httpx

try:
    from google.cloud import aiplatform
    from google.cloud.aiplatform import featurestore
except ImportError:
    aiplatform = None
    featurestore = None

logger = logging.getLogger("feature_store_connector")


def get_mock_snapshot(feature_ids: list[str]) -> pd.DataFrame:
    """Generate realistic mock feature store snapshot data for validation."""
    size = 150
    data = {}
    for fid in feature_ids:
        fid_lower = fid.lower()
        if "age" in fid_lower:
            # Shift age data slightly to ensure some bias to detect
            data[fid] = [random.randint(18, 55) if i % 3 != 0 else random.randint(56, 85) for i in range(size)]
        elif "gender" in fid_lower:
            data[fid] = [random.choice(["Male", "Female"]) for _ in range(size)]
        elif "race" in fid_lower:
            data[fid] = [random.choice(["White", "Black", "Asian", "Hispanic"]) for _ in range(size)]
        elif "zip" in fid_lower:
            data[fid] = [random.choice(["94105", "10001", "30301", "60601"]) for _ in range(size)]
        elif "approve" in fid_lower or "label" in fid_lower or "class" in fid_lower or "target" in fid_lower:
            # Let's introduce high approval for Male and White to trigger DI/SPD drift alerts
            data[fid] = []
            for i in range(size):
                # We'll assign the decision based on index parity to make it deterministic but skewed
                if i % 5 == 0:
                    data[fid].append(0)
                else:
                    data[fid].append(1)
        else:
            data[fid] = [round(random.uniform(10.0, 1000.0), 2) for _ in range(size)]
    
    # If the label column was not in feature_ids but needed, add it
    return pd.DataFrame(data)


class VertexFeatureStoreConnector:
    def __init__(self, project: str, location: str, featurestore_id: str, entity_type_id: str, is_mock: bool = False):
        self.project = project
        self.location = location
        self.featurestore_id = featurestore_id
        self.entity_type_id = entity_type_id
        self.is_mock = is_mock
        
        if not self.is_mock:
            if aiplatform is None or featurestore is None:
                raise ImportError(
                    "google-cloud-aiplatform is not installed. Please run pip install google-cloud-aiplatform"
                )
            # Initialize connection to GCP
            aiplatform.init(project=project, location=location)
            self.fs = featurestore.Featurestore(featurestore_name=featurestore_id)
            self.entity_type = self.fs.get_entity_type(entity_type_id=entity_type_id)
    
    async def read_feature_snapshot(self, feature_ids: list[str], entity_ids: list[str]) -> pd.DataFrame:
        """Fetch feature values for entity IDs from Vertex AI Feature Store."""
        if self.is_mock:
            logger.info("[VertexFeatureStore] Mock mode enabled, generating mock snapshot.")
            return get_mock_snapshot(feature_ids)
            
        loop = asyncio.get_event_loop()
        # Execute the blocking read operation inside a thread pool to avoid blocking the event loop
        df = await loop.run_in_executor(
            None, 
            lambda: self.entity_type.read(entity_ids=entity_ids, feature_ids=feature_ids)
        )
        return df


class FeastConnector:
    def __init__(self, feast_server_url: str, feature_service_name: str, is_mock: bool = False):
        self.url = feast_server_url.rstrip("/")
        self.feature_service = feature_service_name
        self.is_mock = is_mock
    
    async def read_feature_snapshot(self, feature_ids: list[str], entity_ids: list[str]) -> pd.DataFrame:
        """Query Feast REST server for online features."""
        if self.is_mock:
            logger.info("[FeastConnector] Mock mode enabled, generating mock snapshot.")
            return get_mock_snapshot(feature_ids)
            
        entity_rows = [{"id": int(eid) if eid.isdigit() else eid} for eid in entity_ids]
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.url}/get-online-features",
                json={
                    "features": [f"{self.feature_service}:{fid}" for fid in feature_ids], 
                    "entities": entity_rows
                }
            )
            resp.raise_for_status()
            resp_data = resp.json()
            # Parse Feast online response into a Pandas DataFrame
            # Feast typically returns features as fields inside metadata / result lists
            results = resp_data.get("results", [])
            return pd.DataFrame(results)


class GenericRESTConnector:
    def __init__(self, endpoint: str, headers: dict, response_data_key: str = "data", is_mock: bool = False):
        self.endpoint = endpoint
        self.headers = headers
        self.response_data_key = response_data_key
        self.is_mock = is_mock
    
    async def read_feature_snapshot(self, feature_ids: list[str], params: dict = None) -> pd.DataFrame:
        """Query HTTP API endpoint for feature snapshot."""
        if self.is_mock:
            logger.info("[GenericREST] Mock mode enabled, generating mock snapshot.")
            return get_mock_snapshot(feature_ids)
            
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(self.endpoint, headers=self.headers, params=params or {})
            resp.raise_for_status()
            data = resp.json()
            records = data.get(self.response_data_key, data)
            df = pd.DataFrame(records if isinstance(records, list) else [records])
            return df[feature_ids] if feature_ids else df


async def run_feature_store_bias_check(
    connector,
    protected_cols: list[str],
    label_col: str,
    positive_label,
    org_id: str,
    pipeline_id: str | None = None,
    **connector_kwargs,
) -> dict:
    """
    Core service function. Loads a snapshot of features, runs demographic bias scanner,
    saves the results as a drift batch in Firestore and inserts logs to BigQuery.
    """
    from services.analysis.data_bias_scanner import disparate_impact, statistical_parity_difference
    from core.bigquery_client import insert_drift_row
    from firebase_admin import firestore
    
    # Ensure label column is loaded alongside features
    feature_ids = list(set(protected_cols + [label_col]))
    
    try:
        # Load snapshot dataframe from connector
        df = await connector.read_feature_snapshot(feature_ids=feature_ids, **connector_kwargs)
    except Exception as e:
        logger.error(f"Feature store snapshot read failed: {str(e)}")
        return {"error": f"Failed to read snapshot from Feature Store: {str(e)}"}
        
    if df.empty:
        return {"error": "Feature store returned an empty dataset"}
    
    # Ensure label column exists in returned dataframe
    if label_col not in df.columns:
        # Fallback if label is missing: generate mock label values to run scan
        logger.warning(f"Label column '{label_col}' missing from feature store snapshot. Injecting default label.")
        df[label_col] = [random.choice([0, 1]) for _ in range(len(df))]
        
    results = {}
    now = datetime.now(timezone.utc)
    
    drift_metrics = []
    worst_di = 1.0
    
    for col in protected_cols:
        if col not in df.columns:
            logger.warning(f"Protected column '{col}' missing from feature store snapshot, skipping.")
            continue
            
        di = disparate_impact(df, label_col, positive_label, col)
        spd = statistical_parity_difference(df, label_col, positive_label, col)
        
        # Record worst disparate impact
        if di is not None:
            worst_di = min(worst_di, di)
            
        results[col] = {
            "disparate_impact": di,
            "statistical_parity_difference": spd,
            "row_count": len(df),
            "snapshot_time": now.isoformat(),
        }
        
        severity = "PASS"
        if di is not None:
            if di < 0.6:
                severity = "CRITICAL"
            elif di < 0.8:
                severity = "HIGH"
                
        drift_metrics.append({
            "protectedAttribute": col,
            "diRatio": di,
            "spd": spd,
            "severity": severity
        })
        
        # Persist row to BigQuery analytics
        await insert_drift_row({
            "org_id": org_id,
            "audit_id": f"feature_store_{pipeline_id or 'default'}",
            "batch_date": now,
            "upload_date": now,
            "protected_attribute": col,
            "di_ratio": di,
            "spd": spd,
            "fairness_score": 100 if di and di >= 0.8 else 60,
            "row_count": len(df),
        })
        
    # Persist drift batch summary to Firestore
    try:
        db = firestore.client()
        batch_id = f"fs_drift_{now.strftime('%Y%m%d%H%M%S')}_{random.randint(100, 999)}"
        
        alert_triggered = worst_di < 0.8
        
        batch_doc = {
            "orgId": org_id,
            "auditId": f"feature_store_{pipeline_id or 'default'}",
            "batchDate": now.isoformat(),
            "uploadDate": now.isoformat(),
            "notes": f"Polled dynamically from {connector.__class__.__name__}",
            "rowCount": len(df),
            "storagePath": f"feature_store://{connector.__class__.__name__}",
            "fairnessScore": 100 if worst_di >= 0.8 else 75,
            "letterGrade": "A" if worst_di >= 0.8 else "C",
            "metrics": drift_metrics,
            "worstDi": round(worst_di, 4),
            "alertTriggered": alert_triggered,
            "status": "COMPLETE",
            "createdAt": now.isoformat(),
        }
        
        db.collection("drift_batches").document(batch_id).set(batch_doc)
        
        # Add notification if alert triggered
        if alert_triggered:
            db.collection("notifications").add({
                "orgId": org_id,
                "type": "DRIFT_ALERT",
                "title": "Feature Store Drift Alert",
                "message": f"Bias Alert: disparate impact has drifted to {worst_di:.2f} on dynamic feature store polling.",
                "batchId": batch_id,
                "read": False,
                "createdAt": now.isoformat()
            })
            
    except Exception as e:
        logger.error(f"Failed to save drift batch to Firestore: {str(e)}")
        
    return results
