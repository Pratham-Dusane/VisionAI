"""
Audit router — Create, retrieve, and list audits.
Handles the full flow: create audit → run preprocessing → store results in Firestore.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime
import pandas as pd
from pathlib import Path

from core.firebase_init import download_from_storage, cleanup_temp_file
from services.preprocessing.schema_parser import parse_schema
from services.preprocessing.proxy_detector import detect_proxies
from services.preprocessing.data_profiler import profile_data

import firebase_admin
from firebase_admin import firestore

router = APIRouter()


class CreateAuditRequest(BaseModel):
    orgId: str
    name: str
    domain: str
    storagePath: str
    labelCol: str
    positiveLabel: str
    protectedCols: list[str]
    threshold: float = 0.8
    dataOnly: bool = False
    modelStoragePath: str | None = None
    deployed: bool = False
    deployedSince: str | None = None
    decisionsPerMonth: int | None = None


def _load_dataframe(local_path: Path) -> pd.DataFrame:
    ext = local_path.suffix.lower()
    if ext == ".csv":
        return pd.read_csv(local_path)
    elif ext == ".json":
        return pd.read_json(local_path)
    elif ext == ".parquet":
        return pd.read_parquet(local_path)
    else:
        raise ValueError(f"Unsupported format: {ext}")


@router.post("")
async def create_audit(req: CreateAuditRequest):
    """
    Create a new audit:
    1. Download dataset from GCS
    2. Run schema parser, proxy detector, data profiler
    3. Store everything in Firestore
    4. Return audit ID + preprocessing results
    """
    local_path = None
    try:
        db = firestore.client()

        # Download dataset from GCS
        local_path = download_from_storage(req.storagePath)
        df = _load_dataframe(local_path)

        # Run preprocessing pipeline
        schema = parse_schema(df)
        proxies = detect_proxies(df, req.protectedCols)
        profiles = profile_data(df, req.protectedCols, req.labelCol, req.positiveLabel)

        # Build audit document
        audit_doc = {
            "orgId": req.orgId,
            "name": req.name,
            "domain": req.domain,
            "storagePath": req.storagePath,
            "labelCol": req.labelCol,
            "positiveLabel": req.positiveLabel,
            "protectedCols": req.protectedCols,
            "threshold": req.threshold,
            "dataOnly": req.dataOnly,
            "modelStoragePath": req.modelStoragePath,
            "deployed": req.deployed,
            "deployedSince": req.deployedSince,
            "decisionsPerMonth": req.decisionsPerMonth,
            "status": "COMPLETE",
            "createdAt": datetime.utcnow().isoformat(),
            "rowCount": schema["row_count"],
            "columnCount": schema["column_count"],
            # Preprocessing results
            "schema": schema,
            "proxies": proxies,
            "profiles": profiles,
        }

        # Save to Firestore
        doc_ref = db.collection("audits").document()
        doc_ref.set(audit_doc)

        return {
            "auditId": doc_ref.id,
            "status": "COMPLETE",
            "schema": schema,
            "proxies": proxies,
            "profiles": profiles,
        }

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audit creation failed: {str(e)}")
    finally:
        if local_path:
            cleanup_temp_file(local_path)


@router.get("/{audit_id}")
async def get_audit(audit_id: str):
    """Retrieve a single audit by ID."""
    try:
        db = firestore.client()
        doc = db.collection("audits").document(audit_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Audit not found")
        data = doc.to_dict()
        data["id"] = doc.id
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


from google.cloud.firestore_v1.base_query import FieldFilter

@router.get("")
async def list_audits(orgId: str):
    """List all audits for an organization, newest first."""
    try:
        db = firestore.client()
        docs = (
            db.collection("audits")
            .where(filter=FieldFilter("orgId", "==", orgId))
            .stream()
        )
        audits = []
        for doc in docs:
            data = doc.to_dict()
            data["id"] = doc.id
            audits.append(data)
        # Sort client-side to avoid needing a composite index
        audits.sort(key=lambda x: x.get("createdAt", ""), reverse=True)
        return audits
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
