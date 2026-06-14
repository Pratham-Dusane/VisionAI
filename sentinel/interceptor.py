import httpx
import asyncio
import time
import uuid
import logging
from datetime import datetime, UTC
from fastapi import Request, Response
from fastapi.responses import JSONResponse

from rolling_window import RollingWindowStore, Decision
from circuit_breaker import CircuitBreakerStateManager, BreakerState
from review_queue import enqueue_for_review
from config import SentinelConfig

logger = logging.getLogger(__name__)

class RequestInterceptor:
    
    def __init__(
        self,
        config: SentinelConfig,
        window_store: RollingWindowStore,
        breaker: CircuitBreakerStateManager,
        db,
        http_client: httpx.AsyncClient,
    ):
        self.config = config
        self.window = window_store
        self.breaker = breaker
        self.db = db
        self.http = http_client
    
    async def handle_request(self, request: Request) -> Response:
        """
        Main entry point. Called for every incoming request.
        
        Flow:
        1. Read and parse incoming request body
        2. Extract protected attribute values from request
        3. Forward request to target model endpoint
        4. Parse model response
        5. Check circuit breaker state
        6. If CLOSED: return model response directly, log to rolling window
        7. If OPEN + negative decision for flagged group: intercept, enqueue, return MANUAL_REVIEW
        8. If OPEN + positive decision: pass through (we don't intercept approvals)
        """
        request_id = str(uuid.uuid4())
        start_time = time.monotonic()
        
        # Step 1: Read body
        try:
            body = await request.json()
        except Exception:
            return JSONResponse(status_code=400, content={"error": "Invalid JSON body"})
        
        # Step 2: Extract protected attributes from request
        protected_values = {}
        for attr in self.config.protected_attributes:
            val = self._extract_nested(body, attr)
            if val is not None:
                protected_values[attr] = str(val)
        
        # Step 3: Forward to target model
        model_response_data, model_status_code = await self._forward_to_model(body)
        
        if model_response_data is None:
            # Target model is unreachable — pass error through
            return JSONResponse(
                status_code=502,
                content={"error": "Target model endpoint unreachable", "sentinel_id": self.config.sentinel_id}
            )
        
        # Step 4: Parse prediction from model response
        raw_prediction = self._extract_nested(model_response_data, self.config.prediction_field)
        is_positive = str(raw_prediction) == str(self.config.positive_prediction_value)
        
        # Step 5: Check breaker state (uses local cache — no Firestore read every request)
        breaker_state_data = await self.breaker.get_state()
        breaker_state = BreakerState(breaker_state_data.get("state", "CLOSED"))
        
        # Step 6: Log decision to rolling window (always, regardless of breaker state)
        decision = Decision(
            request_id=request_id,
            timestamp=time.time(),
            protected_attribute_values=protected_values,
            raw_prediction=str(raw_prediction) if raw_prediction is not None else "",
            is_positive=is_positive,
            was_intercepted=False,
        )
        
        # Log to window async without blocking response
        asyncio.create_task(self.window.add_decision(decision))
        
        # Step 7: Apply circuit breaker logic
        if breaker_state == BreakerState.OPEN and not is_positive:
            # Check if this request's demographics match the flagged group
            trip_reason = breaker_state_data.get("trip_reason", {})
            flagged_attr = trip_reason.get("protected_attribute")
            
            should_intercept = self._should_intercept_request(
                protected_values, flagged_attr, self.config
            )
            
            if should_intercept or self.config.breaker_mode == "block_all":
                # INTERCEPT THIS DECISION
                decision.was_intercepted = True
                asyncio.create_task(self.breaker.increment_intercepted())
                
                # Enqueue for manual review
                review_id = await enqueue_for_review(
                    db=self.db,
                    sentinel_id=self.config.sentinel_id,
                    org_id=self.config.org_id,
                    model_name=self.config.model_name,
                    original_request=body,
                    model_raw_response=model_response_data,
                    protected_attribute_values=protected_values,
                    trip_reason=trip_reason,
                )
                
                elapsed_ms = round((time.monotonic() - start_time) * 1000, 2)
                logger.info(f"INTERCEPTED decision {request_id} → review_id={review_id} ({elapsed_ms}ms)")
                
                return JSONResponse(
                    status_code=200,  # Return 200 so client app handles this gracefully
                    content={
                        "status": "MANUAL_REVIEW_REQUIRED",
                        "review_id": review_id,
                        "message": (
                            "This application has been flagged for manual review by VisionAI Sentinel. "
                            "An automated decision was not issued. A human reviewer will assess this "
                            "application and contact you within the review SLA window."
                        ),
                        "sentinel_id": self.config.sentinel_id,
                        "intercepted_at": datetime.now(UTC).isoformat(),
                        # Do NOT include the model's actual prediction in this response
                    }
                )
        
        # Step 8: Pass through model response unchanged
        elapsed_ms = round((time.monotonic() - start_time) * 1000, 2)
        logger.debug(f"Passed through decision {request_id} ({elapsed_ms}ms)")
        
        return JSONResponse(
            status_code=model_status_code,
            content={
                **model_response_data,
                "_sentinel": {
                    "request_id": request_id,
                    "breaker_state": breaker_state,
                    "latency_ms": elapsed_ms,
                }
            }
        )
    
    async def _forward_to_model(self, body: dict) -> tuple[dict | None, int]:
        """
        Forwards the request to the target model endpoint.
        Returns (response_dict, status_code) or (None, 0) on failure.
        """
        headers = {"Content-Type": "application/json"}
        if self.config.target_auth_header:
            headers["Authorization"] = self.config.target_auth_header
        
        try:
            response = await self.http.post(
                self.config.target_endpoint,
                json=body,
                headers=headers,
                timeout=self.config.target_timeout_seconds,
            )
            return response.json(), response.status_code
        except httpx.TimeoutException:
            logger.error(f"Target model timeout after {self.config.target_timeout_seconds}s")
            return None, 0
        except Exception as e:
            logger.error(f"Target model request failed: {e}")
            return None, 0
    
    def _extract_nested(self, data: dict, key: str) -> any:
        """
        Extracts a value from a nested dict using dot notation.
        e.g. "applicant.gender" extracts data["applicant"]["gender"]
        """
        parts = key.split(".")
        current = data
        for part in parts:
            if not isinstance(current, dict):
                return None
            current = current.get(part)
        return current
    
    def _should_intercept_request(
        self,
        protected_values: dict,
        flagged_attr: str | None,
        config: SentinelConfig,
    ) -> bool:
        """
        Determines if this specific request should be intercepted.
        Only intercept requests from the unprivileged group for the flagged attribute.
        """
        if not flagged_attr or flagged_attr not in protected_values:
            return True  # No attribute info — intercept to be safe
        
        request_val = protected_values.get(flagged_attr)
        privileged_val = config.privileged_group_values.get(flagged_attr)
        
        # Intercept only if this request is from the unprivileged group
        return request_val != privileged_val
