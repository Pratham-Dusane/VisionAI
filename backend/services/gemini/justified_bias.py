"""
Context-Aware Justified Bias Classifier — PRD §7.8
Uses Gemini to evaluate whether detected statistical bias is domain-appropriate
(e.g. breast cancer screening biased toward women) or genuinely harmful.

Fallback chain: GEMINI_BIAS_API_KEY → GEMINI_API_KEY → GROQ_API_KEY
"""

import asyncio
import os
import json
import re
import traceback
from typing import Dict, Any, List

_CLASSIFICATION_PROMPT = """You are a domain-aware fairness expert evaluating whether detected statistical bias is genuinely harmful or a justified statistical variance that is logically expected in the given domain.

Domain: {domain}

For EACH finding below, classify it as:
- "HARMFUL": The disparity is ethically problematic and reflects systemic discrimination or unfair treatment. It should be flagged and remediated.
- "JUSTIFIED": The disparity is biologically, logically, or domain-appropriately expected. For example, a breast cancer screening AI showing gender disparity is medically correct, not discriminatory.

Findings:
{findings_json}

For each finding, provide:
1. "classification": "HARMFUL" or "JUSTIFIED"
2. "rationale": A concise 1-2 sentence explanation of WHY this classification was made, referencing domain-specific knowledge
3. "confidence": "HIGH", "MEDIUM", or "LOW"

Be conservative — when in doubt, classify as HARMFUL. Only mark JUSTIFIED when there is clear, widely-accepted domain knowledge supporting the disparity.

Return ONLY a valid JSON object where keys are attribute names and values are objects with classification, rationale, and confidence. No markdown, no explanation outside JSON.
"""


def _build_findings_list(bias_findings: Dict[str, Any]) -> List[dict]:
    """Build compact summary of each bias finding."""
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
    return findings_list


def _parse_llm_response(response_text: str, bias_findings: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Parse and validate LLM JSON response into normalized result dict."""
    text = response_text.strip()

    # Strip markdown fences
    if text.startswith("```json"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1])
    elif text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1])

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            parsed = json.loads(json_match.group(0))
        else:
            raise ValueError("No valid JSON found in response")

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


async def _try_gemini(prompt: str, api_key: str) -> str:
    """Try Gemini API with timeout. Returns response text or raises."""
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")

    response = await asyncio.wait_for(
        model.generate_content_async(
            [prompt],
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
                max_output_tokens=1024,
                top_p=0.8,
            ),
            safety_settings={
                genai.types.HarmCategory.HARM_CATEGORY_HATE_SPEECH: genai.types.HarmBlockThreshold.BLOCK_NONE,
                genai.types.HarmCategory.HARM_CATEGORY_HARASSMENT: genai.types.HarmBlockThreshold.BLOCK_NONE,
                genai.types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: genai.types.HarmBlockThreshold.BLOCK_NONE,
                genai.types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: genai.types.HarmBlockThreshold.BLOCK_NONE,
            }
        ),
        timeout=15.0,
    )
    return response.text


async def _try_groq(prompt: str, api_key: str) -> str:
    """Try Groq API as last-resort fallback. Returns response text or raises."""
    from groq import AsyncGroq

    client = AsyncGroq(api_key=api_key, timeout=15.0)
    response = await asyncio.wait_for(
        client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_completion_tokens=1024,
        ),
        timeout=15.0,
    )
    return response.choices[0].message.content


async def classify_bias_findings(
    bias_findings: Dict[str, Any],
    domain: str,
) -> Dict[str, Dict[str, Any]]:
    """
    Evaluate each data bias finding for domain-justified variance.

    Fallback chain: GEMINI_BIAS_API_KEY → GEMINI_API_KEY → GROQ_API_KEY → heuristic

    Args:
        bias_findings: Dict of {attribute: bias_result} from data_bias_scanner
        domain: Application domain (e.g. "Healthcare", "Financial Lending")

    Returns:
        Dict of {attribute: {"classification": "HARMFUL"|"JUSTIFIED",
                             "rationale": str, "confidence": "HIGH"|"MEDIUM"|"LOW"}}
    """
    if not bias_findings:
        return {}

    findings_list = _build_findings_list(bias_findings)
    prompt = _CLASSIFICATION_PROMPT.format(
        domain=domain,
        findings_json=json.dumps(findings_list, indent=2),
    )

    # --- Attempt 1: Gemini with dedicated bias key ---
    bias_key = os.getenv("GEMINI_BIAS_API_KEY")
    if bias_key:
        try:
            print("[JUSTIFIED_BIAS] Trying GEMINI_BIAS_API_KEY...")
            text = await _try_gemini(prompt, bias_key)
            return _parse_llm_response(text, bias_findings)
        except Exception as e:
            print(f"[JUSTIFIED_BIAS] GEMINI_BIAS_API_KEY failed: {e}")

    # --- Attempt 2: Gemini with main key ---
    main_key = os.getenv("GEMINI_API_KEY")
    if main_key and main_key != bias_key:
        try:
            print("[JUSTIFIED_BIAS] Trying GEMINI_API_KEY...")
            text = await _try_gemini(prompt, main_key)
            return _parse_llm_response(text, bias_findings)
        except Exception as e:
            print(f"[JUSTIFIED_BIAS] GEMINI_API_KEY failed: {e}")

    # --- Attempt 3: Groq fallback ---
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        try:
            print("[JUSTIFIED_BIAS] Trying GROQ_API_KEY (fallback)...")
            text = await _try_groq(prompt, groq_key)
            return _parse_llm_response(text, bias_findings)
        except Exception as e:
            print(f"[JUSTIFIED_BIAS] GROQ_API_KEY failed: {e}")
            traceback.print_exc()

    # --- All failed ---
    print("[JUSTIFIED_BIAS] All providers exhausted. Using heuristic fallback.")
    return _fallback_classify(bias_findings, domain)


def _fallback_classify(
    bias_findings: Dict[str, Any],
    domain: str,
) -> Dict[str, Dict[str, Any]]:
    """Conservative heuristic fallback when all LLM providers unavailable."""
    result = {}
    for attr, data in bias_findings.items():
        metrics = data.get("metrics", {})
        di = metrics.get("disparate_impact", 1.0)
        severity = str(data.get("severity", "")).upper()

        # Simple heuristic: if DI is close to 1 or severity is low, less likely harmful
        if severity in ("LOW", "PASS") or (0.85 <= di <= 1.15):
            result[attr] = {
                "classification": "JUSTIFIED",
                "rationale": f"Low disparity (DI={di:.3f}). Heuristic classification — re-run with API access for AI-powered analysis.",
                "confidence": "LOW",
            }
        else:
            result[attr] = {
                "classification": "HARMFUL",
                "rationale": f"Significant disparity detected (DI={di:.3f}, severity={severity}). Heuristic classification — re-run with API access for AI-powered analysis.",
                "confidence": "LOW",
            }
    return result


def _try_gemini_sync(prompt: str, api_key: str) -> str:
    """Try Gemini API synchronously. Returns response text or raises."""
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")

    response = model.generate_content(
        [prompt],
        generation_config=genai.types.GenerationConfig(
            temperature=0.1,
            max_output_tokens=1024,
            top_p=0.8,
        ),
        safety_settings={
            genai.types.HarmCategory.HARM_CATEGORY_HATE_SPEECH: genai.types.HarmBlockThreshold.BLOCK_NONE,
            genai.types.HarmCategory.HARM_CATEGORY_HARASSMENT: genai.types.HarmBlockThreshold.BLOCK_NONE,
            genai.types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: genai.types.HarmBlockThreshold.BLOCK_NONE,
            genai.types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: genai.types.HarmBlockThreshold.BLOCK_NONE,
        }
    )
    return response.text


def _try_groq_sync(prompt: str, api_key: str) -> str:
    """Try Groq API synchronously using requests (thread-safe, no httpx)."""
    import requests as req
    import time

    print(f"[GROQ_DEBUG] Starting requests.post at {time.time():.2f}")
    try:
        resp = req.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_completion_tokens": 1024,
            },
            timeout=30,
        )
        print(f"[GROQ_DEBUG] Got response: status={resp.status_code} at {time.time():.2f}")
        resp.raise_for_status()
        result = resp.json()["choices"][0]["message"]["content"]
        print(f"[GROQ_DEBUG] Parsed content, len={len(result)}")
        return result
    except Exception as e:
        print(f"[GROQ_DEBUG] Exception in requests.post: {type(e).__name__}: {e}")
        raise


def classify_bias_findings_sync(
    bias_findings: Dict[str, Any],
    domain: str,
) -> Dict[str, Dict[str, Any]]:
    """Evaluate each data bias finding synchronously using sync LLM clients."""
    if not bias_findings:
        return {}

    findings_list = _build_findings_list(bias_findings)
    prompt = _CLASSIFICATION_PROMPT.format(
        domain=domain,
        findings_json=json.dumps(findings_list, indent=2),
    )

    # --- Attempt 1: Groq FIRST (fastest, Gemini quota often exhausted) ---
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        try:
            print("[JUSTIFIED_BIAS] Trying GROQ_API_KEY (primary, sync)...")
            text = _try_groq_sync(prompt, groq_key)
            print(f"[JUSTIFIED_BIAS] GROQ success, response len={len(text)}")
            return _parse_llm_response(text, bias_findings)
        except Exception as e:
            print(f"[JUSTIFIED_BIAS] GROQ_API_KEY failed: {e}")
            traceback.print_exc()

    # --- Attempt 2: Gemini with dedicated bias key ---
    bias_key = os.getenv("GEMINI_BIAS_API_KEY")
    if bias_key:
        try:
            print("[JUSTIFIED_BIAS] Trying GEMINI_BIAS_API_KEY (sync)...")
            text = _try_gemini_sync(prompt, bias_key)
            return _parse_llm_response(text, bias_findings)
        except Exception as e:
            print(f"[JUSTIFIED_BIAS] GEMINI_BIAS_API_KEY failed: {e}")

    # --- Attempt 3: Gemini with main key ---
    main_key = os.getenv("GEMINI_API_KEY")
    if main_key and main_key != bias_key:
        try:
            print("[JUSTIFIED_BIAS] Trying GEMINI_API_KEY (sync)...")
            text = _try_gemini_sync(prompt, main_key)
            return _parse_llm_response(text, bias_findings)
        except Exception as e:
            print(f"[JUSTIFIED_BIAS] GEMINI_API_KEY failed: {e}")

    # --- All failed ---
    print("[JUSTIFIED_BIAS] All providers exhausted. Using heuristic fallback.")
    return _fallback_classify(bias_findings, domain)
