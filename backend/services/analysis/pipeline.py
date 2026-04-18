"""
Analysis Pipeline Orchestrator — PRD §7.1
Runs all analysis steps, updates Firestore progress.
"""

import pandas as pd
from pathlib import Path
from datetime import datetime
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
from services.gemini.stakeholder_formatter import generate_all_stakeholder_narratives_sync
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
    db.collection("audits").document(audit_id).update({
        f"pipeline.{step}": status,
        "updatedAt": datetime.utcnow().isoformat(),
    })


def run_full_pipeline(config: dict, audit_id: str) -> dict:
    """
    Full analysis pipeline. Returns all results dict.
    config keys: storagePath, protectedCols, labelCol, positiveLabel,
                 dataOnly, modelStoragePath, deployed, deployedSince,
                 decisionsPerMonth, threshold
    """
    db = firestore.client()
    local_path = None
    model_local_path = None
    results = {}

    try:
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
        # Keep raw df for model evaluation (model trained on raw numbers)
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

        # --- Step 6: Model evaluation (skip if dataOnly) ---
        model = None
        model_bias = None
        flip_sens = None

        logger.info(f"Model gate: dataOnly={config.get('dataOnly')}, modelStoragePath={config.get('modelStoragePath')}")
        print(f"[PIPELINE] dataOnly={config.get('dataOnly')}, modelStoragePath={config.get('modelStoragePath')}")

        if not config.get("dataOnly", True) and config.get("modelStoragePath"):
            _update_progress(db, audit_id, "model_evaluation", "running")
            try:
                model_local_path = download_from_storage(config["modelStoragePath"])
                model = load_model(str(model_local_path))
                if model:
                    # Use RAW df for model eval — model trained on raw data
                    raw_feature_cols = [c for c in df_raw.columns
                                        if c != config["labelCol"]]
                    model_bias = evaluate_model_bias(
                        df_raw, model, config["protectedCols"],
                        config["labelCol"], config["positiveLabel"],
                        raw_feature_cols,
                    )
                    results["modelBias"] = model_bias

                    # Flip sensitivity — also on raw df
                    flip_sens = compute_flip_sensitivity(
                        model, df_raw, raw_feature_cols, config["protectedCols"],
                    )
                    results["flipSensitivity"] = flip_sens
            except Exception as e:
                results["modelBias"] = None
                results["modelError"] = str(e)
                logger.error(f"Model evaluation error: {e}")
                print(f"[PIPELINE] Model evaluation ERROR: {e}")
                import traceback; traceback.print_exc()
            _update_progress(db, audit_id, "model_evaluation", "complete")
        else:
            results["modelBias"] = None
            print(f"[PIPELINE] Model evaluation SKIPPED -- dataOnly={config.get('dataOnly')}, modelPath={config.get('modelStoragePath')}")
            _update_progress(db, audit_id, "model_evaluation", "skipped")

        # --- Step 6b: Explainability / SHAP (requires model) ---
        if model is not None:
            _update_progress(db, audit_id, "explainability", "running")
            try:
                # Use RAW df for SHAP — model trained on raw data
                raw_feature_cols = [c for c in df_raw.columns if c != config["labelCol"]]
                explainability = compute_explainability_all(
                    model, df_raw, config["protectedCols"], raw_feature_cols,
                )
                results["explainability"] = explainability
            except Exception as e:
                results["explainability"] = None
                results["explainabilityError"] = str(e)
            _update_progress(db, audit_id, "explainability", "complete")
        else:
            results["explainability"] = None
            _update_progress(db, audit_id, "explainability", "skipped")

        # --- Step 7: Intersectional audit ---
        _update_progress(db, audit_id, "intersectional_audit", "running")
        intersectional = intersectional_audit(
            df, config["protectedCols"],
            config["labelCol"], config["positiveLabel"],
        )
        results["intersectional"] = intersectional
        _update_progress(db, audit_id, "intersectional_audit", "complete")

        # --- Step 8: Feature laundering ---
        _update_progress(db, audit_id, "feature_laundering", "running")
        feature_cols_for_launder = [
            c for c in df.columns
            if c != config["labelCol"] and c not in config["protectedCols"]
        ]
        laundering = detect_feature_laundering(
            df, config["protectedCols"], feature_cols_for_launder,
        )
        results["featureLaundering"] = laundering
        _update_progress(db, audit_id, "feature_laundering", "complete")

        # --- Step 9: Historical harm ---
        _update_progress(db, audit_id, "historical_harm", "running")
        harm_results = []
        if config.get("deployed") and config.get("deployedSince"):
            for attr, bias in data_bias.items():
                di = bias.get("metrics", {}).get("disparate_impact")
                if di and di < 0.8:
                    # Find unprivileged group + proportion
                    priv = bias.get("privileged_group", "")
                    group_rates = bias.get("group_rates", {})
                    for g, rate in group_rates.items():
                        if g != priv:
                            # Estimate proportion from profiles
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

        # --- Step 10: Regulation mapping ---
        _update_progress(db, audit_id, "regulation_mapping", "running")
        regulations = map_regulations(
            data_bias, laundering, intersectional, proxies, model_bias,
            domain=config.get("domain", "Other"),
            jurisdiction=config.get("jurisdiction", "Global"),
        )
        results["regulationMap"] = regulations
        _update_progress(db, audit_id, "regulation_mapping", "complete")

        # --- Step 11: Severity scoring ---
        _update_progress(db, audit_id, "severity_scoring", "running")
        severity = compute_severity_score(
            data_bias, proxies, intersectional, laundering, model_bias,
        )
        results["severity"] = severity
        _update_progress(db, audit_id, "severity_scoring", "complete")

        # --- Step 12: Blind spot detection (Gemini AI) ---
        _update_progress(db, audit_id, "blind_spot_detection", "running")
        try:
            # Extract sample values from schema
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
            results["blindSpots"] = blind_spots
            logger.info(f"[PIPELINE] Detected {len(blind_spots)} blind spots")
        except Exception as e:
            results["blindSpots"] = []
            logger.error(f"[PIPELINE] Blind spot detection error: {e}")
            import traceback
            traceback.print_exc()
        _update_progress(db, audit_id, "blind_spot_detection", "complete")

        # --- Step 13: Narrative generation (Gemini AI) ---
        _update_progress(db, audit_id, "narrative_generation", "running")
        try:
            narratives = generate_all_stakeholder_narratives_sync(
                audit_id=audit_id,
                audit_results=results,
                domain=config.get("domain", "Other"),
            )
            results["narratives"] = narratives
            logger.info(f"[PIPELINE] Generated narratives for {len(narratives)} stakeholder types")
        except Exception as e:
            results["narratives"] = {}
            logger.error(f"[PIPELINE] Narrative generation error: {e}")
            import traceback
            traceback.print_exc()
        _update_progress(db, audit_id, "narrative_generation", "complete")

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
