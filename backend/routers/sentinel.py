from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel
from firebase_admin import firestore
import os
import subprocess
import json as json_lib
import httpx
import shutil
from datetime import datetime, timezone

router = APIRouter(prefix="/api/sentinel", tags=["sentinel"])

class CreateSentinelRequest(BaseModel):
    model_name: str
    target_endpoint: str
    target_auth_header: str | None = None
    protected_attributes: list[str]
    prediction_field: str
    positive_prediction_value: str
    privileged_group_values: dict[str, str]
    rolling_window_size: int = 1000
    di_threshold: float = 0.8
    min_decisions_before_trip: int = 50
    evaluation_interval_seconds: int = 30
    breaker_mode: str = "intercept"
    alert_webhook_url: str | None = None

@router.post("")
async def create_sentinel(orgId: str, request: CreateSentinelRequest, raw_request: Request):
    """
    Provisions a new Sentinel proxy for an organization.
    Deploys a new Cloud Run service configured for this org's model.
    """
    import uuid
    sentinel_id = f"sentinel-{str(uuid.uuid4())[:8]}"
    
    # Store sentinel config in Firestore
    sentinel_doc = {
        "sentinel_id": sentinel_id,
        "org_id": orgId,
        "model_name": request.model_name,
        "target_endpoint": request.target_endpoint,
        "status": "PROVISIONING",
        "created_at": firestore.SERVER_TIMESTAMP,
        "config": request.dict(),
    }
    
    db = firestore.client()
    db.collection("sentinel_configs").document(sentinel_id).set(sentinel_doc)
    
    # Check if gcloud is installed. If not, fallback to a local simulation.
    gcloud_path = shutil.which("gcloud")
    if not gcloud_path:
        base_url = str(raw_request.base_url).rstrip("/")
        sentinel_url = f"{base_url}/api/sentinel/sentinel-mock/{sentinel_id}"
        
        # Initialize simulation state
        db.collection("sentinel_configs").document(sentinel_id).update({
            "status": "ACTIVE",
            "sentinel_url": sentinel_url,
            "simulated": True,
        })
        
        db.collection("sentinel_breaker_states").document(sentinel_id).set({
            "state": "CLOSED",
            "tripped_at": None,
            "trip_reason": None,
            "decisions_intercepted": 0,
            "auto_reset_scheduled_at": None,
        })
        
        return {
            "sentinel_id": sentinel_id,
            "sentinel_url": sentinel_url,
            "status": "ACTIVE",
            "instructions": (
                "Google Cloud CLI (gcloud) not found in PATH. Created a simulated local Sentinel. "
                f"Send model requests through simulated proxy URL: {sentinel_url}"
            ),
        }

    # Deploy Cloud Run service
    env_vars = [
        f"SENTINEL_ID={sentinel_id}",
        f"ORG_ID={orgId}",
        f"MODEL_NAME={request.model_name}",
        f"TARGET_ENDPOINT={request.target_endpoint}",
        f"PROTECTED_ATTRIBUTES={json_lib.dumps(request.protected_attributes)}",
        f"PREDICTION_FIELD={request.prediction_field}",
        f"POSITIVE_PREDICTION_VALUE={request.positive_prediction_value}",
        f"PRIVILEGED_GROUP_VALUES={json_lib.dumps(request.privileged_group_values)}",
        f"ROLLING_WINDOW_SIZE={request.rolling_window_size}",
        f"DI_THRESHOLD={request.di_threshold}",
        f"MIN_DECISIONS_BEFORE_TRIP={request.min_decisions_before_trip}",
        f"EVAL_INTERVAL_SECONDS={request.evaluation_interval_seconds}",
        f"BREAKER_MODE={request.breaker_mode}",
        f"REDIS_HOST={os.environ.get('REDIS_HOST', 'localhost')}",
        f"GCP_PROJECT_ID={os.environ.get('GCP_PROJECT_ID', '')}",
    ]
    if request.target_auth_header:
        env_vars.append(f"TARGET_AUTH_HEADER={request.target_auth_header}")
    if request.alert_webhook_url:
        env_vars.append(f"ALERT_WEBHOOK_URL={request.alert_webhook_url}")
    if os.environ.get("GEMINI_API_KEY"):
        env_vars.append(f"GEMINI_API_KEY={os.environ['GEMINI_API_KEY']}")
    
    gcp_region = os.environ.get("GCP_REGION", "asia-south1")
    gcp_project = os.environ.get("GCP_PROJECT_ID", "")
    image_uri = f"{gcp_region}-docker.pkg.dev/{gcp_project}/visionai/visionai-sentinel:latest"
    
    deploy_cmd = [
        "gcloud", "run", "deploy", f"visionai-sentinel-{sentinel_id}",
        "--image", image_uri,
        "--region", gcp_region,
        "--platform", "managed",
        "--min-instances", "1",
        "--memory", "1Gi",
        "--vpc-connector", "visionai-vpc-connector",
        "--set-env-vars", ",".join(env_vars),
        "--format", "json",
    ]
    
    try:
        result = subprocess.run(deploy_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            db.collection("sentinel_configs").document(sentinel_id).update({"status": "FAILED"})
            raise HTTPException(status_code=500, detail=f"Deployment failed: {result.stderr}")
        
        deploy_output = json_lib.loads(result.stdout)
        sentinel_url = deploy_output.get("status", {}).get("url", "")
    except Exception as e:
        db.collection("sentinel_configs").document(sentinel_id).update({"status": "FAILED"})
        raise HTTPException(status_code=500, detail=f"Deployment failed: {str(e)}")
    
    db.collection("sentinel_configs").document(sentinel_id).update({
        "status": "ACTIVE",
        "sentinel_url": sentinel_url,
    })
    
    return {
        "sentinel_id": sentinel_id,
        "sentinel_url": sentinel_url,
        "status": "ACTIVE",
        "instructions": (
            f"Point your client applications to: {sentinel_url} instead of your model endpoint. "
            f"All traffic will be proxied through VisionAI Sentinel."
        ),
    }

@router.get("")
async def list_sentinels(orgId: str):
    """Lists all configured Sentinels for an organization."""
    db = firestore.client()
    docs = db.collection("sentinel_configs").where("org_id", "==", orgId).stream()
    return [doc.to_dict() for doc in docs]

@router.get("/{sentinel_id}/status")
async def get_sentinel_status(sentinel_id: str):
    """Fetches live status from the Sentinel proxy."""
    db = firestore.client()
    doc = db.collection("sentinel_configs").document(sentinel_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Sentinel not found")
    
    config = doc.to_dict()
    sentinel_url = config.get("sentinel_url")
    
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            resp = await client.get(f"{sentinel_url}/_sentinel/status")
            live_status = resp.json()
        except Exception as e:
            live_status = {"error": f"Sentinel unreachable at {sentinel_url}: {str(e)}"}
    
    return {**config, "live_status": live_status}

@router.get("/{sentinel_id}/review-queue")
async def get_review_queue(sentinel_id: str, status: str = "PENDING", limit: int = 50):
    """Returns the manual review queue for a sentinel."""
    db = firestore.client()
    query = (
        db.collection("sentinel_review_queue")
        .where("sentinel_id", "==", sentinel_id)
        .where("status", "==", status)
    )
    docs = query.stream()
    docs_list = [doc.to_dict() for doc in docs]
    # Sort in memory: enqueued_at descending
    docs_list.sort(key=lambda x: x.get("enqueued_at", ""), reverse=True)
    return docs_list[:limit]

@router.patch("/{sentinel_id}/review-queue/{review_id}")
async def resolve_review(sentinel_id: str, review_id: str, final_decision: str, reviewed_by: str, notes: str = ""):
    """Marks a review queue item as resolved with a human decision."""
    from datetime import datetime, UTC
    db = firestore.client()
    db.collection("sentinel_review_queue").document(review_id).update({
        "status": "REVIEWED",
        "final_decision": final_decision,  # "APPROVED" | "REJECTED"
        "reviewed_by": reviewed_by,
        "reviewer_notes": notes,
        "reviewed_at": datetime.now(UTC).isoformat(),
    })
    return {"review_id": review_id, "final_decision": final_decision}

@router.post("/{sentinel_id}/reset-breaker")
async def reset_breaker(sentinel_id: str, reset_by: str):
    """Triggers a breaker reset via the Sentinel's management endpoint."""
    db = firestore.client()
    doc = db.collection("sentinel_configs").document(sentinel_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Sentinel not found")
    config = doc.to_dict()
    sentinel_url = config.get("sentinel_url")
    
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(f"{sentinel_url}/_sentinel/reset?reset_by={reset_by}")
        return resp.json()

@router.delete("/{sentinel_id}")
async def delete_sentinel(sentinel_id: str):
    """Deletes a sentinel config, clean up breaker states, review queues, and deletes the Cloud Run service."""
    db = firestore.client()
    doc_ref = db.collection("sentinel_configs").document(sentinel_id)
    doc = doc_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Sentinel not found")
        
    config = doc.to_dict()
    simulated = config.get("simulated", False)
    
    # Delete from Firestore sentinel_configs
    doc_ref.delete()
    
    # Delete from sentinel_breaker_states
    db.collection("sentinel_breaker_states").document(sentinel_id).delete()
    
    # Delete related review queue items
    reviews = db.collection("sentinel_review_queue").where("sentinel_id", "==", sentinel_id).stream()
    for r in reviews:
        r.reference.delete()
        
    # Clean up simulated window
    if sentinel_id in SIMULATED_WINDOWS:
        del SIMULATED_WINDOWS[sentinel_id]
        
    # If not simulated, delete Cloud Run service asynchronously
    if not simulated:
        gcloud_path = shutil.which("gcloud")
        if gcloud_path:
            gcp_region = os.environ.get("GCP_REGION", "asia-south1")
            delete_cmd = [
                "gcloud", "run", "services", "delete", f"visionai-sentinel-{sentinel_id}",
                "--region", gcp_region,
                "--quiet",
            ]
            try:
                subprocess.Popen(delete_cmd)  # Non-blocking background process execution
            except Exception:
                pass
                
    return {"status": "DELETED", "sentinel_id": sentinel_id}

async def run_traffic_simulation_task(sentinel_id: str, sentinel_url: str):
    """Background task to generate 60 requests spaced out by 100ms."""
    import asyncio
    import random
    is_simulated = "/sentinel-mock/" in sentinel_url
    async with httpx.AsyncClient() as client:
        for _ in range(60):
            gender = "Female" if random.random() < 0.5 else "Male"
            payload = {
                "gender": gender,
                "income": random.randint(30000, 150000),
                "credit_score": random.randint(580, 850)
            }
            try:
                if is_simulated:
                    # Execute internal simulation logic directly to avoid outbound network blocks on cloud
                    await process_simulated_decision_internal(sentinel_id, payload)
                else:
                    # Real Cloud Run deployed Sentinel proxy URL
                    await client.post(sentinel_url, json=payload, timeout=5.0)
            except Exception:
                pass
            await asyncio.sleep(0.1)

@router.post("/{sentinel_id}/simulate-traffic")
async def simulate_traffic(sentinel_id: str, background_tasks: BackgroundTasks):
    """Triggers background traffic simulator to send requests to the Sentinel."""
    db = firestore.client()
    doc = db.collection("sentinel_configs").document(sentinel_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Sentinel not found")
        
    config = doc.to_dict()
    sentinel_url = config.get("sentinel_url")
    if not sentinel_url:
        raise HTTPException(status_code=400, detail="Sentinel proxy URL not found")
        
    background_tasks.add_task(run_traffic_simulation_task, sentinel_id, sentinel_url)
    return {"status": "SIMULATION_STARTED", "sentinel_id": sentinel_id}




# Simulated sliding window decisions (in-memory, mapping sentinel_id -> list of decisions)
SIMULATED_WINDOWS = {}

def extract_nested(data: dict, key: str) -> any:
    parts = key.split(".")
    current = data
    for part in parts:
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current

def compute_simulated_di(decisions: list, protected_col: str, privileged_value: str) -> dict:
    if not decisions:
        return {"di_ratio": 1.0, "window_size": 0, "insufficient_data": True}
        
    privileged_decisions = [
        d for d in decisions
        if d.get("protected_attribute_values", {}).get(protected_col) == privileged_value
    ]
    unprivileged_decisions = [
        d for d in decisions
        if d.get("protected_attribute_values", {}).get(protected_col) != privileged_value
        and d.get("protected_attribute_values", {}).get(protected_col) is not None
    ]
    
    if len(privileged_decisions) < 5 or len(unprivileged_decisions) < 5:
        return {
            "di_ratio": 1.0,
            "window_size": len(decisions),
            "insufficient_data": True,
            "reason": f"Need at least 5 decisions per group. Have {len(privileged_decisions)} privileged, {len(unprivileged_decisions)} unprivileged."
        }
        
    p_priv = sum(1 for d in privileged_decisions if d.get("is_positive")) / len(privileged_decisions)
    p_unpriv = sum(1 for d in unprivileged_decisions if d.get("is_positive")) / len(unprivileged_decisions)
    
    di_ratio = p_unpriv / p_priv if p_priv > 0 else 1.0
    
    return {
        "di_ratio": round(di_ratio, 4),
        "privileged_positive_rate": round(p_priv, 4),
        "unprivileged_positive_rate": round(p_unpriv, 4),
        "privileged_count": len(privileged_decisions),
        "unprivileged_count": len(unprivileged_decisions),
        "window_size": len(decisions),
        "insufficient_data": False,
    }

@router.get("/sentinel-mock/{sentinel_id}/_sentinel/status")
async def simulated_status(sentinel_id: str):
    db = firestore.client()
    doc = db.collection("sentinel_configs").document(sentinel_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Sentinel config not found")
    config_data = doc.to_dict()
    config = config_data.get("config", {})
    
    breaker_doc = db.collection("sentinel_breaker_states").document(sentinel_id).get()
    if breaker_doc.exists:
        breaker_state_data = breaker_doc.to_dict()
    else:
        breaker_state_data = {
            "state": "CLOSED",
            "tripped_at": None,
            "trip_reason": None,
            "decisions_intercepted": 0,
            "auto_reset_scheduled_at": None,
        }
    
    decisions = SIMULATED_WINDOWS.get(sentinel_id, [])
    
    di_metrics = {}
    protected_attributes = config.get("protected_attributes", [])
    privileged_group_values = config.get("privileged_group_values", {})
    for attr in protected_attributes:
        priv_val = privileged_group_values.get(attr)
        if priv_val is not None:
            di_metrics[attr] = compute_simulated_di(decisions, attr, priv_val)
            
    recent_decisions = list(reversed(decisions))[:20]
    
    return {
        "sentinel_id": sentinel_id,
        "model_name": config.get("model_name"),
        "breaker_state": breaker_state_data,
        "window_size": len(decisions),
        "live_di_metrics": di_metrics,
        "recent_decisions": recent_decisions,
    }

@router.post("/sentinel-mock/{sentinel_id}/_sentinel/reset")
async def simulated_reset(sentinel_id: str, reset_by: str = "api"):
    db = firestore.client()
    reset_data = {
        "state": "CLOSED",
        "reset_at": datetime.now(timezone.utc).isoformat(),
        "reset_by": reset_by,
        "trip_reason": None,
        "tripped_at": None,
    }
    db.collection("sentinel_breaker_states").document(sentinel_id).update(reset_data)
    return {"result": "BREAKER_RESET", "reset_by": reset_by}

async def process_simulated_decision_internal(sentinel_id: str, body: dict) -> dict:
    db = firestore.client()
    doc = db.collection("sentinel_configs").document(sentinel_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Sentinel config not found")
    config_data = doc.to_dict()
    config = config_data.get("config", {})
    
    protected_values = {}
    for attr in config.get("protected_attributes", []):
        val = extract_nested(body, attr)
        if val is not None:
            protected_values[attr] = str(val)
            
    target_endpoint = config.get("target_endpoint")
    headers = {"Content-Type": "application/json"}
    if config.get("target_auth_header"):
        headers["Authorization"] = config["target_auth_header"]
        
    model_response_data = None
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                target_endpoint,
                json=body,
                headers=headers,
                timeout=float(config.get("target_timeout_seconds", 10.0))
            )
            model_response_data = resp.json()
            model_status_code = resp.status_code
        except Exception:
            pass  # Will fall back to mock below
    
    # If the real model endpoint is unreachable (e.g. localhost URL on cloud deployment),
    # generate a synthetic biased response to demonstrate the Sentinel circuit-breaker.
    if model_response_data is None:
        import random
        prediction_field = config.get("prediction_field", "prediction")
        positive_val = config.get("positive_prediction_value", "approved")
        negative_val = "denied"
        # Introduce deliberate gender bias for demo: Males approved ~75%, Females ~40%
        gender_val = body.get("gender", "")
        if str(gender_val).lower() == "male":
            outcome = positive_val if random.random() < 0.75 else negative_val
        else:
            outcome = positive_val if random.random() < 0.40 else negative_val
        model_response_data = {prediction_field: outcome}
        model_status_code = 200
            
    prediction_field = config.get("prediction_field")
    positive_val = config.get("positive_prediction_value")
    raw_prediction = extract_nested(model_response_data, prediction_field)
    is_positive = str(raw_prediction) == str(positive_val)
    
    breaker_ref = db.collection("sentinel_breaker_states").document(sentinel_id)
    breaker_doc = breaker_ref.get()
    if breaker_doc.exists:
        breaker_data = breaker_doc.to_dict()
    else:
        breaker_data = {
            "state": "CLOSED",
            "tripped_at": None,
            "trip_reason": None,
            "decisions_intercepted": 0,
            "auto_reset_scheduled_at": None,
        }
        
    breaker_state = breaker_data.get("state", "CLOSED")
    
    import uuid
    import time
    decision = {
        "request_id": str(uuid.uuid4()),
        "timestamp": time.time(),
        "protected_attribute_values": protected_values,
        "raw_prediction": str(raw_prediction) if raw_prediction is not None else "",
        "is_positive": is_positive,
        "was_intercepted": False,
    }
    
    if sentinel_id not in SIMULATED_WINDOWS:
        SIMULATED_WINDOWS[sentinel_id] = []
        
    SIMULATED_WINDOWS[sentinel_id].append(decision)
    window_size_limit = int(config.get("rolling_window_size", 1000))
    if len(SIMULATED_WINDOWS[sentinel_id]) > window_size_limit:
        SIMULATED_WINDOWS[sentinel_id] = SIMULATED_WINDOWS[sentinel_id][-window_size_limit:]
        
    di_tripped = False
    trip_reason_to_set = None
    trip_attr = None
    trip_di = None
    trip_stats = None
    
    total_decisions = len(SIMULATED_WINDOWS[sentinel_id])
    min_decisions = int(config.get("min_decisions_before_trip", 50))
    
    if total_decisions >= min_decisions:
        for attr in config.get("protected_attributes", []):
            priv_val = config.get("privileged_group_values", {}).get(attr)
            if priv_val is not None:
                stats = compute_simulated_di(SIMULATED_WINDOWS[sentinel_id], attr, priv_val)
                if not stats.get("insufficient_data", False):
                    di_ratio = stats.get("di_ratio", 1.0)
                    threshold = float(config.get("di_threshold", 0.8))
                    if di_ratio < threshold:
                        di_tripped = True
                        trip_attr = attr
                        trip_di = di_ratio
                        trip_stats = stats
                        break
                        
    if di_tripped and breaker_state == "CLOSED":
        breaker_state = "OPEN"
        trip_reason_to_set = {
            "protected_attribute": trip_attr,
            "live_di_ratio": trip_di,
            "threshold": float(config.get("di_threshold", 0.8)),
            "window_stats": trip_stats,
            "message": (
                f"Live Disparate Impact for '{trip_attr}' dropped to {trip_di:.3f} "
                f"(threshold: {config.get('di_threshold', 0.8)}). "
                f"Unprivileged group positive rate: {trip_stats.get('unprivileged_positive_rate', 'N/A'):.1%} "
                f"vs privileged: {trip_stats.get('privileged_positive_rate', 'N/A'):.1%}. "
                f"Computed over {trip_stats.get('window_size', 0)} recent decisions."
            ),
        }
        breaker_ref.set({
            "state": "OPEN",
            "tripped_at": datetime.now(timezone.utc).isoformat(),
            "trip_reason": trip_reason_to_set,
            "decisions_intercepted": 0,
            "auto_reset_scheduled_at": None,
        }, merge=True)
        breaker_data = breaker_ref.get().to_dict()
        
    if breaker_state == "OPEN" and not is_positive:
        trip_reason = breaker_data.get("trip_reason", {})
        flagged_attr = trip_reason.get("protected_attribute")
        
        should_intercept = True
        if flagged_attr and flagged_attr in protected_values:
            priv_val = config.get("privileged_group_values", {}).get(flagged_attr)
            if protected_values[flagged_attr] == priv_val:
                should_intercept = False
                
        if should_intercept or config.get("breaker_mode") == "block_all":
            decision["was_intercepted"] = True
            breaker_ref.update({"decisions_intercepted": firestore.Increment(1)})
            
            review_id = f"rev-{str(uuid.uuid4())[:8]}"
            review_doc = {
                "review_id": review_id,
                "sentinel_id": sentinel_id,
                "org_id": config_data.get("org_id"),
                "model_name": config.get("model_name"),
                "original_request": body,
                "model_raw_response": model_response_data,
                "protected_attribute_values": protected_values,
                "trip_reason": trip_reason,
                "status": "PENDING",
                "enqueued_at": datetime.now(timezone.utc).isoformat(),
                "final_decision": None,
                "reviewed_by": None,
                "reviewer_notes": None,
                "reviewed_at": None,
            }
            db.collection("sentinel_review_queue").document(review_id).set(review_doc)
            
            return {
                "status": "MANUAL_REVIEW_REQUIRED",
                "review_id": review_id,
                "message": (
                    "This application has been flagged for manual review by VisionAI Sentinel. "
                    "An automated decision was not issued. A human reviewer will assess this "
                    "application and contact you within the review SLA window."
                ),
                "sentinel_id": sentinel_id,
                "intercepted_at": datetime.now(timezone.utc).isoformat(),
            }
            
    return {
        **model_response_data,
        "_sentinel": {
            "request_id": decision["request_id"],
            "breaker_state": breaker_state,
            "latency_ms": 5.0,
        }
    }

@router.api_route("/sentinel-mock/{sentinel_id}/{path:path}", methods=["POST"])
@router.api_route("/sentinel-mock/{sentinel_id}", methods=["POST"])
async def simulated_proxy(sentinel_id: str, raw_request: Request, path: str = ""):
    try:
        body = await raw_request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    return await process_simulated_decision_internal(sentinel_id, body)
