"""
Context-Aware Justified Bias Classifier — PRD §7.8
Uses Gemini to evaluate whether detected statistical bias is domain-appropriate
(e.g. breast cancer screening biased toward women) or genuinely harmful.
"""

import os
import json
import re
from typing import Dict, Any, List


async def classify_bias_findings(
    bias_findings: Dict[str, Any],
    domain: str,
) -> Dict[str, Dict[str, Any]]:
    """
    Evaluate each data bias finding for domain-justified variance.

    Args:
        bias_findings: Dict of {attribute: bias_result} from data_bias_scanner
        domain: Application domain (e.g. "Healthcare", "Financial Lending")

    Returns:
        Dict of {attribute: {"classification": "HARMFUL"|"JUSTIFIED",
                             "rationale": str, "confidence": "HIGH"|"MEDIUM"|"LOW"}}
    """
    if not bias_findings:
        return {}

    try:
        import google.generativeai as genai

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return _fallback_classify(bias_findings, domain)

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")

        # Build a compact summary of each bias finding
        findings_list = []
        for attr, result in bias_findings.items():
            metrics = result.get("metrics", {})
            findings_list.append({
                "attribute": attr,
                "disparate_impact": round(metrics.get("disparate_impact", 1.0), 4),
                "statistical_parity_difference": round(
                    metrics.get("statistical_parity_difference", 0), 4
                ),
                "privileged_group": result.get("privileged_group", "unknown"),
                "severity": result.get("severity", "UNKNOWN"),
                "verdict": result.get("verdict", ""),
            })

        prompt = f"""You are a domain-aware fairness expert evaluating whether detected statistical bias is genuinely harmful or a justified statistical variance that is logically expected in the given domain.

Domain: {domain}

For EACH finding below, classify it as:
- "HARMFUL": The disparity is ethically problematic and reflects systemic discrimination or unfair treatment. It should be flagged and remediated.
- "JUSTIFIED": The disparity is biologically, logically, or domain-appropriately expected. For example, a breast cancer screening AI showing gender disparity is medically correct, not discriminatory.

Findings:
{json.dumps(findings_list, indent=2)}

For each finding, provide:
1. "classification": "HARMFUL" or "JUSTIFIED"
2. "rationale": A concise 1-2 sentence explanation of WHY this classification was made, referencing domain-specific knowledge
3. "confidence": "HIGH", "MEDIUM", or "LOW"

Be conservative — when in doubt, classify as HARMFUL. Only mark JUSTIFIED when there is clear, widely-accepted domain knowledge supporting the disparity.

Return ONLY a valid JSON object where keys are attribute names and values are objects with classification, rationale, and confidence. No markdown, no explanation outside JSON.
"""

        response = await model.generate_content_async(
            [prompt],
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
                max_output_tokens=1024,
                top_p=0.8,
            ),
        )

        response_text = response.text.strip()

        # Strip markdown fences
        if response_text.startswith("```json"):
            lines = response_text.split("\n")
            response_text = "\n".join(lines[1:-1])
        elif response_text.startswith("```"):
            lines = response_text.split("\n")
            response_text = "\n".join(lines[1:-1])

        try:
            parsed = json.loads(response_text)
        except json.JSONDecodeError:
            # Try to extract JSON object
            json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
            if json_match:
                try:
                    parsed = json.loads(json_match.group(0))
                except Exception:
                    return _fallback_classify(bias_findings, domain)
            else:
                return _fallback_classify(bias_findings, domain)

        # Validate and normalize
        result = {}
        for attr in bias_findings:
            entry = parsed.get(attr, {})
            classification = str(entry.get("classification", "HARMFUL")).upper()
            if classification not in ("HARMFUL", "JUSTIFIED"):
                classification = "HARMFUL"

            confidence = str(entry.get("confidence", "LOW")).upper()
            if confidence not in ("HIGH", "MEDIUM", "LOW"):
                confidence = "LOW"

            result[attr] = {
                "classification": classification,
                "rationale": str(entry.get("rationale", "No rationale provided.")),
                "confidence": confidence,
            }

        return result

    except Exception as e:
        print(f"[JUSTIFIED_BIAS] Classification error: {e}")
        return _fallback_classify(bias_findings, domain)


def _fallback_classify(
    bias_findings: Dict[str, Any],
    domain: str,
) -> Dict[str, Dict[str, Any]]:
    """Conservative fallback when Gemini is unavailable."""
    result = {}
    for attr in bias_findings:
        result[attr] = {
            "classification": "API_ERROR",
            "rationale": "Gemini AI classification unavailable. Re-run the audit with a valid API key to classify.",
            "confidence": "LOW",
        }
    return result


def classify_bias_findings_sync(
    bias_findings: Dict[str, Any],
    domain: str,
) -> Dict[str, Dict[str, Any]]:
    """Synchronous wrapper for classify_bias_findings."""
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(
            classify_bias_findings(bias_findings, domain)
        )
    finally:
        loop.close()
