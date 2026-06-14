"""
Edge Quantization Fairness Profiler — PRD §6
Computes the Quantization Disparity Index (QDI) measuring
how model compression disproportionately degrades accuracy
for underrepresented demographic groups.

Supported model formats:
  - .pkl / .joblib  (scikit-learn via joblib)
  - .onnx           (ONNX Runtime)
  - .tflite         (TFLite Runtime or TensorFlow Lite)
"""

import numpy as np
import pandas as pd
import joblib
import logging
from typing import Callable
from pathlib import Path

import sys
from sklearn.base import BaseEstimator, ClassifierMixin

logger = logging.getLogger(__name__)

class QuantizedModelWrapper(BaseEstimator, ClassifierMixin):
    """Wraps a full-precision model, simulating INT8 quantization noise."""
    def __init__(self, base_model, noise_scale=0.12, seed=42):
        self.base_model = base_model
        self.noise_scale = noise_scale
        self.seed = seed
        self.classes_ = base_model.classes_

    def fit(self, X, y):
        return self

    def predict_proba(self, X):
        proba = self.base_model.predict_proba(X)
        rng = np.random.RandomState(self.seed + len(X))  # deterministic per-call
        scores = proba[:, 1]
        # Boundary sensitivity: samples near 0.5 get more noise
        sensitivity = 1.0 - 2.0 * np.abs(scores - 0.5)
        noise = rng.normal(0, self.noise_scale, size=len(scores))
        noise *= sensitivity
        noisy_scores = np.clip(scores + noise, 0.001, 0.999)
        return np.column_stack([1 - noisy_scores, noisy_scores])

    def predict(self, X):
        proba = self.predict_proba(X)
        return self.classes_[np.argmax(proba, axis=1)]

# Register class in __main__ module to support deserializing joblib/pickle objects
# created in demo script environments.
try:
    sys.modules['__main__'].QuantizedModelWrapper = QuantizedModelWrapper
except Exception as e:
    logger.warning(f"Could not register QuantizedModelWrapper in __main__: {e}")

# QDI threshold — groups with QDI > this are flagged
QDI_THRESHOLD = 0.05

# Minimum samples per group to include in analysis
MIN_GROUP_SIZE = 30


def _detect_model_type(model_path: str) -> str:
    """Detect model type from file extension."""
    ext = Path(model_path).suffix.lower()
    if ext in (".pkl", ".joblib"):
        return "pkl"
    elif ext == ".onnx":
        return "onnx"
    elif ext == ".tflite":
        return "tflite"
    else:
        raise ValueError(f"Unsupported model format: {ext}. Supported: .pkl, .joblib, .onnx, .tflite")


def load_model_as_predict_fn(model_path: str, model_type: str | None = None) -> Callable:
    """
    Load a model file and return a prediction function: X (np.ndarray) -> scores (np.ndarray).
    Scores are float values (probabilities or raw predictions).
    """
    if model_type is None:
        model_type = _detect_model_type(model_path)

    if model_type == "pkl":
        return _load_pkl_model(model_path)
    elif model_type == "onnx":
        return _load_onnx_model(model_path)
    elif model_type == "tflite":
        return _load_tflite_model(model_path)
    else:
        raise ValueError(f"Unsupported model type: {model_type}")


def _load_pkl_model(model_path: str) -> Callable:
    """Load scikit-learn / joblib model."""
    from services.analysis.model_bias_evaluator import ensure_demo_wrappers_registered
    ensure_demo_wrappers_registered()
    model = joblib.load(model_path)

    if hasattr(model, "predict_proba"):
        def predict_pkl(X: np.ndarray) -> np.ndarray:
            proba = model.predict_proba(X)
            if proba.shape[1] > 1:
                return proba[:, 1]
            return proba[:, 0]
        return predict_pkl

    def predict_pkl_raw(X: np.ndarray) -> np.ndarray:
        return model.predict(X).astype(float)
    return predict_pkl_raw


def _load_onnx_model(model_path: str) -> Callable:
    """Load ONNX model via onnxruntime."""
    try:
        import onnxruntime as ort
    except ImportError:
        raise ImportError(
            "onnxruntime is required for .onnx model support. "
            "Install it with: pip install onnxruntime"
        )

    session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name

    def predict_onnx(X: np.ndarray) -> np.ndarray:
        out = session.run(None, {input_name: X.astype(np.float32)})
        if len(out[0].shape) > 1 and out[0].shape[1] > 1:
            return out[0][:, 1].astype(float)
        return out[0].flatten().astype(float)

    return predict_onnx


def _load_tflite_model(model_path: str) -> Callable:
    """Load TFLite model via tflite_runtime or tensorflow.lite."""
    interpreter = None

    # Try tflite_runtime first (lightweight)
    try:
        from tflite_runtime.interpreter import Interpreter
        interpreter = Interpreter(model_path=model_path)
    except ImportError:
        pass

    # Fall back to tensorflow.lite
    if interpreter is None:
        try:
            import tensorflow as tf
            interpreter = tf.lite.Interpreter(model_path=model_path)
        except ImportError:
            raise ImportError(
                "TFLite support requires either tflite-runtime or tensorflow. "
                "Install with: pip install tflite-runtime  OR  pip install tensorflow"
            )

    interpreter.allocate_tensors()
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()

    def predict_tflite(X: np.ndarray) -> np.ndarray:
        results = []
        for row in X:
            input_data = row.reshape(1, -1).astype(np.float32)
            interpreter.set_tensor(input_details[0]["index"], input_data)
            interpreter.invoke()
            out = interpreter.get_tensor(output_details[0]["index"])
            if out.shape[-1] > 1:
                results.append(float(out[0][1]))
            else:
                results.append(float(out[0][0]))
        return np.array(results)

    return predict_tflite


def simulate_quantized_predictions(
    predict_fn: Callable,
    X: np.ndarray,
    noise_scale: float = 0.08,
    seed: int = 42,
) -> np.ndarray:
    """
    Simulate INT8 quantization effects by adding calibrated noise
    to full-precision predictions. This models the precision loss
    when converting FP32 weights to INT8.

    The noise is designed to disproportionately affect predictions
    near the decision boundary (score ≈ 0.5), which mirrors real
    quantization behavior.
    """
    rng = np.random.RandomState(seed)
    full_scores = predict_fn(X)

    # Boundary proximity — scores near 0.5 are most affected by quantization
    boundary_sensitivity = 1.0 - 2.0 * np.abs(full_scores - 0.5)

    # Scale noise by boundary proximity
    noise = rng.normal(0, noise_scale, size=len(full_scores))
    noise *= boundary_sensitivity

    quantized_scores = np.clip(full_scores + noise, 0.0, 1.0)
    return quantized_scores


def compute_qdi(
    df: pd.DataFrame,
    full_precision_path: str,
    quantized_path: str | None,
    protected_cols: list[str],
    label_col: str,
    positive_label: str,
    feature_cols: list[str] | None = None,
    full_precision_type: str | None = None,
    quantized_type: str | None = None,
) -> dict:
    """
    Compute the Quantization Disparity Index (QDI) for each demographic group.

    QDI(group_i) = (Accuracy_full(group_i) - Accuracy_quantized(group_i)) / Accuracy_full(group_i)

    A QDI > 0.05 (5% relative degradation) is flagged as a quantization fairness failure.

    If quantized_path is None, simulates quantization by adding calibrated noise
    to the full-precision model's predictions.

    Returns:
        dict with keys: overall, per_group, flagged_groups, metadata
    """
    if feature_cols is None:
        feature_cols = [c for c in df.columns if c != label_col and c not in protected_cols]
        # Filter to numeric columns only for model input
        numeric_cols = []
        for col in feature_cols:
            if pd.api.types.is_numeric_dtype(df[col]):
                numeric_cols.append(col)
        feature_cols = numeric_cols

    if not feature_cols:
        raise ValueError("No numeric feature columns found for model prediction.")

    # Detect model types
    if full_precision_type is None:
        full_precision_type = _detect_model_type(full_precision_path)
    if quantized_path and quantized_type is None:
        quantized_type = _detect_model_type(quantized_path)

    # Load models
    full_fn = load_model_as_predict_fn(full_precision_path, full_precision_type)

    # Prepare data
    X = df[feature_cols].values.astype(np.float32)

    # Handle positive label type matching
    try:
        col_dtype = df[label_col].dtype
        if pd.api.types.is_numeric_dtype(col_dtype):
            pos_val = float(positive_label)
        else:
            pos_val = str(positive_label)
    except (ValueError, TypeError):
        pos_val = positive_label

    y_true = (df[label_col] == pos_val).astype(int).values
    if y_true.sum() == 0:
        # Fallback: try numeric cast
        try:
            y_true = (df[label_col].astype(float) == float(positive_label)).astype(int).values
        except Exception:
            pass

    # Get full-precision predictions
    full_scores = full_fn(X)
    full_preds = (full_scores >= 0.5).astype(int)

    # Get quantized predictions
    simulated = False
    if quantized_path:
        quant_fn = load_model_as_predict_fn(quantized_path, quantized_type)
        quant_scores = quant_fn(X)
    else:
        # Simulate quantization
        quant_scores = simulate_quantized_predictions(full_fn, X)
        simulated = True

    quant_preds = (quant_scores >= 0.5).astype(int)

    # Overall metrics
    overall_full_acc = float((full_preds == y_true).mean())
    overall_quant_acc = float((quant_preds == y_true).mean())
    overall_qdi = (overall_full_acc - overall_quant_acc) / overall_full_acc if overall_full_acc > 0 else 0.0

    results = {
        "overall": {
            "full_precision_accuracy": round(overall_full_acc, 4),
            "quantized_accuracy": round(overall_quant_acc, 4),
            "qdi": round(overall_qdi, 4),
            "accuracy_drop_pct": round(overall_qdi * 100, 2),
            "total_samples": int(len(df)),
            "simulated_quantization": simulated,
        },
        "per_group": {},
        "flagged_groups": [],
        "metadata": {
            "qdi_threshold": QDI_THRESHOLD,
            "min_group_size": MIN_GROUP_SIZE,
            "feature_cols_used": feature_cols,
            "protected_cols_analyzed": [],
        },
    }

    # Per-group analysis
    for protected_col in protected_cols:
        if protected_col not in df.columns:
            logger.warning(f"Protected column '{protected_col}' not found in dataset, skipping.")
            continue

        results["metadata"]["protected_cols_analyzed"].append(protected_col)
        group_results = {}

        for group_val in sorted(df[protected_col].dropna().unique(), key=str):
            mask = (df[protected_col] == group_val).values
            group_size = int(mask.sum())

            if group_size < MIN_GROUP_SIZE:
                logger.info(f"Skipping {protected_col}={group_val} (n={group_size} < {MIN_GROUP_SIZE})")
                continue

            y_group = y_true[mask]
            full_group_preds = full_preds[mask]
            quant_group_preds = quant_preds[mask]

            full_acc = float((full_group_preds == y_group).mean())
            quant_acc = float((quant_group_preds == y_group).mean())
            qdi = (full_acc - quant_acc) / full_acc if full_acc > 0 else 0.0
            flagged = qdi > QDI_THRESHOLD

            group_result = {
                "full_precision_accuracy": round(full_acc, 4),
                "quantized_accuracy": round(quant_acc, 4),
                "qdi": round(qdi, 4),
                "accuracy_drop_pct": round(qdi * 100, 2),
                "sample_size": group_size,
                "flagged": flagged,
            }
            group_results[str(group_val)] = group_result

            if flagged:
                results["flagged_groups"].append({
                    "protected_col": protected_col,
                    "group": str(group_val),
                    "qdi": round(qdi, 4),
                    "accuracy_drop_pct": round(qdi * 100, 2),
                    "full_acc": round(full_acc, 4),
                    "quant_acc": round(quant_acc, 4),
                    "sample_size": group_size,
                    "explanation": (
                        f"Quantization caused a {qdi*100:.1f}% relative accuracy drop for "
                        f"{protected_col}={group_val} (from {full_acc:.1%} to {quant_acc:.1%}). "
                        f"This group is disproportionately harmed by model compression."
                    ),
                    "severity": "CRITICAL" if qdi > 0.15 else "HIGH" if qdi > 0.10 else "MEDIUM",
                })

        results["per_group"][protected_col] = group_results

    # Sort flagged groups by QDI descending
    results["flagged_groups"].sort(key=lambda x: x["qdi"], reverse=True)

    return results
