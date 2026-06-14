"""
Pipeline Audits router — PRD v2 §3.3
Manages multi-model pipeline DAGs and propagated fairness analysis.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any
import json
import logging
import math
import numpy as np

from services.analysis.pipeline_propagation import (
    build_pipeline_graph,
    propagate_fairness_scores,
)

router = APIRouter()
logger = logging.getLogger("pipeline_router")


# --- Pydantic models ---
class PipelineNodeIn(BaseModel):
    node_id: str
    audit_id: str
    label: str
    position_x: float = 0
    position_y: float = 0


class PipelineEdgeIn(BaseModel):
    from_node: str
    to_node: str
    output_feature: str = ""
    input_feature: str = ""


class PipelineSaveRequest(BaseModel):
    name: str
    description: str = ""
    nodes: List[PipelineNodeIn]
    edges: List[PipelineEdgeIn]
    protected_attrs: List[str] = []


class PipelineUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    nodes: Optional[List[PipelineNodeIn]] = None
    edges: Optional[List[PipelineEdgeIn]] = None
    protected_attrs: Optional[List[str]] = None


def _pythonize(value: Any) -> Any:
    """Make values JSON-serializable."""
    if isinstance(value, dict):
        return {str(k): _pythonize(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_pythonize(v) for v in value]
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


# --- Routes ---
@router.post("")
async def create_pipeline(req: PipelineSaveRequest):
    """Create a new pipeline definition and save to Firestore."""
    from firebase_admin import firestore as fs

    try:
        # Validate the graph is a valid DAG
        build_pipeline_graph(
            [n.dict() for n in req.nodes],
            [e.dict() for e in req.edges],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db = fs.client()
    pipeline_data = {
        "name": req.name,
        "description": req.description,
        "nodes": [n.dict() for n in req.nodes],
        "edges": [e.dict() for e in req.edges],
        "protected_attrs": req.protected_attrs,
        "status": "DRAFT",
        "created_at": fs.SERVER_TIMESTAMP,
        "updated_at": fs.SERVER_TIMESTAMP,
    }

    doc_ref = db.collection("pipelines").document()
    doc_ref.set(pipeline_data)

    return {"pipeline_id": doc_ref.id, **pipeline_data, "created_at": None, "updated_at": None}


@router.get("")
async def list_pipelines():
    """List all saved pipelines."""
    from firebase_admin import firestore as fs

    db = fs.client()
    docs = db.collection("pipelines").order_by(
        "created_at", direction=fs.Query.DESCENDING
    ).stream()

    pipelines = []
    for doc in docs:
        data = doc.to_dict()
        data["pipeline_id"] = doc.id
        # Convert timestamps to ISO strings
        for ts_field in ["created_at", "updated_at"]:
            if data.get(ts_field) and hasattr(data[ts_field], "isoformat"):
                data[ts_field] = data[ts_field].isoformat()
        pipelines.append(data)

    return pipelines


@router.get("/{pipeline_id}")
async def get_pipeline(pipeline_id: str):
    """Get a single pipeline definition."""
    from firebase_admin import firestore as fs

    db = fs.client()
    doc = db.collection("pipelines").document(pipeline_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    data = doc.to_dict()
    data["pipeline_id"] = doc.id
    for ts_field in ["created_at", "updated_at"]:
        if data.get(ts_field) and hasattr(data[ts_field], "isoformat"):
            data[ts_field] = data[ts_field].isoformat()
    return data


@router.put("/{pipeline_id}")
async def update_pipeline(pipeline_id: str, req: PipelineUpdateRequest):
    """Update an existing pipeline definition."""
    from firebase_admin import firestore as fs

    db = fs.client()
    doc = db.collection("pipelines").document(pipeline_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    update_data = {}
    if req.name is not None:
        update_data["name"] = req.name
    if req.description is not None:
        update_data["description"] = req.description
    if req.nodes is not None:
        update_data["nodes"] = [n.dict() for n in req.nodes]
    if req.edges is not None:
        update_data["edges"] = [e.dict() for e in req.edges]
    if req.protected_attrs is not None:
        update_data["protected_attrs"] = req.protected_attrs

    # Validate graph if nodes or edges changed
    if req.nodes is not None or req.edges is not None:
        existing = doc.to_dict()
        nodes = update_data.get("nodes", existing.get("nodes", []))
        edges = update_data.get("edges", existing.get("edges", []))
        try:
            build_pipeline_graph(nodes, edges)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    update_data["updated_at"] = fs.SERVER_TIMESTAMP
    db.collection("pipelines").document(pipeline_id).update(update_data)

    return {"status": "updated", "pipeline_id": pipeline_id}


@router.delete("/{pipeline_id}")
async def delete_pipeline(pipeline_id: str):
    """Delete a pipeline."""
    from firebase_admin import firestore as fs

    db = fs.client()
    doc = db.collection("pipelines").document(pipeline_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    db.collection("pipelines").document(pipeline_id).delete()
    return {"status": "deleted"}


@router.post("/{pipeline_id}/analyze")
async def analyze_pipeline(pipeline_id: str):
    """
    Run propagation analysis on a pipeline.
    Fetches each node's audit data, builds the DAG, and computes
    compound fairness scores.
    """
    from firebase_admin import firestore as fs

    db = fs.client()
    doc = db.collection("pipelines").document(pipeline_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Pipeline not found")

    pipeline = doc.to_dict()
    nodes = pipeline.get("nodes", [])
    edges = pipeline.get("edges", [])
    protected_attrs = pipeline.get("protected_attrs", [])

    if not nodes:
        raise HTTPException(status_code=400, detail="Pipeline has no nodes")

    # Fetch audit data for each node
    audit_results = {}
    node_audit_map = {}

    for node in nodes:
        audit_id = node["audit_id"]
        if audit_id in node_audit_map:
            audit_results[node["node_id"]] = node_audit_map[audit_id]
            continue

        audit_doc = db.collection("audits").document(audit_id).get()
        if not audit_doc.exists:
            raise HTTPException(
                status_code=400,
                detail=f"Audit {audit_id} not found for node {node['node_id']}",
            )

        audit_data = audit_doc.to_dict()
        if audit_data.get("status") != "COMPLETE":
            raise HTTPException(
                status_code=400,
                detail=f"Audit {audit_id} for node '{node.get('label', node['node_id'])}' "
                       f"is not complete (status: {audit_data.get('status')})",
            )

        node_audit_map[audit_id] = audit_data
        audit_results[node["node_id"]] = audit_data

        # If no protected attrs specified, grab from the first audit
        if not protected_attrs:
            protected_attrs = audit_data.get("protectedCols", [])

    if not protected_attrs:
        raise HTTPException(
            status_code=400,
            detail="No protected attributes specified. Set them on the pipeline "
                   "or ensure the linked audits have protectedCols.",
        )

    try:
        G = build_pipeline_graph(nodes, edges)
        propagation_results = propagate_fairness_scores(G, audit_results, protected_attrs)
        propagation_results = _pythonize(propagation_results)

        # Save results to Firestore
        db.collection("pipelines").document(pipeline_id).update({
            "analysis_results": json.dumps(propagation_results),
            "status": "ANALYZED",
            "updated_at": fs.SERVER_TIMESTAMP,
        })

        return {
            "pipeline_id": pipeline_id,
            "protected_attrs": protected_attrs,
            "results": propagation_results,
        }

    except Exception as e:
        logger.error(f"Pipeline analysis failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Pipeline analysis failed: {str(e)}",
        )
