"""
Follow-up Chatbot - PRD §8.5
Chat with the audit context using Gemini with triple fallback logic.
"""

import os
import json
from typing import Dict, Any, List


def format_audit_context(audit: Dict[str, Any], stakeholder_mode: str) -> str:
    """Extract and format the most important parts of the audit for the LLM context."""
    context = []

    # Overview
    domain = audit.get("domain", "General")
    context.append(f"Audit Domain: {domain}")

    # Severity
    sev = audit.get("severity") or {}
    if isinstance(sev, str):
        try:
            sev = json.loads(sev)
        except Exception:
            sev = {}
    context.append(f"Fairness Score: {sev.get('fairness_score', 'N/A')}/100")
    context.append(f"Overall Grade: {sev.get('letter_grade', 'N/A')}")

    # Top Data Bias
    data_bias = audit.get("dataBias") or {}
    if isinstance(data_bias, str):
        try:
            data_bias = json.loads(data_bias)
        except Exception:
            data_bias = {}
    if isinstance(data_bias, dict) and data_bias:
        context.append("\nData Bias Findings:")
        for attr, bias in data_bias.items():
            if not isinstance(bias, dict):
                continue
            metrics = bias.get("metrics") or {}
            di = metrics.get("disparate_impact", "N/A")
            context.append(f"- {attr}: DI={di}, Severity={bias.get('severity')}, Verdict={bias.get('verdict')}")

    # Justified Bias
    justified = audit.get("justifiedBias") or {}
    if isinstance(justified, str):
        try:
            justified = json.loads(justified)
        except Exception:
            justified = {}
    if isinstance(justified, dict) and justified:
        context.append("\nAI Justified Bias Assessment:")
        for attr, jb in justified.items():
            if not isinstance(jb, dict):
                continue
            context.append(f"- {attr}: {jb.get('classification')} (Confidence: {jb.get('confidence')}) - {jb.get('rationale')}")

    # Top Model Bias
    model_bias = audit.get("modelBias") or {}
    if isinstance(model_bias, str):
        try:
            model_bias = json.loads(model_bias)
        except Exception:
            model_bias = {}
    if isinstance(model_bias, dict) and model_bias:
        context.append("\nModel Bias (Flip Sensitivity):")
        for attr, mb in model_bias.items():
            if attr.startswith("_") or not isinstance(mb, dict):
                continue
            rate = (mb.get("max_flip_rate") or 0) * 100
            context.append(f"- {attr}: {rate:.1f}% max flip rate")

    # Legal
    reg_map = audit.get("regulationMap") or {}
    if isinstance(reg_map, str):
        try:
            reg_map = json.loads(reg_map)
        except Exception:
            reg_map = {}
    if isinstance(reg_map, dict) and reg_map:
        context.append("\nLegal/Regulatory Risks:")
        for reg_id, triggers in reg_map.items():
            if isinstance(triggers, list):
                active = sum(1 for t in triggers if isinstance(t, dict) and t.get("active"))
                if active > 0:
                    context.append(f"- {reg_id}: {active} active triggers")

    return "\n".join(context)


async def chat_with_audit_context(
    audit: Dict[str, Any],
    chat_history: List[Dict[str, str]],
    question: str,
    stakeholder_mode: str
) -> str:
    """
    Chat with the audit data using triple fallback.
    chat_history is a list of {"role": "user"|"assistant", "content": "..."}
    """
    context_str = format_audit_context(audit, stakeholder_mode)

    system_prompt = f"""You are an AI compliance auditor and fairness expert answering questions about a recent audit.
Tailor your language for a {stakeholder_mode} audience.

Audit Context:
{context_str}

FORMATTING RULES:
- Use markdown: **bold** for key terms, `backticks` for column/metric names
- Use bullet points (- ) for lists
- Use ## headers to separate sections when answering multi-part questions
- Keep answers under 150 words. Be direct.
- Always finish your sentences. Never cut off mid-thought."""

    # Build single prompt for Gemini
    full_prompt = f"{system_prompt}\n\nChat History:\n"
    for msg in (chat_history or []):
        role = msg.get("role", "user").capitalize()
        content = msg.get("content", "")
        if msg.get("role") == "assistant":
            role = "You"
        full_prompt += f"{role}: {content}\n"

    full_prompt += f"\nUser: {question}\nYou:"

    # --- Attempt 1: Gemini with Bias Key ---
    bias_key = os.getenv("GEMINI_BIAS_API_KEY")
    if bias_key:
        try:
            import google.generativeai as genai
            print("[CHATBOT] Trying GEMINI_BIAS_API_KEY...")
            genai.configure(api_key=bias_key)
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = await model.generate_content_async(
                [full_prompt],
                generation_config=genai.types.GenerationConfig(
                    temperature=0.3, max_output_tokens=1024, top_p=0.8,
                ),
            )
            return response.text
        except Exception as e:
            print(f"[CHATBOT] GEMINI_BIAS_API_KEY failed: {e}")

    # --- Attempt 2: Gemini with Main Key ---
    main_key = os.getenv("GEMINI_API_KEY")
    if main_key and main_key != bias_key:
        try:
            import google.generativeai as genai
            print("[CHATBOT] Trying GEMINI_API_KEY...")
            genai.configure(api_key=main_key)
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = await model.generate_content_async(
                [full_prompt],
                generation_config=genai.types.GenerationConfig(
                    temperature=0.3, max_output_tokens=1024, top_p=0.8,
                ),
            )
            return response.text
        except Exception as e:
            print(f"[CHATBOT] GEMINI_API_KEY failed: {e}")

    # --- Attempt 3: Groq fallback ---
    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        try:
            from groq import AsyncGroq
            print("[CHATBOT] Trying GROQ_API_KEY (fallback)...")
            client = AsyncGroq(api_key=groq_key)

            # Groq prefers structured messages
            groq_messages = [{"role": "system", "content": system_prompt}]
            for msg in (chat_history or [])[-5:]:
                role = "assistant" if msg.get("role") == "assistant" else "user"
                groq_messages.append({"role": role, "content": msg.get("content", "")})
            groq_messages.append({"role": "user", "content": question})

            response = await client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=groq_messages,
                temperature=0.3,
                max_completion_tokens=1024,
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"[CHATBOT] GROQ_API_KEY failed: {e}")

    # --- All failed ---
    print("[CHATBOT] All providers exhausted.")
    return "I'm unable to reach AI services right now. Please try again shortly."
