"""
VisionAI — AI Fairness Auditing Toolkit.

Detect, measure, and fix bias in ML models and datasets.

Quick Start::

    from visionai import FairnessAudit

    audit = FairnessAudit(
        data="dataset.csv",
        label_col="approved",
        positive_label="1",
        protected_cols=["gender", "race"],
    )
    results = audit.run()
    print(results.fairness_score, results.letter_grade)
"""

from visionai._version import __version__

# ── Orchestrator ──
from visionai.audit import FairnessAudit, AuditResult

# ── Preprocessing ──
from visionai.preprocessing.schema_parser import parse_schema
from visionai.preprocessing.proxy_detector import detect_proxies
from visionai.preprocessing.data_profiler import profile_data
from visionai.preprocessing.auto_binner import auto_bin_protected_columns

# ── Analysis ──
from visionai.analysis.data_bias_scanner import scan_data_bias
from visionai.analysis.model_bias_evaluator import evaluate_model_bias
from visionai.analysis.intersectional_audit import intersectional_audit
from visionai.analysis.feature_laundering import detect_feature_laundering
from visionai.analysis.severity_scorer import compute_severity_score
from visionai.analysis.historical_harm import calculate_historical_harm
from visionai.analysis.flip_sensitivity import compute_flip_sensitivity
from visionai.analysis.shadow_testing import generate_shadow_profiles, compute_shadow_summary

# ── Explainability (optional — requires shap) ──
try:
    from visionai.analysis.explainability import compute_shap_by_group
except ImportError:
    pass

# ── Compliance ──
from visionai.compliance.regulation_mapper import map_regulations

# ── Advanced (Phase 7) ──
from visionai.advanced.adversarial_simulator import find_minimum_flip
from visionai.advanced.red_team import red_team_search
from visionai.advanced.whistleblower import anonymize_report
from visionai.advanced.model_comparison import compare_audits
from visionai.advanced.bias_origin_tracer import trace_bias_origin

__all__ = [
    "__version__",
    "FairnessAudit",
    "AuditResult",
    # Preprocessing
    "parse_schema",
    "detect_proxies",
    "profile_data",
    "auto_bin_protected_columns",
    # Analysis
    "scan_data_bias",
    "evaluate_model_bias",
    "intersectional_audit",
    "detect_feature_laundering",
    "compute_severity_score",
    "calculate_historical_harm",
    "compute_flip_sensitivity",
    "compute_shap_by_group",
    "generate_shadow_profiles",
    "compute_shadow_summary",
    # Compliance
    "map_regulations",
    # Advanced
    "find_minimum_flip",
    "red_team_search",
    "anonymize_report",
    "compare_audits",
    "trace_bias_origin",
]
