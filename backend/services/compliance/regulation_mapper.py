"""
Regulation Mapper - PRD §9.2
Maps metric risk indicators to applicable compliance frameworks.
Filters by domain (industry) and jurisdiction to avoid irrelevant alerts.

IMPORTANT: This module surfaces compliance RISK INDICATORS, not legal conclusions.
It does not constitute legal advice.
"""

# ─── Domain → Applicable Regulation Keys ───────────────────────────────────────
# Each domain only triggers regulations relevant to its industry.

DOMAIN_REGULATIONS = {
    "Financial Lending": {
        "disparate_impact", "proxy_risk", "feature_laundering",
        "equalized_odds", "intersectional",
    },
    "Hiring / Recruitment": {
        "disparate_impact", "proxy_risk", "feature_laundering",
        "equalized_odds", "intersectional",
    },
    "Healthcare / Medical Triage": {
        "disparate_impact", "proxy_risk", "feature_laundering",
        "equalized_odds",
    },
    "Insurance Underwriting": {
        "disparate_impact", "proxy_risk", "feature_laundering",
        "equalized_odds",
    },
    "Criminal Justice / Risk Assessment": {
        "disparate_impact", "proxy_risk", "feature_laundering",
        "equalized_odds", "intersectional",
    },
    "Education / Admissions": {
        "disparate_impact", "proxy_risk", "feature_laundering",
        "equalized_odds",
    },
}

# ─── Jurisdiction → Regulation Filter ──────────────────────────────────────────

JURISDICTION_TAGS = {
    "Global": None,  # show all
    "North America": {"US", "CA"},
    "Europe": {"EU", "UK"},
    "APAC": {"APAC", "IN", "AU"},
    "India": {"IN"},
}

# ─── Regulation Definitions (domain-scoped, jurisdiction-tagged) ───────────────
# Each regulation uses:
#   - compliance_risk (not "liability")
#   - recommended_mitigation (not "required_action")
#   - No specific penalty amounts (avoids UPL risk)
#   - framing as risk indicator, not violation declaration

REGULATIONS = {
    # ── Disparate Impact ──
    "disparate_impact": {
        "Financial Lending": [
            {
                "regulation": "US Equal Credit Opportunity Act (ECOA)",
                "clause": "15 U.S.C. 1691 / Regulation B (12 CFR 1002)",
                "description": "Disparate impact in credit decisions may indicate prohibited discrimination on the basis of race, color, religion, national origin, sex, marital status, or age.",
                "compliance_risk": "HIGH",
                "recommended_mitigation": "Conduct adverse impact analysis. Document business necessity for any selection criteria with disparate outcomes.",
                "jurisdiction": "US",
            },
            {
                "regulation": "Fair Credit Reporting Act (FCRA)",
                "clause": "15 U.S.C. 1681 -- Accuracy and Fairness",
                "description": "Consumer reports and scoring models must not produce systematically unfair outcomes across protected classes.",
                "compliance_risk": "MEDIUM",
                "recommended_mitigation": "Validate model inputs for accuracy and ensure adverse action notices are provided.",
                "jurisdiction": "US",
            },
            {
                "regulation": "EU AI Act (2024)",
                "clause": "Article 10 -- Data and Data Governance (High-Risk Systems)",
                "description": "High-risk AI systems in credit scoring must use training data that is relevant, representative, and free of biases that could lead to discrimination.",
                "compliance_risk": "HIGH",
                "recommended_mitigation": "Document data governance practices and implement bias testing as part of the conformity assessment.",
                "jurisdiction": "EU",
            },
        ],
        "Hiring / Recruitment": [
            {
                "regulation": "US EEOC Uniform Guidelines",
                "clause": "29 CFR 1607.4(D) -- Four-Fifths Rule",
                "description": "A selection rate for any protected group that is less than four-fifths (80%) of the rate for the group with the highest rate is generally regarded as evidence of adverse impact.",
                "compliance_risk": "HIGH",
                "recommended_mitigation": "Demonstrate business necessity for selection criteria, or adopt alternative procedures with less adverse impact.",
                "jurisdiction": "US",
            },
            {
                "regulation": "NYC Local Law 144 (2023)",
                "clause": "Automated Employment Decision Tools",
                "description": "Employers using AI in hiring must conduct annual bias audits and publish results. Disparate impact triggers mandatory disclosure.",
                "compliance_risk": "HIGH",
                "recommended_mitigation": "Commission independent bias audit and publish summary results on company website.",
                "jurisdiction": "US",
            },
            {
                "regulation": "EU AI Act (2024)",
                "clause": "Article 10 -- Data and Data Governance (High-Risk Systems)",
                "description": "AI systems used in employment, including recruitment and selection, are classified as high-risk and must meet strict data quality and bias mitigation requirements.",
                "compliance_risk": "HIGH",
                "recommended_mitigation": "Implement conformity assessment procedures and document bias mitigation measures.",
                "jurisdiction": "EU",
            },
            {
                "regulation": "UK Equality Act 2010",
                "clause": "Section 19 -- Indirect Discrimination",
                "description": "A provision, criterion, or practice that puts persons sharing a protected characteristic at a particular disadvantage may constitute indirect discrimination.",
                "compliance_risk": "MEDIUM",
                "recommended_mitigation": "Demonstrate the practice is a proportionate means of achieving a legitimate aim.",
                "jurisdiction": "UK",
            },
        ],
        "Healthcare / Medical Triage": [
            {
                "regulation": "US ACA Section 1557",
                "clause": "42 U.S.C. 18116 -- Nondiscrimination in Health Programs",
                "description": "Health programs receiving federal financial assistance must not discriminate on the basis of race, color, national origin, sex, age, or disability.",
                "compliance_risk": "HIGH",
                "recommended_mitigation": "Conduct disparate impact analysis on clinical decision algorithms and document mitigation steps.",
                "jurisdiction": "US",
            },
            {
                "regulation": "EU AI Act (2024)",
                "clause": "Article 10 -- Data and Data Governance",
                "description": "AI systems in healthcare are high-risk and must demonstrate freedom from biases that lead to discriminatory health outcomes.",
                "compliance_risk": "HIGH",
                "recommended_mitigation": "Implement clinical validation protocols that include demographic subgroup analysis.",
                "jurisdiction": "EU",
            },
        ],
        "Insurance Underwriting": [
            {
                "regulation": "US Unfair Trade Practices Act (Model Law)",
                "clause": "NAIC Model Regulation -- Unfair Discrimination",
                "description": "Insurance rates and practices must not unfairly discriminate between individuals of the same class and essentially the same hazard.",
                "compliance_risk": "MEDIUM",
                "recommended_mitigation": "Validate that rating factors are actuarially justified and do not serve as proxies for protected characteristics.",
                "jurisdiction": "US",
            },
            {
                "regulation": "EU AI Act (2024)",
                "clause": "Article 10 -- Data and Data Governance",
                "description": "AI-driven underwriting models must meet data quality standards to prevent discriminatory pricing outcomes.",
                "compliance_risk": "HIGH",
                "recommended_mitigation": "Document actuarial justification for all model features and conduct regular bias audits.",
                "jurisdiction": "EU",
            },
        ],
        "Criminal Justice / Risk Assessment": [
            {
                "regulation": "US Title VI of the Civil Rights Act",
                "clause": "42 U.S.C. 2000d -- Federally Assisted Programs",
                "description": "Programs receiving federal funding must not discriminate on the basis of race, color, or national origin. Risk assessment tools in criminal justice must demonstrate fairness.",
                "compliance_risk": "CRITICAL",
                "recommended_mitigation": "Conduct independent validation of risk scores across demographic groups. Consider alternative assessment methods.",
                "jurisdiction": "US",
            },
            {
                "regulation": "EU AI Act (2024)",
                "clause": "Article 6 -- Prohibited and High-Risk AI Systems",
                "description": "AI systems used in law enforcement and criminal justice are classified as high-risk and subject to the strictest requirements.",
                "compliance_risk": "CRITICAL",
                "recommended_mitigation": "Ensure full conformity assessment, human oversight, and ongoing monitoring.",
                "jurisdiction": "EU",
            },
        ],
        "Education / Admissions": [
            {
                "regulation": "US Title VI / Title IX",
                "clause": "Civil Rights Act / Education Amendments",
                "description": "Educational institutions receiving federal funding must not discriminate on the basis of race, national origin, or sex in admissions decisions.",
                "compliance_risk": "HIGH",
                "recommended_mitigation": "Document holistic review processes and ensure algorithmic components do not introduce disparate impact.",
                "jurisdiction": "US",
            },
        ],
        # Fallback for unrecognized domains
        "_default": [
            {
                "regulation": "EU AI Act (2024)",
                "clause": "Article 10 -- Data and Data Governance",
                "description": "High-risk AI systems must use data that is relevant, representative, and examined for possible biases.",
                "compliance_risk": "MEDIUM",
                "recommended_mitigation": "Implement bias testing and document data governance practices.",
                "jurisdiction": "EU",
            },
            {
                "regulation": "India Digital Personal Data Protection Act (DPDP), 2023",
                "clause": "Sections 8 and 10 -- Data Fiduciary Obligations and Reasonable Safeguards",
                "description": "Automated processing that produces materially unfair outcomes can indicate weak data quality, purpose limitation, and inadequate safeguards by data fiduciaries.",
                "compliance_risk": "MEDIUM",
                "recommended_mitigation": "Document data purpose, quality controls, and fairness monitoring in governance records.",
                "jurisdiction": "IN",
            },
        ],
    },

    # ── Feature Laundering ──
    "feature_laundering": {
        "_default": [
            {
                "regulation": "EU AI Act (2024)",
                "clause": "Article 13 -- Transparency and Provision of Information",
                "description": "High-risk AI systems must be designed to allow interpretation of outputs. Use of proxy features to obscure protected attribute influence undermines transparency requirements.",
                "compliance_risk": "CRITICAL",
                "recommended_mitigation": "Remove or decorrelate proxy features that reconstruct protected attributes. Document all feature engineering decisions.",
                "jurisdiction": "EU",
            },
        ],
        "Financial Lending": [
            {
                "regulation": "US Fair Housing Act",
                "clause": "42 U.S.C. 3604 -- Prohibited Practices",
                "description": "Use of proxy variables that reconstruct protected characteristics (race, familial status, national origin) in housing-related lending decisions may constitute prohibited discrimination.",
                "compliance_risk": "CRITICAL",
                "recommended_mitigation": "Conduct proxy analysis and remove features with high reconstruction accuracy for protected attributes. Consult legal counsel.",
                "jurisdiction": "US",
            },
        ],
        "Hiring / Recruitment": [
            {
                "regulation": "US EEOC Guidance on AI in Employment",
                "clause": "Technical Assistance -- Algorithmic Fairness",
                "description": "Selection procedures that use proxy variables correlated with protected characteristics may constitute disparate treatment even absent explicit use of protected data.",
                "compliance_risk": "HIGH",
                "recommended_mitigation": "Remove proxy features and validate that remaining features are job-related and consistent with business necessity.",
                "jurisdiction": "US",
            },
        ],
    },

    # ── Equalized Odds ──
    "equalized_odds": {
        "_default": [
            {
                "regulation": "GDPR",
                "clause": "Article 22 -- Automated Individual Decision-Making",
                "description": "Data subjects have the right not to be subject to decisions based solely on automated processing that produce significantly different error rates across demographic groups.",
                "compliance_risk": "MEDIUM",
                "recommended_mitigation": "Implement human review for automated decisions. Provide meaningful information about the logic involved and enable contestability.",
                "jurisdiction": "EU",
            },
            {
                "regulation": "India Digital Personal Data Protection Act (DPDP), 2023",
                "clause": "Sections 11 and 13 -- Right to Access and Grievance Redressal",
                "description": "Materially inconsistent automated outcomes across groups increase transparency and grievance handling risk for data fiduciaries.",
                "compliance_risk": "MEDIUM",
                "recommended_mitigation": "Enable contestability workflows, preserve decision logs, and provide clear explanations for adverse decisions.",
                "jurisdiction": "IN",
            },
        ],
    },

    # ── Intersectional ──
    "intersectional": {
        "_default": [
            {
                "regulation": "UK Equality Act 2010",
                "clause": "Section 14 -- Combined Discrimination (Dual Characteristics)",
                "description": "Direct discrimination may occur where treatment is because of a combination of two protected characteristics. Statistically significant intersectional disparities may indicate compounded discrimination.",
                "compliance_risk": "MEDIUM",
                "recommended_mitigation": "Investigate intersectional groups with statistically significant (n>=30) disparities. Ensure decision criteria do not compound disadvantage.",
                "jurisdiction": "UK",
            },
        ],
    },

    # ── Proxy Variables ──
    "proxy_risk": {
        "Financial Lending": [
            {
                "regulation": "US ECOA / Regulation B",
                "clause": "12 CFR 1002.6 -- Rules Concerning Evaluation of Applications",
                "description": "Creditors must not use information that serves as a proxy for prohibited bases (race, sex, age, etc.) in credit evaluations.",
                "compliance_risk": "HIGH",
                "recommended_mitigation": "Remove or decorrelate identified proxy variables. Document the business necessity of retained features.",
                "jurisdiction": "US",
            },
        ],
        "_default": [
            {
                "regulation": "EU AI Act (2024)",
                "clause": "Article 10 -- Data Governance",
                "description": "Training data for high-risk systems must be examined for biases. Proxy variables that reconstruct protected characteristics undermine data governance requirements.",
                "compliance_risk": "MEDIUM",
                "recommended_mitigation": "Conduct proxy analysis as part of the conformity assessment and remove high-risk proxies.",
                "jurisdiction": "EU",
            },
            {
                "regulation": "India Information Technology Act, 2000",
                "clause": "Section 43A -- Reasonable Security Practices",
                "description": "Use of opaque proxy variables without adequate safeguards may indicate weak controls over sensitive personal data processing and decision integrity.",
                "compliance_risk": "MEDIUM",
                "recommended_mitigation": "Strengthen data governance controls, record proxy-risk assessments, and enforce feature-level review before deployment.",
                "jurisdiction": "IN",
            },
        ],
    },
}

# Minimum sample size for intersectional legal triggers
MIN_INTERSECTIONAL_SAMPLE = 30


def map_regulations(
    data_bias: dict,
    feature_laundering: list[dict],
    intersectional: list[dict],
    proxies: list[dict],
    model_bias: dict | None = None,
    domain: str = "Other",
    jurisdiction: str = "Global",
) -> list[dict]:
    """
    Map detected risk indicators to applicable compliance frameworks.
    Filters by domain (industry) and jurisdiction.

    Returns list of risk indicators (NOT legal conclusions).
    """
    triggered = []
    jur_filter = JURISDICTION_TAGS.get(jurisdiction)

    def _get_regs(category: str) -> list[dict]:
        """Get regulations for category, falling through domain -> _default."""
        cat = REGULATIONS.get(category, {})
        regs = cat.get(domain, cat.get("_default", []))
        # Also include _default entries if domain-specific exists
        if domain in cat and "_default" in cat:
            # Merge domain-specific + defaults, dedup by regulation name
            seen = {r["regulation"] for r in regs}
            for r in cat["_default"]:
                if r["regulation"] not in seen:
                    regs = regs + [r]
        return regs

    def _filter_jurisdiction(regs: list[dict]) -> list[dict]:
        if jur_filter is None:
            return regs  # Global: show all
        return [r for r in regs if r.get("jurisdiction") in jur_filter]

    # ── Disparate Impact ──
    for attr, result in data_bias.items():
        di = result.get("metrics", {}).get("disparate_impact")
        if di is not None and di < 0.8:
            regs = _filter_jurisdiction(_get_regs("disparate_impact"))
            for reg in regs:
                triggered.append({
                    **reg,
                    "risk_category": "Disparate Impact",
                    "triggered_by": f"{attr}: DI = {di:.2f}",
                    "indicator_note": (
                        f"Disparate Impact ratio of {di:.2f} is below the 0.80 fairness threshold. "
                        f"This is a statistical risk indicator, not a definitive legal determination."
                    ),
                })

    # ── Feature Laundering ──
    for fl in feature_laundering:
        if fl.get("laundering_detected"):
            regs = _filter_jurisdiction(_get_regs("feature_laundering"))
            for reg in regs:
                triggered.append({
                    **reg,
                    "risk_category": "Feature Laundering",
                    "triggered_by": f"Proxy reconstruction: {fl['protected_attribute']}",
                    "indicator_note": (
                        f"Feature laundering detected for '{fl['protected_attribute']}'. "
                        f"Model features can reconstruct this protected attribute with "
                        f"accuracy significantly above baseline."
                    ),
                })

    # ── Intersectional (only for statistically significant groups) ──
    significant_critical = [
        i for i in intersectional
        if i.get("severity") == "CRITICAL"
        and i.get("sample_size", 0) >= MIN_INTERSECTIONAL_SAMPLE
    ]
    if significant_critical:
        regs = _filter_jurisdiction(_get_regs("intersectional"))
        for reg in regs:
            triggered.append({
                **reg,
                "risk_category": "Intersectional Disparity",
                "triggered_by": f"{len(significant_critical)} statistically significant intersectional disparities (n>={MIN_INTERSECTIONAL_SAMPLE})",
                "indicator_note": (
                    f"Intersectional analysis found {len(significant_critical)} group combinations "
                    f"with CRITICAL disparity and sufficient sample size for statistical significance."
                ),
            })

    # ── Proxy Variables ──
    high_proxies = [p for p in proxies if p.get("risk_level") == "HIGH"]
    if high_proxies:
        regs = _filter_jurisdiction(_get_regs("proxy_risk"))
        for reg in regs:
            triggered.append({
                **reg,
                "risk_category": "Proxy Variable Risk",
                "triggered_by": f"{len(high_proxies)} HIGH-risk proxy variables detected",
                "indicator_note": (
                    f"Proxy analysis identified {len(high_proxies)} features with high correlation "
                    f"to protected attributes. These may serve as indirect proxies for discrimination."
                ),
            })

    # ── Equalized Odds ──
    if model_bias:
        eq_odds = model_bias.get("_equalized_odds", {})
        for attr, groups in eq_odds.items():
            fprs = [g.get("fpr", 0) for g in groups.values()]
            if len(fprs) >= 2 and (max(fprs) - min(fprs)) > 0.1:
                regs = _filter_jurisdiction(_get_regs("equalized_odds"))
                for reg in regs:
                    triggered.append({
                        **reg,
                        "risk_category": "Equalized Odds Disparity",
                        "triggered_by": f"FPR gap of {(max(fprs) - min(fprs))*100:.1f}% across {attr} groups",
                        "indicator_note": (
                            f"The model's false positive rate varies significantly across {attr} groups, "
                            f"indicating unequal error distribution that may disadvantage specific demographics."
                        ),
                    })

    return triggered
