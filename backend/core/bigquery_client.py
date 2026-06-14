import os
import logging
from datetime import datetime

try:
    from google.cloud import bigquery
except ImportError:
    bigquery = None

async def insert_drift_row(row: dict) -> None:
    """Insert a single drift metrics row into BigQuery dataset."""
    if bigquery is None:
        logging.info("[BigQuery] Client SDK not installed, skipping BigQuery persistence.")
        return
    
    dataset = os.getenv("BIGQUERY_DATASET", "visionai_analytics")
    table_ref = f"{dataset}.drift_metrics"
    
    try:
        # Resolve client with Application Default Credentials or local credential file
        client = bigquery.Client()
        
        # Serialize datetime fields to ISO strings
        serialized_row = {}
        for k, v in row.items():
            if isinstance(v, datetime):
                serialized_row[k] = v.isoformat()
            else:
                serialized_row[k] = v
        
        # Insert JSON row directly
        errors = client.insert_rows_json(table_ref, [serialized_row])
        if errors:
            logging.error(f"[BigQuery] Failed to insert row. Errors: {errors}")
        else:
            logging.info(f"[BigQuery] Successfully inserted drift metrics row to {table_ref}")
    except Exception as e:
        logging.warning(f"[BigQuery] Failed to persist drift metrics row: {str(e)}")
