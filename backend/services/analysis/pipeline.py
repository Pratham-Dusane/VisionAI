"""
Analysis Pipeline Orchestrator - PRD §7.1
Runs all analysis steps, updates Firestore progress.

Performance: Steps are parallelized where possible.
Narratives are deferred to lazy on-demand generation.
"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import logging

logger = logging.getLogger("pipeline")

from firebase_admin import firestore

from services.preprocessing.schema_parser import parse_schema
from services.preprocessing.proxy_detector import detect_proxies
from services.preprocessing.data_profiler import profile_data
from services.preprocessing.auto_binner import auto_bin_protected_columns
from services.analysis.data_bias_scanner import scan_data_bias
from services.analysis.intersectional_audit import intersectional_audit
from services.analysis.feature_laundering import detect_feature_laundering
from services.analysis.historical_harm import calculate_historical_harm
from services.analysis.severity_scorer import compute_severity_score
from services.analysis.model_bias_evaluator import evaluate_model_bias, load_model
from services.analysis.flip_sensitivity import compute_flip_sensitivity
from services.analysis.explainability import compute_explainability_all
from services.compliance.regulation_mapper import map_regulations
from services.gemini.blind_spot_detector import detect_blind_spots_sync
from services.gemini.justified_bias import classify_bias_findings_sync
from core.firebase_init import download_from_storage, cleanup_temp_file


def _load_dataframe(local_path: Path) -> pd.DataFrame:
    ext = local_path.suffix.lower()
    if ext == ".csv":
        return pd.read_csv(local_path)
    elif ext == ".json":
        return pd.read_json(local_path)
    elif ext == ".parquet":
        return pd.read_parquet(local_path)
    raise ValueError(f"Unsupported: {ext}")


def _update_progress(db, audit_id: str, step: str, status: str):
    ts = datetime.utcnow().isoformat()
    db.collection("audits").document(audit_id).update({
        f"pipeline.{step}": status,
        f"pipelineMeta.{step}.status": status,
        f"pipelineMeta.{step}.updatedAt": ts,
        "updatedAt": ts,
    })


def _predict_scores_from_model(model, X: pd.DataFrame) -> np.ndarray:
    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(X)
        probs = np.asarray(probs)
        if probs.ndim == 1:
            return probs
        if probs.shape[1] == 1:
            return probs[:, 0]
        return probs[:, -1]

    if hasattr(model, "decision_function"):
        raw = np.asarray(model.decision_function(X), dtype=float)
        if raw.ndim > 1:
            raw = raw[:, -1]
        min_v = float(np.min(raw))
        max_v = float(np.max(raw))
        if max_v - min_v <= 1e-9:
            return np.full(len(raw), 0.5)
        return (raw - min_v) / (max_v - min_v)

    pred = model.predict(X)
    try:
        return np.asarray(pred, dtype=float)
    except Exception:
        pred_series = pd.Series(pred).astype(str).str.lower()
        return np.where(
            pred_series.isin(["1", "true", "yes", "approved", "positive"]),
            1.0,
            0.0,
        )


def _build_bias_origin_tracer(
    data_bias: dict,
    model_decision_bias: dict,
) -> list[dict]:
    origin = []

    for attr, data_result in data_bias.items():
        model_result = model_decision_bias.get(attr)
        if not model_result:
            continue

        data_di = data_result.get("metrics", {}).get("disparate_impact")
        model_di = model_result.get("metrics", {}).get("disparate_impact")
        if not isinstance(data_di, (int, float)) or not isinstance(model_di, (int, float)):
            continue

        if model_di < data_di - 0.03:
            origin_label = "AMPLIFIED_BY_MODEL"
            summary = (
                "Bias appears to be amplified by the model architecture beyond what existed "
                "in the training data."
            )
        elif model_di > data_di + 0.03:
            origin_label = "MITIGATED_BY_MODEL"
            summary = (
                "Bias appears to be reduced by the model relative to training data patterns, "
                "but residual disparity remains."
            )
        else:
            origin_label = "LEARNED_FROM_DATA"
            summary = "Bias was present in training data and the model largely learned it as-is."

        origin.append({
            "attribute": attr,
            "dataDI": round(float(data_di), 4),
            "modelDI": round(float(model_di), 4),
            "origin": origin_label,
            "summary": summary,
        })

    return origin


def run_full_pipeline(config: dict, audit_id: str) -> dict:
    """
    Full analysis pipeline. Returns all results dict.
    config keys: storagePath, protectedCols, labelCol, positiveLabel,
                 dataOnly, modelStoragePath, deployed, deployedSince,
                 decisionsPerMonth, threshold

    Structured as three phases for speed:
      Phase A (sequential): download, schema, binning, proxy, profiling, data_bias
      Phase B (parallel):   justified_bias | model_eval+explain | intersectional | feature_laundering | blind_spots
      Phase C (sequential): historical_harm, regulation_mapping, severity_scoring

    Narratives are NOT generated here — they are lazy-loaded on demand
    when the user opens the AI Narratives tab.
    """
    db = firestore.client()
    local_path = None
    model_local_path = None
    results = {}

    try:
        # ================================================================
        # PHASE A — Sequential preprocessing (each step depends on prior)
        # ================================================================

        # --- Step 1: Download dataset ---
        _update_progress(db, audit_id, "download", "running")
        local_path = download_from_storage(config["storagePath"])
        df = _load_dataframe(local_path)
        _update_progress(db, audit_id, "download", "complete")

        # --- Step 2: Schema parsing (on raw data) ---
        _update_progress(db, audit_id, "schema_parsing", "running")
        schema = parse_schema(df)
        results["schema"] = schema
        _update_progress(db, audit_id, "schema_parsing", "complete")

        # --- Step 2b: Auto-bin continuous protected attributes ---
        _update_progress(db, audit_id, "auto_binning", "running")
        df_raw = df.copy()
        df, bin_report = auto_bin_protected_columns(df, config["protectedCols"])
        results["binning"] = bin_report
        _update_progress(db, audit_id, "auto_binning", "complete")

        # --- Step 3: Proxy detection (on binned data) ---
        _update_progress(db, audit_id, "proxy_detection", "running")
        proxies = detect_proxies(df, config["protectedCols"])
        results["proxies"] = proxies
        _update_progress(db, audit_id, "proxy_detection", "complete")

        # --- Step 4: Data profiling ---
        _update_progress(db, audit_id, "data_profiling", "running")
        profiles = profile_data(
            df, config["protectedCols"],
            config["labelCol"], config["positiveLabel"],
        )
        results["profiles"] = profiles
        _update_progress(db, audit_id, "data_profiling", "complete")

        # --- Step 5: Data bias scan ---
        _update_progress(db, audit_id, "data_bias_scan", "running")
        data_bias = scan_data_bias(
            df, config["labelCol"], config["positiveLabel"],
            config["protectedCols"],
        )
        results["dataBias"] = data_bias
        _update_progress(db, audit_id, "data_bias_scan", "complete")

        # ================================================================
        # PHASE B — Parallel execution of independent analysis steps
        # ================================================================

        def _run_justified_bias():
            """Gemini: classify bias findings as harmful vs justified."""
            _update_progress(db, audit_id, "justified_bias", "running")
            try:
                justified = classify_bias_findings_sync(
                    data_bias, config.get("domain", "Other")
                )
                logger.info(f"[PIPELINE] Classified {len(justified)} bias findings for justification")
                return "justifiedBias", justified
            except Exception as e:
                logger.error(f"[PIPELINE] Justified bias classification error: {e}")
                return "justifiedBias", {}
            finally:
                _update_progress(db, audit_id, "justified_bias", "complete")

        def _run_model_eval_and_explain():
            """Model evaluation + SHAP explainability (both need model)."""
            nonlocal model_local_path
            model = None
            model_result = {}

            logger.info(f"Model gate: dataOnly={config.get('dataOnly')}, modelStoragePath={config.get('modelStoragePath')}")
            
            if not config.get("dataOnly", True) and config.get("modelStoragePath"):
                _update_progress(db, audit_id, "model_evaluation", "running")
                try:
                    model_local_path = download_from_storage(config["modelStoragePath"])
                    model = load_model(str(model_local_path))
                    if model:
                        raw_feature_cols = [c for c in df_raw.columns
                                            if c != config["labelCol"]]
                        model_bias = evaluate_model_bias(
                            df_raw, model, config["protectedCols"],
                            config["labelCol"], config["positiveLabel"],
                            raw_feature_cols,
                        )
                        model_result["modelBias"] = model_bias

                        flip_sens = compute_flip_sensitivity(
                            model, df_raw, raw_feature_cols, config["protectedCols"],
                        )
                        model_result["flipSensitivity"] = flip_sens

                        model_features = pd.get_dummies(df_raw[raw_feature_cols], drop_first=True).fillna(0)
                        if hasattr(model, "feature_names_in_"):
                            model_features = model_features.reindex(columns=list(model.feature_names_in_), fill_value=0)

                        scores = _predict_scores_from_model(model, model_features)
                        threshold = float(config.get("threshold", 0.5))
                        model_preds = (scores >= threshold).astype(int)

                        pred_df = df.copy()
                        pred_df["__model_pred__"] = model_preds
                        model_decision_bias = scan_data_bias(
                            pred_df, "__model_pred__", 1, config["protectedCols"],
                        )
                        model_result["modelDecisionBias"] = model_decision_bias
                        model_result["biasOriginTracer"] = _build_bias_origin_tracer(data_bias, model_decision_bias)
                except Exception as e:
                    model_result["modelBias"] = None
                    model_result["modelDecisionBias"] = {}
                    model_result["biasOriginTracer"] = []
                    model_result["modelError"] = str(e)
                    logger.error(f"Model evaluation error: {e}")
                _update_progress(db, audit_id, "model_evaluation", "complete")

                # Explainability / SHAP (requires model)
                if model is not None:
                    _update_progress(db, audit_id, "explainability", "running")
                    try:
                        raw_feature_cols = [c for c in df_raw.columns if c != config["labelCol"]]
                        explainability = compute_explainability_all(
                            model, df_raw, config["protectedCols"], raw_feature_cols,
                        )
                        model_result["explainability"] = explainability
                    except Exception as e:
                        model_result["explainability"] = None
                        model_result["explainabilityError"] = str(e)
                    _update_progress(db, audit_id, "explainability", "complete")
                else:
                    model_result["explainability"] = None
                    _update_progress(db, audit_id, "explainability", "skipped")
            else:
                model_result["modelBias"] = None
                model_result["modelDecisionBias"] = {}
                model_result["biasOriginTracer"] = []
                model_result["explainability"] = None
                _update_progress(db, audit_id, "model_evaluation", "skipped")
                _update_progress(db, audit_id, "explainability", "skipped")

            return "model_eval", model_result

        def _run_intersectional():
            """Intersectional audit across protected attribute pairs."""
            _update_progress(db, audit_id, "intersectional_audit", "running")
            intersect = intersectional_audit(
                df, config["protectedCols"],
                config["labelCol"], config["positiveLabel"],
            )
            _update_progress(db, audit_id, "intersectional_audit", "complete")
            return "intersectional", intersect

        def _run_blind_spots():
            """Gemini: identify overlooked sensitive columns."""
            _update_progress(db, audit_id, "blind_spot_detection", "running")
            try:
                sample_values_per_col = {}
                if "schema" in results and "columns" in results["schema"]:
                    for col_info in results["schema"]["columns"]:
                        sample_values_per_col[col_info["name"]] = col_info.get("sample_values", [])

                blind_spots = detect_blind_spots_sync(
                    column_names=list(df.columns),
                    domain=config.get("domain", "Other"),
                    already_flagged=config["protectedCols"],
                    sample_values_per_col=sample_values_per_col,
                )
                logger.info(f"[PIPELINE] Detected {len(blind_spots)} blind spots")
                return "blindSpots", blind_spots
            except Exception as e:
                logger.error(f"[PIPELINE] Blind spot detection error: {e}")
                return "blindSpots", []
            finally:
                _update_progress(db, audit_id, "blind_spot_detection", "complete")

        # Launch all Phase B tasks in parallel
        parallel_tasks = [
            _run_justified_bias,
            _run_model_eval_and_explain,
            _run_intersectional,
            _run_blind_spots,
        ]

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = {executor.submit(fn): fn.__name__ for fn in parallel_tasks}
            for future in as_completed(futures):
                try:
                    key, value = future.result()
                    if key == "model_eval":
                        results.update(value)
                    else:
                        results[key] = value
                except Exception as e:
                    logger.error(f"[PIPELINE] Parallel task failed: {e}")

        # Ensure all expected keys exist (in case parallel tasks were skipped)
        results.setdefault("justifiedBias", {})
        results.setdefault("modelBias", None)
        results.setdefault("modelDecisionBias", {})
        results.setdefault("biasOriginTracer", [])
        results.setdefault("explainability", None)
        results.setdefault("intersectional", [])
        results.setdefault("blindSpots", [])
        results.setdefault("featureLaundering", None)

        # ================================================================
        # PHASE C — Sequential finalization (depends on Phase B results)
        # ================================================================

        model_bias = results.get("modelBias")
        intersectional = results.get("intersectional", [])
        laundering = results.get("featureLaundering") or []

        # --- Historical harm ---
        _update_progress(db, audit_id, "historical_harm", "running")
        harm_results = []
        if config.get("deployed") and config.get("deployedSince"):
            for attr, bias in data_bias.items():
                di = bias.get("metrics", {}).get("disparate_impact")
                if di and di < 0.8:
                    priv = bias.get("privileged_group", "")
                    group_rates = bias.get("group_rates", {})
                    for g, rate in group_rates.items():
                        if g != priv:
                            proportion = _get_group_proportion(profiles, attr, g)
                            harm = calculate_historical_harm(
                                config["deployedSince"],
                                config.get("decisionsPerMonth", 0),
                                di, attr, g, proportion,
                            )
                            if harm:
                                harm_results.append(harm)
        results["historicalHarm"] = harm_results
        _update_progress(db, audit_id, "historical_harm", "complete")

        # --- Regulation mapping ---
        _update_progress(db, audit_id, "regulation_mapping", "running")
        regulations = map_regulations(
            data_bias, laundering, intersectional, proxies, model_bias,
            domain=config.get("domain", "Other"),
            jurisdiction=config.get("jurisdiction", "Global"),
        )
        results["regulationMap"] = regulations
        _update_progress(db, audit_id, "regulation_mapping", "complete")

        # --- Severity scoring ---
        _update_progress(db, audit_id, "severity_scoring", "running")
        severity = compute_severity_score(
            data_bias, proxies, intersectional, laundering, model_bias,
        )
        results["severity"] = severity
        _update_progress(db, audit_id, "severity_scoring", "complete")

        # Narratives are NOT generated here — they are lazy-loaded on demand
        # when the user opens the AI Narratives tab via GET /api/audits/{id}/narrative/{type}
        results["narratives"] = {}

        return results

    finally:
        if local_path:
            cleanup_temp_file(local_path)
        if model_local_path:
            cleanup_temp_file(model_local_path)


def _get_group_proportion(profiles, attr, group):
    """Get group proportion from profile data."""
    for p in profiles:
        if p.get("attribute") == attr:
            pcts = p.get("group_percentages", {})
            return pcts.get(group, 10) / 100.0
    return 0.1
