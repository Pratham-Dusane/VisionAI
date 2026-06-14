import redis.asyncio as aioredis
import json
import time
from dataclasses import dataclass, asdict

@dataclass
class Decision:
    request_id: str
    timestamp: float
    protected_attribute_values: dict[str, str]  # { "gender": "Female", "race": "Black" }
    raw_prediction: str                          # Raw model output value
    is_positive: bool                            # Whether this was a positive outcome
    was_intercepted: bool = False               # Whether sentinel intercepted this decision

class RollingWindowStore:
    
    def __init__(self, redis_client: aioredis.Redis, sentinel_id: str, window_size: int = 1000):
        self.redis = redis_client
        self.sentinel_id = sentinel_id
        self.window_size = window_size
        self.decisions_key = f"sentinel:{sentinel_id}:decisions"
        self.stats_key = f"sentinel:{sentinel_id}:stats"
    
    async def add_decision(self, decision: Decision) -> None:
        """
        Add a decision to the rolling window.
        Automatically evicts oldest decisions beyond window_size.
        """
        score = decision.timestamp  # Use timestamp as ZSET score for ordering
        value = json.dumps(asdict(decision))
        
        pipeline = self.redis.pipeline()
        
        # Add new decision
        pipeline.zadd(self.decisions_key, {value: score})
        
        # Evict oldest decisions beyond window size
        # ZREMRANGEBYRANK removes from lowest score (oldest) end
        pipeline.zremrangebyrank(self.decisions_key, 0, -(self.window_size + 1))
        
        # Set TTL on the key (24 hours — rolling window is ephemeral)
        pipeline.expire(self.decisions_key, 86400)
        
        await pipeline.execute()
    
    async def get_all_decisions(self) -> list[Decision]:
        """
        Returns all decisions in the current rolling window, oldest first.
        """
        raw_decisions = await self.redis.zrange(self.decisions_key, 0, -1)
        decisions = []
        for raw in raw_decisions:
            try:
                d = json.loads(raw)
                decisions.append(Decision(**d))
            except (json.JSONDecodeError, TypeError):
                continue
        return decisions
    
    async def get_window_size(self) -> int:
        return await self.redis.zcard(self.decisions_key)
    
    async def compute_live_di(
        self,
        protected_col: str,
        privileged_value: str,
    ) -> dict:
        """
        Computes Disparate Impact from the current rolling window for a specific attribute.
        
        DI = P(positive | unprivileged) / P(positive | privileged)
        
        Returns:
        - di_ratio: float
        - privileged_positive_rate: float
        - unprivileged_positive_rate: float
        - privileged_count: int
        - unprivileged_count: int
        - window_size: int
        """
        decisions = await self.get_all_decisions()
        
        if not decisions:
            return {"di_ratio": 1.0, "window_size": 0, "insufficient_data": True}
        
        privileged_decisions = [
            d for d in decisions
            if d.protected_attribute_values.get(protected_col) == privileged_value
        ]
        unprivileged_decisions = [
            d for d in decisions
            if d.protected_attribute_values.get(protected_col) != privileged_value
            and d.protected_attribute_values.get(protected_col) is not None
        ]
        
        if len(privileged_decisions) < 5 or len(unprivileged_decisions) < 5:
            return {
                "di_ratio": 1.0,
                "window_size": len(decisions),
                "insufficient_data": True,
                "reason": f"Need at least 5 decisions per group. Have {len(privileged_decisions)} privileged, {len(unprivileged_decisions)} unprivileged."
            }
        
        p_priv = sum(1 for d in privileged_decisions if d.is_positive) / len(privileged_decisions)
        p_unpriv = sum(1 for d in unprivileged_decisions if d.is_positive) / len(unprivileged_decisions)
        
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
    
    async def get_recent_decisions(self, limit: int = 20) -> list[Decision]:
        """Returns the most recent N decisions for the live feed UI."""
        raw_decisions = await self.redis.zrange(self.decisions_key, -limit, -1)
        decisions = []
        for raw in raw_decisions:
            try:
                decisions.append(Decision(**json.loads(raw)))
            except Exception:
                continue
        return list(reversed(decisions))  # Most recent first
