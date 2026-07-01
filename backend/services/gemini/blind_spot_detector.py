"""
Blind Spot Detector - PRD §8.3
Identify protected attributes the user has NOT checked yet using Gemini AI.
"""

import asyncio
import os
import json
from typing import List, Dict, Any


async def detect_blind_spots(
    column_names: List[str],
    domain: str,
    already_flagged: List[str],
    sample_values_per_col: Dict[str, List[Any]],
) -> List[Dict[str, str]]:
    """
    Use Gemini to identify potential blind spots in protected attribute selection.
    
    Args:
        column_names: All column names in the dataset
        domain: Application domain (e.g., "Financial Lending")
        already_flagged: Columns already marked as protected attributes
        sample_values_per_col: Sample values for each column to help Gemini understand the data
    
    Returns:
        List of blind spot warnings with column, encodes, reason, confidence
    """
    # Format sample values for readability
    samples_formatted = {}
    for col, values in sample_values_per_col.items():
        if col not in already_flagged:
            samples_formatted[col] = values[:5]

    prompt = f"""
You are an AI fairness expert auditing a machine learning dataset.

Domain: {domain}
Dataset columns: {column_names}
Sample values per column: {json.dumps(samples_formatted, indent=2)}
Already flagged as protected attributes: {already_flagged}

Analyze the dataset columns and identify any additional columns that:
1. Could serve as proxies for protected characteristics (race, gender, age, religion, national origin, disability)
2. Have historically been used as discrimination vectors in {domain} contexts
3. Represent sensitive personal characteristics not yet flagged

For each blind spot you identify, explain:
- Which column
- What protected characteristic it may encode
- Why this matters in a {domain} context
- Your confidence level (HIGH/MEDIUM/LOW)

Return ONLY a valid JSON array with no other text, markdown formatting, or trailing commas. 
CRITICAL: You MUST use double quotes for all keys and string values. Do not use single quotes.
[
  {{
    "column": "zip_code",
    "encodes": "race/socioeconomic status",
    "reason": "Zip codes in urban areas are heavily correlated with race due to historical redlining patterns",
    "confidence": "HIGH"
  }}
]

If no blind spots are found, return an empty array: []
"""

    def _parse_blind_spot_response(response_text):
        """Parse JSON array from LLM response."""
        text = response_text.strip()
        if text.startswith("```json"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1])
        elif text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1])

        try:
            clean_text = text.replace("'", '"')
            return json.loads(clean_text)
        except json.JSONDecodeError:
            import re
            json_match = re.search(r'\[.*\]', text, re.DOTALL)
            if json_match:
                clean_text = json_match.group(0).replace("'", '"')
                return json.loads(clean_text)
            return []

    # --- Attempt 1: Gemini with bias key ---
    bias_key = os.getenv("GEMINI_BIAS_API_KEY")
    if bias_key:
        try:
            import google.generativeai as genai
            print("[BLIND_SPOT] Trying GEMINI_BIAS_API_KEY...")
            genai.configure(api_key=bias_key)
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = await asyncio.wait_for(
                model.generate_content_async(
                    [prompt],
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.1, max_output_tokens=2048, top_p=0.8,
                    ),
                ),
                timeout=15.0,
            )
            blind_spots = _parse_blind_spot_response(response.text)
            return [bs for bs in blind_spots if isinstance(bs, dict) and bs.get('column') not in already_flagged]
        except Exception as e:
            print(f"[BLIND_SPOT] GEMINI_BIAS_API_KEY failed: {e}")

    # --- Attempt 2: Gemini with main key ---
    main_key = os.getenv("GEMINI_API_KEY")
    if main_key and main_key != bias_key:
        try:
            import google.generativeai as genai
            print("[BLIND_SPOT] Trying GEMINI_API_KEY...")
            genai.configure(api_key=main_key)
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = await asyncio.wait_for(
                model.generate_content_async(
                    [prompt],
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.1, max_output_tokens=2048, top_p=0.8,
                    ),
                ),
                timeout=15.0,
            )
            blind_spots = _parse_blind_spot_response(response.text)
            return [bs for bs in blind_spots if isinstance(bs, dict) and bs.get('column') not in already_flagged]
        except Exception as e:
            print(f"[BLIND_SPOT] GEMINI_API_KEY failed: {e}")

    # --- Attempt 3: Groq fallback ---
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        try:
            from groq import AsyncGroq
            print("[BLIND_SPOT] Trying GROQ_API_KEY (fallback)...")
            client = AsyncGroq(api_key=groq_key, timeout=15.0)
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                    max_completion_tokens=2048,
                ),
                timeout=15.0,
            )
            blind_spots = _parse_blind_spot_response(response.choices[0].message.content)
            return [bs for bs in blind_spots if isinstance(bs, dict) and bs.get('column') not in already_flagged]
        except Exception as e:
            print(f"[BLIND_SPOT] GROQ_API_KEY failed: {e}")

    # --- All failed ---
    print("[BLIND_SPOT] All providers exhausted. Using heuristic fallback.")
    return _generate_fallback_blind_spots(column_names, already_flagged, sample_values_per_col)


def _generate_fallback_blind_spots(
    column_names: List[str],
    already_flagged: List[str],
    sample_values_per_col: Dict[str, List[Any]],
) -> List[Dict[str, str]]:
    """
    Rule-based fallback when Gemini is unavailable.
    Uses keyword matching to identify potential blind spots.
    """
    blind_spots = []
    
    # Common proxy indicators
    PROXY_KEYWORDS = {
        'zip': ('race/socioeconomic status', 'Zip codes often correlate with demographic composition'),
        'postal': ('race/socioeconomic status', 'Postal codes often correlate with demographic composition'),
        'address': ('race/socioeconomic status', 'Addresses can reveal demographic information'),
        'location': ('race/socioeconomic status', 'Location data can serve as a proxy for protected attributes'),
        'neighborhood': ('race/socioeconomic status', 'Neighborhood names often correlate with demographics'),
        'school': ('race/socioeconomic status', 'School names can indicate demographic composition'),
        'university': ('race/socioeconomic status', 'University names may correlate with socioeconomic background'),
        'name': ('race/ethnicity/gender', 'Names can reveal ethnic origin and gender'),
        'surname': ('race/ethnicity', 'Surnames often indicate ethnic or national origin'),
        'firstname': ('gender/ethnicity', 'First names can reveal gender and ethnic origin'),
        'lastname': ('race/ethnicity', 'Last names often indicate ethnic or national origin'),
        'language': ('national origin/ethnicity', 'Language preference indicates national origin'),
        'accent': ('national origin/ethnicity', 'Accent indicators reveal national origin'),
        'country': ('national origin', 'Country of origin is a protected characteristic'),
        'nationality': ('national origin', 'Nationality is a protected characteristic'),
        'birthplace': ('national origin', 'Birthplace reveals national origin'),
        'credit': ('socioeconomic status', 'Credit scores correlate with protected characteristics'),
        'income': ('socioeconomic status', 'Income correlates with protected characteristics'),
        'salary': ('socioeconomic status', 'Salary correlates with protected characteristics'),
        'wealth': ('socioeconomic status', 'Wealth indicators correlate with protected characteristics'),
    }
    
    for col in column_names:
        if col in already_flagged:
            continue
        
        col_lower = col.lower().replace('_', '').replace(' ', '')
        
        for keyword, (encodes, reason) in PROXY_KEYWORDS.items():
            if keyword in col_lower:
                blind_spots.append({
                    'column': col,
                    'encodes': encodes,
                    'reason': reason,
                    'confidence': 'MEDIUM',
                })
                break
    
    return blind_spots


def _try_gemini_blind_spot_sync(prompt: str, api_key: str) -> str:
    """Try Gemini API synchronously for blind spot detection. Returns response text or raises."""
    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.0-flash")

    response = model.generate_content(
        [prompt],
        generation_config=genai.types.GenerationConfig(
            temperature=0.1, max_output_tokens=2048, top_p=0.8,
        ),
    )
    return response.text


def _try_groq_blind_spot_sync(prompt: str, api_key: str) -> str:
    """Try Groq API synchronously using requests (thread-safe, no httpx)."""
    import requests as req
    import time

    print(f"[GROQ_DEBUG_BS] Starting requests.post at {time.time():.2f}")
    try:
        resp = req.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_completion_tokens": 2048,
            },
            timeout=30,
        )
        print(f"[GROQ_DEBUG_BS] Got response: status={resp.status_code} at {time.time():.2f}")
        resp.raise_for_status()
        result = resp.json()["choices"][0]["message"]["content"]
        print(f"[GROQ_DEBUG_BS] Parsed content, len={len(result)}")
        return result
    except Exception as e:
        print(f"[GROQ_DEBUG_BS] Exception: {type(e).__name__}: {e}")
        raise


def detect_blind_spots_sync(
    column_names: List[str],
    domain: str,
    already_flagged: List[str],
    sample_values_per_col: Dict[str, List[Any]],
) -> List[Dict[str, str]]:
    """Identify potential blind spots synchronously using sync LLM clients."""
    # Format sample values for readability
    samples_formatted = {}
    for col, values in sample_values_per_col.items():
        if col not in already_flagged:
            samples_formatted[col] = values[:5]

    prompt = f"""
You are an AI fairness expert auditing a machine learning dataset.

Domain: {domain}
Dataset columns: {column_names}
Sample values per column: {json.dumps(samples_formatted, indent=2)}
Already flagged as protected attributes: {already_flagged}

Analyze the dataset columns and identify any additional columns that:
1. Could serve as proxies for protected characteristics (race, gender, age, religion, national origin, disability)
2. Have historically been used as discrimination vectors in {domain} contexts
3. Represent sensitive personal characteristics not yet flagged

For each blind spot you identify, explain:
- Which column
- What protected characteristic it may encode
- Why this matters in a {domain} context
- Your confidence level (HIGH/MEDIUM/LOW)

Return ONLY a valid JSON array with no other text, markdown formatting, or trailing commas. 
CRITICAL: You MUST use double quotes for all keys and string values. Do not use single quotes.
[
  {{
    "column": "zip_code",
    "encodes": "race/socioeconomic status",
    "reason": "Zip codes in urban areas are heavily correlated with race due to historical redlining patterns",
    "confidence": "HIGH"
  }}
]

If no blind spots are found, return an empty array: []
"""

    def _parse_blind_spot_response(response_text):
        """Parse JSON array from LLM response."""
        text = response_text.strip()
        if text.startswith("```json"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1])
        elif text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1])

        try:
            clean_text = text.replace("'", '"')
            return json.loads(clean_text)
        except json.JSONDecodeError:
            import re
            json_match = re.search(r'\[.*\]', text, re.DOTALL)
            if json_match:
                clean_text = json_match.group(0).replace("'", '"')
                return json.loads(clean_text)
            return []

    # --- Attempt 1: Groq FIRST (fastest, Gemini quota often exhausted) ---
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        try:
            print("[BLIND_SPOT] Trying GROQ_API_KEY (primary, sync)...")
            text = _try_groq_blind_spot_sync(prompt, groq_key)
            print(f"[BLIND_SPOT] GROQ success, response len={len(text)}")
            blind_spots = _parse_blind_spot_response(text)
            return [bs for bs in blind_spots if isinstance(bs, dict) and bs.get('column') not in already_flagged]
        except Exception as e:
            print(f"[BLIND_SPOT] GROQ_API_KEY failed: {e}")

    # --- Attempt 2: Gemini with bias key ---
    bias_key = os.getenv("GEMINI_BIAS_API_KEY")
    if bias_key:
        try:
            print("[BLIND_SPOT] Trying GEMINI_BIAS_API_KEY (sync)...")
            text = _try_gemini_blind_spot_sync(prompt, bias_key)
            blind_spots = _parse_blind_spot_response(text)
            return [bs for bs in blind_spots if isinstance(bs, dict) and bs.get('column') not in already_flagged]
        except Exception as e:
            print(f"[BLIND_SPOT] GEMINI_BIAS_API_KEY failed: {e}")

    # --- Attempt 3: Gemini with main key ---
    main_key = os.getenv("GEMINI_API_KEY")
    if main_key and main_key != bias_key:
        try:
            print("[BLIND_SPOT] Trying GEMINI_API_KEY (sync)...")
            text = _try_gemini_blind_spot_sync(prompt, main_key)
            blind_spots = _parse_blind_spot_response(text)
            return [bs for bs in blind_spots if isinstance(bs, dict) and bs.get('column') not in already_flagged]
        except Exception as e:
            print(f"[BLIND_SPOT] GEMINI_API_KEY failed: {e}")

    # --- All failed ---
    print("[BLIND_SPOT] All providers exhausted. Using heuristic fallback.")
    return _generate_fallback_blind_spots(column_names, already_flagged, sample_values_per_col)
