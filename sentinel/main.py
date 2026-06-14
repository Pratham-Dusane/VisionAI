import asyncio
import logging
import os
from contextlib import asynccontextmanager

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from google.cloud import firestore

from config import SentinelConfig
from rolling_window import RollingWindowStore
from circuit_breaker import CircuitBreakerStateManager
from interceptor import RequestInterceptor
from agent import SentinelAgent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
redis_client: aioredis.Redis = None
db: firestore.AsyncClient = None
interceptor: RequestInterceptor = None
agent: SentinelAgent = None
agent_task: asyncio.Task = None

def load_config_from_env() -> SentinelConfig:
    """
    Loads sentinel config from environment variables.
    These are injected at Cloud Run deploy time from Secret Manager.
    """
    import json
    return SentinelConfig(
        sentinel_id=os.environ["SENTINEL_ID"],
        org_id=os.environ["ORG_ID"],
        model_name=os.environ["MODEL_NAME"],
        target_endpoint=os.environ["TARGET_ENDPOINT"],
        target_auth_header=os.environ.get("TARGET_AUTH_HEADER"),
        target_timeout_seconds=float(os.environ.get("TARGET_TIMEOUT_SECONDS", "10")),
        protected_attributes=json.loads(os.environ["PROTECTED_ATTRIBUTES"]),
        prediction_field=os.environ["PREDICTION_FIELD"],
        positive_prediction_value=os.environ["POSITIVE_PREDICTION_VALUE"],
        privileged_group_values=json.loads(os.environ["PRIVILEGED_GROUP_VALUES"]),
        rolling_window_size=int(os.environ.get("ROLLING_WINDOW_SIZE", "1000")),
        di_threshold=float(os.environ.get("DI_THRESHOLD", "0.8")),
        min_decisions_before_trip=int(os.environ.get("MIN_DECISIONS_BEFORE_TRIP", "50")),
        evaluation_interval_seconds=int(os.environ.get("EVAL_INTERVAL_SECONDS", "30")),
        breaker_mode=os.environ.get("BREAKER_MODE", "intercept"),
        auto_reset_minutes=int(os.environ["AUTO_RESET_MINUTES"]) if os.environ.get("AUTO_RESET_MINUTES") else None,
        alert_webhook_url=os.environ.get("ALERT_WEBHOOK_URL"),
        alert_email=os.environ.get("ALERT_EMAIL"),
        gemini_api_key=os.environ.get("GEMINI_API_KEY"),
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client, db, interceptor, agent, agent_task
    
    config = load_config_from_env()
    
    # Initialize Redis
    redis_client = aioredis.Redis(
        host=os.environ["REDIS_HOST"],
        port=int(os.environ.get("REDIS_PORT", "6379")),
        decode_responses=True,
    )
    
    # Initialize Firestore
    key_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not key_path:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        potential_path = os.path.join(base_dir, "..", "backend", "serviceAccountKey.json")
        if os.path.exists(potential_path):
            key_path = potential_path
            
    if key_path and os.path.exists(key_path):
        db = firestore.AsyncClient.from_service_account_json(key_path)
    else:
        db = firestore.AsyncClient(project=os.environ.get("GCP_PROJECT_ID"))
    
    # Initialize components
    window_store = RollingWindowStore(redis_client, config.sentinel_id, config.rolling_window_size)
    breaker = CircuitBreakerStateManager(db, config.sentinel_id)
    http_client = httpx.AsyncClient()
    
    interceptor = RequestInterceptor(config, window_store, breaker, db, http_client)
    agent = SentinelAgent(config, window_store, breaker, db)
    
    # Start agent background loop
    agent_task = asyncio.create_task(agent.start())
    logger.info(f"VisionAI Sentinel started — monitoring {config.model_name}")
    
    yield
    
    # Cleanup
    agent.stop()
    if agent_task:
        agent_task.cancel()
    await http_client.aclose()
    await redis_client.aclose()


app = FastAPI(
    title="VisionAI Sentinel",
    description="Agentic Circuit Breaker Proxy for ML Fairness",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Main proxy route — catches ALL requests and forwards them ───

@app.api_route("/{path:path}", methods=["POST"])
async def proxy_all_requests(request: Request, path: str):
    """
    Universal catch-all proxy route.
    All POST requests to this Sentinel are intercepted here.
    """
    return await interceptor.handle_request(request)


# ─── Health + status endpoints ───

@app.get("/_sentinel/health")
async def health():
    return {"status": "healthy", "sentinel_id": os.environ.get("SENTINEL_ID")}

@app.get("/_sentinel/status")
async def status():
    """Returns current breaker state and rolling window stats."""
    config = load_config_from_env()
    window = RollingWindowStore(redis_client, config.sentinel_id, config.rolling_window_size)
    breaker = CircuitBreakerStateManager(db, config.sentinel_id)
    
    window_size = await window.get_window_size()
    breaker_state = await breaker.get_state()
    
    di_metrics = {}
    for attr in config.protected_attributes:
        privileged_val = config.privileged_group_values.get(attr)
        if privileged_val:
            di_metrics[attr] = await window.compute_live_di(attr, privileged_val)
    
    recent_decisions = await window.get_recent_decisions(20)
    from dataclasses import asdict
    recent_decisions_list = [asdict(d) for d in recent_decisions]
    
    return {
        "sentinel_id": config.sentinel_id,
        "model_name": config.model_name,
        "breaker_state": breaker_state,
        "window_size": window_size,
        "live_di_metrics": di_metrics,
        "recent_decisions": recent_decisions_list,
    }

@app.post("/_sentinel/reset")
async def reset_breaker(reset_by: str = "api"):
    """Manually resets the circuit breaker."""
    config = load_config_from_env()
    breaker = CircuitBreakerStateManager(db, config.sentinel_id)
    await breaker.reset(reset_by=reset_by)
    return {"result": "BREAKER_RESET", "reset_by": reset_by}
