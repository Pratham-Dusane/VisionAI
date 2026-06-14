from enum import Enum
from datetime import datetime, UTC
from google.cloud import firestore
import asyncio
import logging

logger = logging.getLogger(__name__)

class BreakerState(str, Enum):
    CLOSED = "CLOSED"       # Normal — all decisions pass through
    OPEN = "OPEN"           # Tripped — decisions intercepted
    HALF_OPEN = "HALF_OPEN" # Cooldown — monitoring before reset

class CircuitBreakerStateManager:
    
    COLLECTION = "sentinel_breaker_states"
    
    def __init__(self, db: firestore.AsyncClient, sentinel_id: str):
        self.db = db
        self.sentinel_id = sentinel_id
        self._doc_ref = db.collection(self.COLLECTION).document(sentinel_id)
        self._state_cache: BreakerState = BreakerState.CLOSED
        self._cache_time: float = 0
        self._cache_ttl_seconds: float = 5.0  # Re-read from Firestore every 5 seconds
        self._cache_data: dict = {}
    
    async def get_state(self) -> dict:
        """
        Returns current breaker state with metadata.
        Uses local cache to avoid Firestore reads on every request (too slow).
        """
        now = asyncio.get_event_loop().time()
        if now - self._cache_time > self._cache_ttl_seconds or not self._cache_data:
            doc = await self._doc_ref.get()
            if doc.exists:
                data = doc.to_dict()
                self._state_cache = BreakerState(data.get("state", "CLOSED"))
                self._cache_data = data
                self._cache_time = now
                return data
            
            # Initial state
            initial_data = {
                "state": BreakerState.CLOSED,
                "tripped_at": None,
                "trip_reason": None,
                "decisions_intercepted": 0
            }
            self._state_cache = BreakerState.CLOSED
            self._cache_data = initial_data
            self._cache_time = now
            return initial_data
        
        return self._cache_data
    
    async def trip(
        self,
        protected_col: str,
        di_ratio: float,
        window_stats: dict,
        config_di_threshold: float,
    ) -> None:
        """
        Trips the circuit breaker. Called by the agent when DI drops below threshold.
        """
        trip_data = {
            "state": BreakerState.OPEN,
            "sentinel_id": self.sentinel_id,
            "tripped_at": datetime.now(UTC).isoformat(),
            "trip_reason": {
                "protected_attribute": protected_col,
                "live_di_ratio": di_ratio,
                "threshold": config_di_threshold,
                "window_stats": window_stats,
                "message": (
                    f"Live Disparate Impact for '{protected_col}' dropped to {di_ratio:.3f} "
                    f"(threshold: {config_di_threshold}). "
                    f"Unprivileged group positive rate: {window_stats.get('unprivileged_positive_rate', 'N/A'):.1%} "
                    f"vs privileged: {window_stats.get('privileged_positive_rate', 'N/A'):.1%}. "
                    f"Computed over {window_stats.get('window_size', 0)} recent decisions."
                ),
            },
            "decisions_intercepted": 0,
            "auto_reset_scheduled_at": None,
        }
        
        await self._doc_ref.set(trip_data, merge=True)
        self._state_cache = BreakerState.OPEN
        self._cache_data = trip_data
        self._cache_time = asyncio.get_event_loop().time()
        
        logger.warning(f"CIRCUIT BREAKER TRIPPED for sentinel {self.sentinel_id}: {trip_data['trip_reason']['message']}")
    
    async def increment_intercepted(self) -> None:
        """Increments the count of intercepted decisions atomically."""
        await self._doc_ref.update({
            "decisions_intercepted": firestore.Increment(1)
        })
        # Clear cache to force refresh on next get to see incremented count
        self._cache_time = 0
    
    async def reset(self, reset_by: str = "manual") -> None:
        """Resets the breaker to CLOSED state."""
        reset_data = {
            "state": BreakerState.CLOSED,
            "reset_at": datetime.now(UTC).isoformat(),
            "reset_by": reset_by,
            "trip_reason": None,
            "tripped_at": None,
        }
        await self._doc_ref.update(reset_data)
        self._state_cache = BreakerState.CLOSED
        # Update cache data with reset fields
        if self._cache_data:
            self._cache_data.update(reset_data)
        self._cache_time = asyncio.get_event_loop().time()
        logger.info(f"Circuit breaker reset for sentinel {self.sentinel_id} by {reset_by}")
    
    async def enter_half_open(self) -> None:
        """Transitions to HALF_OPEN for monitoring after cooldown."""
        half_open_data = {
            "state": BreakerState.HALF_OPEN,
            "half_open_at": datetime.now(UTC).isoformat(),
        }
        await self._doc_ref.update(half_open_data)
        self._state_cache = BreakerState.HALF_OPEN
        if self._cache_data:
            self._cache_data.update(half_open_data)
        self._cache_time = asyncio.get_event_loop().time()
        logger.info(f"Circuit breaker entered HALF_OPEN for sentinel {self.sentinel_id}")
