"""
Bias Origin Tracer — Determine if bias was learned from data or amplified by model.
Compares data-level DI vs model-level DI per protected attribute.
"""


def trace_bias_origin(data_bias, model_decision_bias):
    """
    Compare data DI vs model DI. Returns list of origin dicts.

    Origins:
      - AMPLIFIED_BY_MODEL: model makes bias worse than data
      - MITIGATED_BY_MODEL: model reduces bias vs data
      - LEARNED_FROM_DATA: model matches data bias levels
    """
    origins = []
    for attr, data_result in data_bias.items():
        model_result = model_decision_bias.get(attr)
        if not model_result:
            continue

        data_di = data_result.get("metrics", {}).get("disparate_impact")
        model_di = model_result.get("metrics", {}).get("disparate_impact")
        if not isinstance(data_di, (int, float)) or not isinstance(model_di, (int, float)):
            continue

        if model_di < data_di - 0.03:
            origin = "AMPLIFIED_BY_MODEL"
            summary = "Bias amplified by the model beyond what existed in training data."
        elif model_di > data_di + 0.03:
            origin = "MITIGATED_BY_MODEL"
            summary = "Bias reduced by model relative to training data, but residual disparity remains."
        else:
            origin = "LEARNED_FROM_DATA"
            summary = "Bias was present in training data and the model learned it as-is."

        origins.append({
            "attribute": attr,
            "data_di": round(float(data_di), 4),
            "model_di": round(float(model_di), 4),
            "origin": origin,
            "summary": summary,
        })

    return origins
