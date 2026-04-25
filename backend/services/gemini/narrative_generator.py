"""
Narrative Generator - PRD §8.2
Convert numeric bias findings into plain-English narratives per stakeholder type.
Uses Gemini API (not Vertex AI).
"""

import os
import json
from typing import Dict, Any


def format_findings_for_gemini(audit_results: dict) -> str:
    """Format audit results into a readable summary for Gemini."""
    sections = []
    
    # Data Bias findings
    if "dataBias" in audit_results and audit_results["dataBias"]:
        sections.append("=== DATA BIAS FINDINGS ===")
        for attr, bias in audit_results["dataBias"].items():
            metrics = bias.get("metrics", {})
            di = metrics.get("disparate_impact")
            spd = metrics.get("statistical_parity_difference")
            sections.append(
                f"\nAttribute: {attr}\n"
                f"Privileged Group: {bias.get('privileged_group')}\n"
                f"Disparate Impact: {di}\n"
                f"Statistical Parity Difference: {spd}\n"
                f"Verdict: {bias.get('verdict')} (Severity: {bias.get('severity')})\n"
                f"Explanation: {bias.get('explanation')}"
            )
    
    # Model Bias findings
    if "modelBias" in audit_results and audit_results["modelBias"]:
        sections.append("\n\n=== MODEL BIAS FINDINGS ===")
        for attr, model_bias in audit_results["modelBias"].items():
            if attr == "_equalized_odds":
                continue
            max_flip = model_bias.get("max_flip_rate", 0)
            mean_flip = model_bias.get("mean_flip_rate", 0)
            sections.append(
                f"\nAttribute: {attr}\n"
                f"Max Flip Rate: {max_flip:.2%}\n"
                f"Mean Flip Rate: {mean_flip:.2%}\n"
                f"Verdict: {model_bias.get('verdict')}\n"
                f"Top flip transitions: {list(model_bias.get('flip_rates', {}).items())[:3]}"
            )
    
    # Proxy warnings
    if "proxies" in audit_results and audit_results["proxies"]:
        sections.append("\n\n=== PROXY VARIABLE WARNINGS ===")
        for proxy in audit_results["proxies"][:5]:  # Top 5
            sections.append(
                f"\n{proxy.get('proxy_column')} -> {proxy.get('protected_column')}\n"
                f"Association: {proxy.get('association_score')} ({proxy.get('method')})\n"
                f"Risk: {proxy.get('risk_level')}\n"
                f"Explanation: {proxy.get('explanation')}"
            )
    
    # Intersectional findings
    if "intersectional" in audit_results and audit_results["intersectional"]:
        sections.append("\n\n=== INTERSECTIONAL BIAS ===")
        for finding in audit_results["intersectional"][:3]:  # Top 3
            sections.append(
                f"\nIntersection: {finding.get('intersection')}\n"
                f"Disparate Impact: {finding.get('disparate_impact')}\n"
                f"Severity: {finding.get('severity')}"
            )
    
    # Feature laundering
    if "featureLaundering" in audit_results and audit_results["featureLaundering"]:
        sections.append("\n\n=== FEATURE LAUNDERING RISKS ===")
        for launder in audit_results["featureLaundering"][:3]:
            sections.append(
                f"\nFeature: {launder.get('feature')}\n"
                f"Encodes: {launder.get('protected_attribute')}\n"
                f"Association: {launder.get('association_score')}\n"
                f"Risk: {launder.get('risk_level')}"
            )
    
    # Historical harm
    if "historicalHarm" in audit_results and audit_results["historicalHarm"]:
        sections.append("\n\n=== HISTORICAL HARM ESTIMATES ===")
        for harm in audit_results["historicalHarm"]:
            sections.append(
                f"\nAttribute: {harm.get('attribute')}, Group: {harm.get('group')}\n"
                f"Estimated people harmed: {harm.get('estimated_people_harmed')}\n"
                f"Explanation: {harm.get('explanation')}"
            )
    
    # Severity score
    if "severity" in audit_results:
        sections.append(f"\n\n=== OVERALL SEVERITY ===")
        sev = audit_results["severity"]
        sections.append(
            f"Overall Score: {sev.get('overall_score')}/100\n"
            f"Grade: {sev.get('grade')}\n"
            f"Risk Level: {sev.get('risk_level')}\n"
            f"Critical Issues: {sev.get('critical_count')}\n"
            f"High Issues: {sev.get('high_count')}"
        )
    
    return "\n".join(sections)


async def generate_audit_narrative(
    audit_results: dict,
    domain: str,
    stakeholder_type: str = "technical",
) -> str:
    """
    Generate a narrative summary of audit findings for a specific stakeholder type.
    
    Args:
        audit_results: Full audit results dictionary
        domain: Application domain (e.g., "Financial Lending")
        stakeholder_type: One of "technical", "executive", "legal"
    
    Returns:
        Markdown-formatted narrative string
    """
    try:
        import google.generativeai as genai
        
        # Configure Gemini API
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return _generate_fallback_narrative(audit_results, domain, stakeholder_type)
        
        genai.configure(api_key=api_key)
        
        # Use gemini-2.5-flash model
        model = genai.GenerativeModel("gemini-2.5-flash")
        
        SYSTEM_PROMPTS = {
            'technical': """You are a senior ML fairness engineer writing a concise internal audit report.
Use precise statistical language. Reference specific metrics (DI ratios, SHAP values, p-values).
Be specific about which features, groups, and magnitudes are involved.
Output structured markdown with sections for each finding.
Use headers (##), bullet points, and code blocks where appropriate.
Keep total output under 400 words. Be direct and data-driven.""",
            
            'executive': """You are a chief risk officer writing a 1-page summary for the board.
Translate all technical findings into business risk language.
Use concrete impact numbers (people affected, legal risk, reputational risk).
Output exactly 3 sections:
1. **Key Finding** - Most critical issue in one sentence
2. **Business Risk** - Financial and reputational impact
3. **Recommended Action** - Specific next steps

Give a letter grade (A-F) for overall fairness at the top.
Be concise and decisive. Maximum 200 words total.""",
            
            'legal': """You are a compliance lawyer writing for a regulatory audit file.
Map each finding to specific legal regulations.
Reference EU AI Act articles, US EEOC guidelines, and Indian IT Act provisions where relevant.
Structure as: Finding -> Applicable Regulation -> Liability Assessment -> Required Action.
Use formal legal language. Cite specific regulation numbers.
Keep total output under 400 words. Prioritize the most critical violations.""",
        }
        
        findings_summary = format_findings_for_gemini(audit_results)
        
        prompt = f"""
Domain: {domain}

Audit Findings:
{findings_summary}

Write an audit narrative for the above findings. Be specific, use the actual numbers.
Focus on actionable insights and concrete recommendations.
"""
        
        response = await model.generate_content_async(
            [SYSTEM_PROMPTS.get(stakeholder_type, SYSTEM_PROMPTS['technical']) + "\n\n" + prompt],
            generation_config=genai.types.GenerationConfig(
                temperature=0.2,
                max_output_tokens=1024,
                top_p=0.8,
                top_k=40,
            ),
        )
        
        return response.text
    
    except Exception as e:
        print(f"[GEMINI] Narrative generation error: {e}")
        import traceback
        traceback.print_exc()
        return _generate_fallback_narrative(audit_results, domain, stakeholder_type)


def _generate_fallback_narrative(
    audit_results: dict,
    domain: str,
    stakeholder_type: str,
) -> str:
    """Generate a basic narrative when Gemini is unavailable."""
    findings = format_findings_for_gemini(audit_results)
    
    if stakeholder_type == "executive":
        severity = audit_results.get("severity", {})
        grade = severity.get("grade", "N/A")
        score = severity.get("overall_score", 0)
        
        return f"""# Fairness Audit Summary

**Overall Grade: {grade}** (Score: {score}/100)

## Key Finding
This {domain} system shows bias patterns that require immediate attention.

## Business Risk
- Legal compliance risk due to disparate impact below 0.8 threshold
- Reputational risk if bias patterns become public
- Potential regulatory fines and litigation costs

## Recommended Action
1. Implement bias mitigation strategies immediately
2. Conduct stakeholder review of findings
3. Establish ongoing monitoring process

---
*Note: This is an automated summary. Gemini AI narrative generation is currently unavailable.*
"""
    
    elif stakeholder_type == "legal":
        return f"""# Legal Compliance Assessment

## Domain
{domain}

## Findings Summary
{findings}

## Regulatory Framework
- **US EEOC Guidelines**: 4/5ths rule (0.8 disparate impact threshold)
- **EU AI Act**: High-risk AI system requirements
- **Indian IT Act**: Data protection and algorithmic accountability

## Liability Assessment
Findings indicate potential non-compliance with anti-discrimination regulations.

## Required Actions
1. Document all findings in compliance file
2. Implement corrective measures
3. Establish audit trail for regulatory review

---
*Note: This is an automated summary. Gemini AI narrative generation is currently unavailable.*
"""
    
    else:  # technical
        return f"""# Technical Audit Report

## Domain
{domain}

## Detailed Findings
{findings}

## Technical Recommendations
1. Review feature engineering pipeline for proxy variables
2. Implement fairness constraints in model training
3. Establish continuous monitoring for bias drift
4. Consider resampling or reweighting strategies for imbalanced groups

---
*Note: This is an automated summary. Gemini AI narrative generation is currently unavailable.*
"""


def generate_audit_narrative_sync(
    audit_results: dict,
    domain: str,
    stakeholder_type: str = "technical",
) -> str:
    """Synchronous wrapper for generate_audit_narrative."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(
        generate_audit_narrative(audit_results, domain, stakeholder_type)
    )
