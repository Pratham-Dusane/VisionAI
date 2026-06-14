import asyncio
import logging
import os
import json
from datetime import datetime, UTC
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain.tools import tool
from langchain.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage
import httpx

from rolling_window import RollingWindowStore
from circuit_breaker import CircuitBreakerStateManager, BreakerState
from config import SentinelConfig

logger = logging.getLogger(__name__)

class SentinelAgent:
    
    def __init__(
        self,
        config: SentinelConfig,
        window_store: RollingWindowStore,
        breaker: CircuitBreakerStateManager,
        db,
    ):
        self.config = config
        self.window = window_store
        self.breaker = breaker
        self.db = db
        self._running = False
        
        # Initialize Gemini via LangChain
        api_key = config.gemini_api_key or os.environ.get("GEMINI_API_KEY")
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-pro",
            temperature=0.1,
            google_api_key=api_key,
        )
        
        self._build_agent()
    
    def _build_agent(self):
        """
        Builds the LangChain tool-calling agent.
        The agent has access to tools that let it read fairness metrics,
        trip the breaker, reset the breaker, and generate explanations.
        """
        
        window = self.window
        breaker = self.breaker
        config = self.config
        db = self.db
        
        @tool
        async def get_live_fairness_metrics() -> str:
            """
            Reads the current rolling window and computes live Disparate Impact
            for all configured protected attributes.
            Returns a JSON string with DI metrics per attribute.
            """
            metrics = {}
            for attr in config.protected_attributes:
                privileged_val = config.privileged_group_values.get(attr)
                if not privileged_val:
                    continue
                di_result = await window.compute_live_di(attr, privileged_val)
                metrics[attr] = di_result
            return json.dumps(metrics, indent=2)
        
        @tool
        async def get_window_summary() -> str:
            """
            Returns a summary of the current rolling window:
            total decisions, breakdown by protected attribute values,
            overall positive rate, and timestamp of oldest/newest decision.
            """
            decisions = await window.get_all_decisions()
            if not decisions:
                return json.dumps({"total": 0, "message": "No decisions in window yet"})
            
            summary = {
                "total_decisions": len(decisions),
                "overall_positive_rate": round(sum(1 for d in decisions if d.is_positive) / len(decisions), 4),
                "oldest_decision_seconds_ago": round(datetime.now(UTC).timestamp() - decisions[0].timestamp, 1),
                "newest_decision_seconds_ago": round(datetime.now(UTC).timestamp() - decisions[-1].timestamp, 1),
                "attribute_breakdown": {},
            }
            
            for attr in config.protected_attributes:
                group_counts = {}
                for d in decisions:
                    val = d.protected_attribute_values.get(attr, "unknown")
                    if val not in group_counts:
                        group_counts[val] = {"total": 0, "positive": 0}
                    group_counts[val]["total"] += 1
                    if d.is_positive:
                        group_counts[val]["positive"] += 1
                
                summary["attribute_breakdown"][attr] = {
                    g: {
                        "total": v["total"],
                        "positive_rate": round(v["positive"] / v["total"], 4) if v["total"] > 0 else 0,
                    }
                    for g, v in group_counts.items()
                }
            
            return json.dumps(summary, indent=2)
        
        @tool
        async def trip_circuit_breaker(protected_col: str, di_ratio: float, explanation: str) -> str:
            """
            Trips the circuit breaker for the specified protected attribute.
            Call this when DI ratio is below the configured threshold and there
            are sufficient decisions in the window to be statistically meaningful.
            
            Args:
                protected_col: The protected attribute triggering the trip
                di_ratio: The current live DI ratio
                explanation: Human-readable explanation of why the breaker is being tripped
            """
            state = await breaker.get_state()
            if state.get("state") == BreakerState.OPEN:
                return json.dumps({"result": "Breaker already OPEN — no action needed"})
            
            window_stats = await window.compute_live_di(
                protected_col,
                config.privileged_group_values.get(protected_col, "")
            )
            
            await breaker.trip(protected_col, di_ratio, window_stats, config.di_threshold)
            
            # Send alert
            await send_alert(config, protected_col, di_ratio, explanation)
            
            return json.dumps({
                "result": "CIRCUIT_BREAKER_TRIPPED",
                "protected_col": protected_col,
                "di_ratio": di_ratio,
                "explanation": explanation,
            })
        
        @tool
        async def get_breaker_state() -> str:
            """Returns the current circuit breaker state and metadata."""
            state = await breaker.get_state()
            return json.dumps(state, default=str)
        
        @tool
        async def log_agent_observation(observation: str) -> str:
            """
            Logs an agent observation to Firestore for the dashboard to display.
            Call this to record important findings even when no action is taken.
            """
            await db.collection("sentinel_agent_logs").add({
                "sentinel_id": config.sentinel_id,
                "timestamp": datetime.now(UTC).isoformat(),
                "observation": observation,
            })
            return json.dumps({"logged": True})
        
        self.tools = [
            get_live_fairness_metrics,
            get_window_summary,
            trip_circuit_breaker,
            get_breaker_state,
            log_agent_observation,
        ]
        
        system_prompt = f"""
You are VisionAI Sentinel, an autonomous fairness monitoring agent for the model "{self.config.model_name}".

Your job: monitor live model decisions for bias and trip the circuit breaker when harmful discrimination is detected.

Configuration:
- Protected attributes to monitor: {self.config.protected_attributes}
- Privileged groups: {self.config.privileged_group_values}
- DI threshold (trip below this): {self.config.di_threshold}
- Minimum decisions before tripping: {self.config.min_decisions_before_trip}
- Rolling window size: {self.config.rolling_window_size}

On each evaluation cycle, you MUST:
1. Call get_live_fairness_metrics to read current DI for all protected attributes
2. Call get_window_summary to understand the decision distribution
3. Evaluate whether the circuit breaker should be tripped, maintained, or left alone
4. If DI < {self.config.di_threshold} AND window_size >= {self.config.min_decisions_before_trip}: call trip_circuit_breaker
5. If DI is borderline (within 0.05 of threshold): call log_agent_observation with a warning
6. Always call log_agent_observation with a brief summary of what you observed

Circuit breaker trip criteria (ALL must be true):
- live DI ratio < {self.config.di_threshold}
- window_size >= {self.config.min_decisions_before_trip}
- insufficient_data == false
- breaker is not already OPEN

Do NOT trip the breaker if insufficient_data is true — wait for more decisions.
Be precise and decisive. Bias at this scale affects real people's livelihoods.
"""
        
        prompt = ChatPromptTemplate.from_messages([
            SystemMessage(content=system_prompt),
            ("human", "Run your fairness evaluation cycle now. Use your tools, evaluate the situation, and take action if needed."),
            ("placeholder", "{agent_scratchpad}"),
        ])
        
        agent = create_tool_calling_agent(self.llm, self.tools, prompt)
        self.agent_executor = AgentExecutor(
            agent=agent,
            tools=self.tools,
            verbose=True,
            max_iterations=8,
            handle_parsing_errors=True,
        )
    
    async def start(self):
        """Starts the background evaluation loop."""
        self._running = True
        logger.info(f"Sentinel agent started for {self.config.sentinel_id}")
        
        while self._running:
            try:
                await asyncio.sleep(self.config.evaluation_interval_seconds)
                await self._run_evaluation_cycle()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Sentinel agent evaluation error: {e}", exc_info=True)
    
    async def _run_evaluation_cycle(self):
        """Single evaluation cycle — invokes the LangChain agent."""
        window_size = await self.window.get_window_size()
        logger.info(f"Running evaluation cycle. Window size: {window_size}")
        
        try:
            result = await self.agent_executor.ainvoke({"input": "evaluate"})
            logger.info(f"Agent cycle complete: {result.get('output', '')[:200]}")
        except Exception as e:
            logger.error(f"Agent execution failed: {e}", exc_info=True)
    
    def stop(self):
        self._running = False


async def send_alert(config: SentinelConfig, protected_col: str, di_ratio: float, explanation: str):
    """
    Sends breaker trip alert to configured webhook (Slack, Teams, etc.)
    and/or email via the VisionAI notification system.
    """
    if config.alert_webhook_url:
        payload = {
            "text": (
                f"🚨 *VisionAI Sentinel Alert* — Model: `{config.model_name}`\n"
                f"Circuit breaker *TRIPPED* for attribute `{protected_col}`\n"
                f"Live DI Ratio: *{di_ratio:.3f}* (threshold: {config.di_threshold})\n"
                f"{explanation}\n"
                f"Status: All rejections for flagged group now flagged as MANUAL_REVIEW_REQUIRED"
            )
        }
        async with httpx.AsyncClient(timeout=5.0) as client:
            try:
                await client.post(config.alert_webhook_url, json=payload)
            except Exception as e:
                logger.warning(f"Alert webhook failed: {e}")
