"""
Blind Spot Detector - PRD §8.3
Identify protected attributes the user has NOT checked yet using Gemini AI.
"""

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
    try:
        import google.generativeai as genai
        
        # Configure Gemini API
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return _generate_fallback_blind_spots(column_names, already_flagged, sample_values_per_col)
        
        genai.configure(api_key=api_key)
        
        # Use gemini-2.5-flash model
        model = genai.GenerativeModel("gemini-2.5-flash")
        
        # Format sample values for readability
        samples_formatted = {}
        for col, values in sample_values_per_col.items():
            if col not in already_flagged:
                samples_formatted[col] = values[:5]  # First 5 samples
        
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
        
        response = await model.generate_content_async(
            [prompt],
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
                max_output_tokens=2048,  # Increased from 1024
                top_p=0.8,
            ),
        )
        
        # Parse JSON response
        response_text = response.text.strip()
        
        # Remove markdown code blocks if present
        if response_text.startswith("```json"):
            lines = response_text.split("\n")
            response_text = "\n".join(lines[1:-1])  # Remove first and last line
        elif response_text.startswith("```"):
            lines = response_text.split("\n")
            response_text = "\n".join(lines[1:-1])  # Remove first and last line
        
        # Try to parse JSON
        try:
            # Sometime gemini returns malformed json, or trailing commas. Try simple cleanup
            clean_text = response_text.replace("'", '"')
            blind_spots = json.loads(clean_text)
        except json.JSONDecodeError:
            # If parsing fails, try to extract JSON array from partial response
            import re
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if json_match:
                clean_text = json_match.group(0).replace("'", '"')
                try:
                    blind_spots = json.loads(clean_text)
                except:
                    blind_spots = []
            else:
                blind_spots = []
        
        # Filter out already flagged columns
        filtered_spots = [
            bs for bs in blind_spots
            if isinstance(bs, dict) and bs.get('column') not in already_flagged
        ]
        
        return filtered_spots
    
    except json.JSONDecodeError as e:
        print(f"[GEMINI] Blind spot JSON parse error: {e}")
        return []
    
    except Exception as e:
        print(f"[GEMINI] Blind spot detection error: {e}")
        import traceback
        traceback.print_exc()
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


def detect_blind_spots_sync(
    column_names: List[str],
    domain: str,
    already_flagged: List[str],
    sample_values_per_col: Dict[str, List[Any]],
) -> List[Dict[str, str]]:
    """Synchronous wrapper for detect_blind_spots."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(
        detect_blind_spots(column_names, domain, already_flagged, sample_values_per_col)
    )
