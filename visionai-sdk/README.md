# VisionAI — AI Fairness Auditing Toolkit

[![PyPI version](https://badge.fury.io/py/visionai-fairness.svg)](https://pypi.org/project/visionai-fairness/)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-green.svg)](https://opensource.org/licenses/Apache-2.0)

**Detect, measure, and fix bias in ML models and datasets.**

VisionAI audits datasets and models for fairness violations including disparate impact, proxy discrimination, feature laundering, intersectional bias, and more. It maps findings to legal regulations (EU AI Act, EEOC, GDPR) and provides actionable fix recommendations.

## Installation

```bash
pip install visionai-fairness
```

With SHAP explainability support:
```bash
pip install visionai-fairness[shap]
```

## Quick Start

```python
from visionai import FairnessAudit

audit = FairnessAudit(
    data="loan_data.csv",
    label_col="approved",
    positive_label="1",
    protected_cols=["gender", "race"],
    model="model.joblib",           # optional
    domain="Financial Lending",
)

results = audit.run()
print(results.fairness_score)       # 62
print(results.letter_grade)         # "C"
print(results.summary())
results.to_json("audit_report.json")
```

## Features

### Core Analysis
| Module | Description |
|--------|-------------|
| **Data Bias Scanner** | Disparate Impact ratio, Statistical Parity Difference, label skew |
| **Model Bias Evaluator** | Counterfactual perturbation testing, Equalized Odds (FPR/FNR) |
| **Proxy Detector** | Cramér's V + Eta-squared to find indirect discrimination channels |
| **Feature Laundering** | GradientBoosting reconstruction attack on protected attributes |
| **Intersectional Audit** | Pairwise protected attribute DI with significance thresholds |
| **Explainability** | SHAP values per demographic group, disparity detection |
| **Severity Scorer** | Weighted 0-100 score with letter grade (A-F) |
| **Historical Harm** | Estimate individuals harmed over deployment period |
| **Flip Sensitivity** | Decision boundary vulnerability analysis |

### Advanced Features (Phase 7)
| Module | Description |
|--------|-------------|
| **Shadow Testing** | Statistical synthetic profiles for missing demographic intersections |
| **Adversarial Simulator** | Minimum feature changes to flip a prediction |
| **Red Team Mode** | Worst-case bias search across all thresholds × demographic slices |
| **Whistleblower Export** | Anonymized reports with SHA-256 integrity hash |
| **Model Comparison** | Diff two audits — show improved/worsened metrics |
| **Bias Origin Tracer** | Data bias vs model bias — learned or amplified? |

### Compliance
Maps findings to **EU AI Act**, **US EEOC**, **GDPR Article 22**, **India DPDP Act**, **UK Equality Act**, and domain-specific regulations.

## Granular Usage

Use individual modules directly:

```python
from visionai import scan_data_bias, detect_proxies, detect_feature_laundering
import pandas as pd

df = pd.read_csv("data.csv")
bias = scan_data_bias(df, "hired", "1", ["gender", "race"])
proxies = detect_proxies(df, ["gender", "race"])
laundering = detect_feature_laundering(df, ["gender"], ["age", "income", "score"])
```

## Shadow Testing

```python
audit = FairnessAudit(data=df, label_col="approved", positive_label="1",
                       protected_cols=["gender", "race"], model=model)
shadow = audit.shadow_test()
print(shadow["missing_intersections"])
print(shadow["summary"]["flaggedCount"])
```

## License

Apache 2.0 — See [LICENSE](LICENSE)
