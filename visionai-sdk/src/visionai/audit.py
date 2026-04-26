"""
FairnessAudit — Main orchestrator for VisionAI SDK.

Usage::

    from visionai import FairnessAudit

    audit = FairnessAudit(
        data="dataset.csv",
        label_col="approved",
        positive_label="1",
        protected_cols=["gender", "race"],
        model="model.joblib",          # optional
        domain="Financial Lending",    # optional
    )
    results = audit.run()
    print(results.fairness_score, results.letter_grade)
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Union, Optional

import pandas as pd
import numpy as np

from visionai.utils.io import load_dataframe, load_model as _load_model
from visionai.preprocessing.schema_parser import parse_schema
from visionai.preprocessing.proxy_detector import detect_proxies
from visionai.preprocessing.data_profiler import profile_data
from visionai.preprocessing.auto_binner import auto_bin_protected_columns
from visionai.analysis.data_bias_scanner import scan_data_bias
from visionai.analysis.model_bias_evaluator import evaluate_model_bias
from visionai.analysis.intersectional_audit import intersectional_audit
from visionai.analysis.feature_laundering import detect_feature_laundering
from visionai.analysis.severity_scorer import compute_severity_score
from visionai.analysis.historical_harm import calculate_historical_harm
from visionai.analysis.flip_sensitivity import compute_flip_sensitivity
from visionai.analysis.shadow_testing import (
    get_existing_intersections, generate_shadow_profiles, compute_shadow_summary,
)
from visionai.compliance.regulation_mapper import map_regulations
from visionai.advanced.bias_origin_tracer import trace_bias_origin
from visionai.advanced.adversarial_simulator import find_minimum_flip
from visionai.advanced.red_team import red_team_search
from visionai.advanced.whistleblower import anonymize_report


@dataclass
class AuditResult:
    """Container for all audit findings."""
    fairness_score: int = 0
    letter_grade: str = "?"
    penalties: list = field(default_factory=list)
    data_bias: dict = field(default_factory=dict)
    profiles: list = field(default_factory=list)
    proxies: list = field(default_factory=list)
    intersectional: list = field(default_factory=list)
    feature_laundering: list = field(default_factory=list)
    model_bias: Optional[dict] = None
    flip_sensitivity: Optional[dict] = None
    explainability: Optional[dict] = None
    historical_harm: list = field(default_factory=list)
    regulation_map: list = field(default_factory=list)
    shadow_test: Optional[dict] = None
    bias_origin: list = field(default_factory=list)
    schema: dict = field(default_factory=dict)
    binning: dict = field(default_factory=dict)

    def summary(self) -> str:
        """Plain-text summary of audit findings."""
        lines = [
            f"Fairness Score: {self.fairness_score}/100 (Grade: {self.letter_grade})",
            f"Penalties: {len(self.penalties)}",
            f"Data Bias Issues: {sum(1 for v in self.data_bias.values() if v.get('verdict') == 'FAIL')}",
            f"Proxy Variables: {len(self.proxies)}",
            f"Intersectional Violations: {sum(1 for i in self.intersectional if i.get('severity') in ('CRITICAL', 'HIGH'))}",
            f"Feature Laundering: {sum(1 for f in self.feature_laundering if f.get('laundering_detected'))}",
            f"Model Evaluated: {'Yes' if self.model_bias else 'No'}",
            f"Regulations Triggered: {len(self.regulation_map)}",
        ]
        return "\n".join(lines)

    def to_dict(self) -> dict:
        """Convert to plain dict (JSON-serializable)."""
        d = {}
        for k, v in self.__dict__.items():
            if isinstance(v, pd.DataFrame):
                d[k] = v.to_dict(orient="records")
            elif isinstance(v, np.ndarray):
                d[k] = v.tolist()
            else:
                d[k] = v
        return d

    def to_json(self, path: str) -> None:
        """Save results as JSON file."""
        with open(path, "w") as f:
            json.dump(self.to_dict(), f, indent=2, default=str)

    def anonymize(self, org_name: str = None) -> dict:
        """Generate anonymized whistleblower report."""
        return anonymize_report(self.to_dict(), org_name)


class FairnessAudit:
    """
    Main entry point for VisionAI fairness auditing.

    Args:
        data: Path to dataset (.csv/.json/.parquet) or pd.DataFrame
        label_col: Name of the outcome/label column
        positive_label: Value representing positive outcome
        protected_cols: List of protected attribute column names
        model: Path to model file (.pkl/.joblib) or model object (optional)
        domain: Industry domain for regulation mapping (optional)
        fairness_threshold: DI threshold, default 0.8
        deployment_start: ISO date string if model deployed (optional)
        monthly_decisions: Decisions per month if deployed (optional)
    """

    def __init__(
        self,
        data: Union[str, Path, pd.DataFrame],
        label_col: str,
        positive_label: str,
        protected_cols: list,
        model=None,
        domain: str = "Other",
        fairness_threshold: float = 0.8,
        deployment_start: str = None,
        monthly_decisions: int = None,
    ):
        self.df_raw = load_dataframe(data)
        self.label_col = label_col
        self.positive_label = str(positive_label)
        self.protected_cols = protected_cols
        self.model = _load_model(model)
        self.domain = domain
        self.fairness_threshold = fairness_threshold
        self.deployment_start = deployment_start
        self.monthly_decisions = monthly_decisions

        # Binned copy for fairness analysis
        self.df_binned, self.bin_report = auto_bin_protected_columns(
            self.df_raw.copy(), self.protected_cols
        )
        self._schema = None
        self._result = AuditResult()

    def run(self) -> AuditResult:
        """Run full fairness audit pipeline. Returns AuditResult."""
        r = self._result

        # Schema
        r.schema = parse_schema(self.df_raw)
        r.binning = self.bin_report

        # Proxy detection
        r.proxies = detect_proxies(self.df_binned, self.protected_cols)

        # Data profiling
        r.profiles = profile_data(
            self.df_binned, self.protected_cols,
            self.label_col, self.positive_label,
        )

        # Data bias
        r.data_bias = scan_data_bias(
            self.df_binned, self.label_col,
            self.positive_label, self.protected_cols,
        )

        # Model evaluation
        if self.model is not None:
            feat_cols = [c for c in self.df_raw.columns if c != self.label_col]
            r.model_bias = evaluate_model_bias(
                self.df_raw, self.model, self.protected_cols,
                self.label_col, self.positive_label, feat_cols,
            )
            r.flip_sensitivity = compute_flip_sensitivity(
                self.model, self.df_raw, feat_cols, self.protected_cols,
            )

            # Explainability (SHAP)
            try:
                from visionai.analysis.explainability import compute_explainability_all
                r.explainability = compute_explainability_all(
                    self.model, self.df_raw, self.protected_cols, feat_cols,
                )
            except ImportError:
                r.explainability = None

            # Bias origin tracing
            X = pd.get_dummies(self.df_raw[feat_cols], drop_first=True).fillna(0)
            if hasattr(self.model, "feature_names_in_"):
                X = X.reindex(columns=list(self.model.feature_names_in_), fill_value=0)
            try:
                if hasattr(self.model, "predict_proba"):
                    scores = self.model.predict_proba(X)[:, -1]
                else:
                    scores = self.model.predict(X).astype(float)
                preds = (scores >= self.fairness_threshold).astype(int)
                pred_df = self.df_binned.copy()
                pred_df["__pred__"] = preds
                model_dec_bias = scan_data_bias(
                    pred_df, "__pred__", 1, self.protected_cols,
                )
                r.bias_origin = trace_bias_origin(r.data_bias, model_dec_bias)
            except Exception:
                r.bias_origin = []

        # Intersectional audit
        r.intersectional = intersectional_audit(
            self.df_binned, self.protected_cols,
            self.label_col, self.positive_label,
        )

        # Feature laundering
        non_label_non_prot = [
            c for c in self.df_binned.columns
            if c != self.label_col and c not in self.protected_cols
        ]
        r.feature_laundering = detect_feature_laundering(
            self.df_binned, self.protected_cols, non_label_non_prot,
        )

        # Historical harm
        r.historical_harm = []
        if self.deployment_start and self.monthly_decisions:
            for attr, bias in r.data_bias.items():
                di = bias.get("metrics", {}).get("disparate_impact")
                if di and di < 0.8:
                    priv = bias.get("privileged_group", "")
                    for g, rate in bias.get("group_rates", {}).items():
                        if g != priv:
                            prop = self._get_proportion(r.profiles, attr, g)
                            harm = calculate_historical_harm(
                                self.deployment_start, self.monthly_decisions,
                                di, attr, g, prop,
                            )
                            if harm:
                                r.historical_harm.append(harm)

        # Regulation mapping
        r.regulation_map = map_regulations(
            r.data_bias, r.feature_laundering, r.intersectional,
            r.proxies, r.model_bias, domain=self.domain,
        )

        # Severity scoring
        severity = compute_severity_score(
            r.data_bias, r.proxies, r.intersectional,
            r.feature_laundering, r.model_bias,
        )
        r.fairness_score = severity["fairness_score"]
        r.letter_grade = severity["letter_grade"]
        r.penalties = severity["penalties"]

        return r

    def shadow_test(self, profiles_per_intersection=100):
        """Run generative shadow testing for missing intersections."""
        existing = get_existing_intersections(self.df_binned, self.protected_cols)
        shadow_df, missing = generate_shadow_profiles(
            self.df_binned, self.label_col, self.positive_label,
            self.protected_cols, existing, profiles_per_intersection,
        )

        if self.model is not None and len(shadow_df) > 0:
            feat_cols = [c for c in shadow_df.columns if c != self.label_col]
            X = pd.get_dummies(shadow_df[feat_cols], drop_first=True).fillna(0)
            if hasattr(self.model, "feature_names_in_"):
                X = X.reindex(columns=list(self.model.feature_names_in_), fill_value=0)
            try:
                preds = self.model.predict(X)
                results = []
                for i, pred in enumerate(preds):
                    demo = {c: shadow_df.iloc[i].get(c) for c in self.protected_cols if c in shadow_df.columns}
                    results.append({
                        "demographics": {k: str(v) for k, v in demo.items()},
                        "decision": "ACCEPT" if pred == 1 or str(pred).lower() in ("1", "true", "approved") else "REJECT",
                    })
                overall_rate = sum(1 for r in self._result.data_bias.values()) / max(len(self._result.data_bias), 1)
                # Use actual overall positive rate from data
                from visionai.analysis.data_bias_scanner import _positive_rate
                baseline = _positive_rate(self.df_binned, self.label_col, self.positive_label)
                summary = compute_shadow_summary(results, baseline, self.protected_cols)
                self._result.shadow_test = summary
                return {"shadow_profiles": shadow_df, "missing_intersections": missing, "summary": summary}
            except Exception:
                pass

        return {"shadow_profiles": shadow_df, "missing_intersections": missing, "summary": None}

    def find_minimum_flip(self, row_index=0):
        """Find minimum feature changes to flip prediction for a row."""
        feat_cols = [c for c in self.df_raw.columns if c != self.label_col]
        return find_minimum_flip(
            self.model, self.df_raw, feat_cols,
            self.protected_cols, row_index, self.label_col,
        )

    def red_team(self, thresholds=None):
        """Run worst-case bias search across thresholds."""
        feat_cols = [c for c in self.df_raw.columns if c != self.label_col]
        return red_team_search(
            self.model, self.df_raw, feat_cols,
            self.protected_cols, self.label_col,
            self.positive_label, thresholds,
        )

    def _get_proportion(self, profiles, attr, group):
        for p in profiles:
            if p.get("attribute") == attr:
                return p.get("group_percentages", {}).get(group, 10) / 100.0
        return 0.1
