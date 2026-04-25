"""
Generative Shadow Testing - Zero-Shot Fairness
Generate synthetic "shadow rows" for missing demographic intersections using Gemini,
then pass through user's model to detect bias against unseen groups.
"""

import os
import json
import re
from typing import List, Dict, Any
import pandas as pd


async def generate_shadow_rows(
    column_names: List[str],
    column_types: Dict[str, str],
    sample_values: Dict[str, List[Any]],
    protected_cols: List[str],
    existing_intersections: List[str],
    domain: str,
    count: int = 10,
) -> List[Dict[str, Any]]:
    """
    Use Gemini to generate realistic synthetic rows for demographic
    combinations missing from the dataset.

    Args:
        column_names: All column names
        column_types: dtype per column
        sample_values: Sample values per column (5 examples each)
        protected_cols: Protected attribute columns
        existing_intersections: Intersection keys already present (e.g. "Male|White|25-34")
        domain: Application domain
        count: Number of shadow rows to generate

    Returns:
        List of synthetic row dicts
    """
    try:
        import google.generativeai as genai

        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return _generate_fallback_shadow_rows(
                column_names, column_types, sample_values,
                protected_cols, existing_intersections, count
            )

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")

        # Build schema description
        schema_desc = []
        for col in column_names:
            dtype = column_types.get(col, "unknown")
            samples = sample_values.get(col, [])[:5]
            schema_desc.append(f"  {col} ({dtype}): examples = {samples}")

        schema_text = "\n".join(schema_desc)

        prompt = f"""You are a fairness testing expert generating realistic synthetic data rows.

Domain: {domain}
Dataset schema:
{schema_text}

Protected attributes: {protected_cols}
Demographic intersections ALREADY in dataset: {existing_intersections[:20]}

Generate exactly {count} realistic, logically consistent data rows for MISSING demographic
combinations that are NOT in the existing intersections list above.

Focus on marginalized groups that may face discrimination in {domain}:
- Minority racial/ethnic groups
- Older/younger age extremes
- Gender minorities
- Disability indicators
- Low socioeconomic indicators

Each row must be a valid JSON object with ALL columns: {column_names}

Rules:
- Values must be realistic and internally consistent (e.g. age matches career stage)
- Numeric values must be within plausible ranges based on sample values
- Categorical values should use existing categories when possible
- Use double quotes for all keys and string values
- No trailing commas

Return ONLY a valid JSON array of row objects. No markdown, no explanation.
"""

        response = await model.generate_content_async(
            [prompt],
            generation_config=genai.types.GenerationConfig(
                temperature=0.7,
                max_output_tokens=2048,
                top_p=0.9,
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

        # Parse JSON
        try:
            rows = json.loads(response_text)
        except json.JSONDecodeError:
            clean = response_text.replace("'", '"')
            json_match = re.search(r'\[.*\]', clean, re.DOTALL)
            if json_match:
                try:
                    rows = json.loads(json_match.group(0))
                except Exception:
                    rows = []
            else:
                rows = []

        # Validate - only keep dicts with at least some expected columns
        valid_rows = []
        col_set = set(column_names)
        for row in rows:
            if isinstance(row, dict) and len(set(row.keys()) & col_set) >= len(column_names) * 0.5:
                valid_rows.append(row)

        return valid_rows[:count]

    except Exception as e:
        print(f"[SHADOW] Generation error: {e}")
        return _generate_fallback_shadow_rows(
            column_names, column_types, sample_values,
            protected_cols, existing_intersections, count
        )


def _generate_fallback_shadow_rows(
    column_names: List[str],
    column_types: Dict[str, str],
    sample_values: Dict[str, List[Any]],
    protected_cols: List[str],
    existing_intersections: List[str],
    count: int = 5,
) -> List[Dict[str, Any]]:
    """Rule-based fallback when Gemini is unavailable."""
    rows = []
    for i in range(min(count, 5)):
        row = {}
        for col in column_names:
            samples = sample_values.get(col, [])
            if samples:
                # Rotate through samples
                row[col] = samples[i % len(samples)]
            else:
                row[col] = None
        rows.append(row)
    return rows


def get_existing_intersections(
    df: pd.DataFrame,
    protected_cols: List[str],
) -> List[str]:
    """Get unique intersection keys present in dataset."""
    valid_cols = [c for c in protected_cols if c in df.columns]
    if not valid_cols:
        return []

    # Build intersection strings
    intersections = set()
    for _, row in df[valid_cols].drop_duplicates().iterrows():
        key = "|".join(str(row[c]) for c in valid_cols)
        intersections.add(key)

    return list(intersections)
