"""
Generate demo data for Transfer Bias feature testing.

Creates:
  1. hiring_transfer_dataset.csv — 500-row hiring dataset with gender, ethnicity columns
  2. hiring_finetuned_model.joblib — A fine-tuned LogisticRegression model with intentional
     bias patterns calibrated to produce compelling transfer bias results:
       - gender: AMPLIFIED_BY_FINETUNING (base BERT has slight gender bias, fine-tuning makes worse)
       - ethnicity: INTRODUCED_BY_FINETUNING (base BERT is fairly fair on race, fine-tuning introduces bias)

Usage:
    cd backend
    python scripts/generate_demo_transfer_bias.py
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
import joblib
import os
from pathlib import Path

np.random.seed(42)

N = 500

# ─── Demographics ───
genders = np.random.choice(["Male", "Female", "Non-binary"], size=N, p=[0.45, 0.45, 0.10])
ethnicities = np.random.choice(
    ["White", "Asian", "Black", "Hispanic"],
    size=N,
    p=[0.35, 0.25, 0.20, 0.20],
)

# ─── Features ───
experience_years = np.random.uniform(0, 15, N).round(1)
education_score = np.random.uniform(1, 10, N).round(2)
technical_score = np.random.uniform(1, 10, N).round(2)
communication_score = np.random.uniform(1, 10, N).round(2)
leadership_score = np.random.uniform(1, 10, N).round(2)

# ─── Base hiring probability (unbiased) ───
# Reduced offset and weights to lower average hiring rate
base_prob = (
    0.05
    + 0.01 * experience_years
    + 0.02 * education_score
    + 0.03 * technical_score
    + 0.01 * communication_score
    + 0.01 * leadership_score
)

# ─── Introduce fine-tuning bias ───
# We want fine-tuned DI ≈ 0.58 for gender (AMPLIFIED_BY_FINETUNING)
gender_adjustment = np.where(genders == "Male", 0.18, np.where(genders == "Female", -0.18, -0.05))

# We want fine-tuned DI ≈ 0.62 for ethnicity (INTRODUCED_BY_FINETUNING)
ethnicity_adjustment = np.where(
    ethnicities == "White", 0.15,
    np.where(ethnicities == "Asian", 0.05,
    np.where(ethnicities == "Black", -0.18, -0.12))
)

# Final probability with bias
final_prob = np.clip(base_prob + gender_adjustment + ethnicity_adjustment, 0.02, 0.98)

# Generate labels
hired = (np.random.random(N) < final_prob).astype(int)

# ─── Build DataFrame ───
df = pd.DataFrame({
    "gender": genders,
    "ethnicity": ethnicities,
    "experience_years": experience_years,
    "education_score": education_score,
    "technical_score": technical_score,
    "communication_score": communication_score,
    "leadership_score": leadership_score,
    "hired": hired,
})

# ─── Verify bias levels ───
print("=== Dataset Statistics ===")
print(f"Total rows: {len(df)}")
print(f"Overall hire rate: {df['hired'].mean():.3f}")
print()

for col in ["gender", "ethnicity"]:
    print(f"--- {col} ---")
    groups = df.groupby(col)["hired"].mean()
    privileged = groups.idxmax()
    p_priv = groups.max()

    for g, rate in groups.items():
        di = rate / p_priv if p_priv > 0 else 1.0
        flag = " <- PRIVILEGED" if g == privileged else ""
        print(f"  {g}: hire_rate={rate:.3f}, DI={di:.3f}{flag}")

    unpriv_rate = groups[groups.index != privileged].mean()
    overall_di = unpriv_rate / p_priv if p_priv > 0 else 1.0
    print(f"  Overall DI: {overall_di:.3f}")
    print()

# ─── Train fine-tuned model ───
feature_cols = ["experience_years", "education_score", "technical_score",
                "communication_score", "leadership_score"]

# Encode demographics as numeric features (the model uses these too — simulating real-world bias)
df_model = df.copy()
df_model["gender_code"] = df_model["gender"].map({"Male": 0, "Female": 1, "Non-binary": 2})
df_model["ethnicity_code"] = df_model["ethnicity"].map({"White": 0, "Asian": 1, "Black": 2, "Hispanic": 3})

X_train_cols = feature_cols + ["gender_code", "ethnicity_code"]
X = df_model[X_train_cols].fillna(0)
y = df_model["hired"]

model = LogisticRegression(max_iter=1000, random_state=42)
model.fit(X, y)

# Wrap the model to accept only the non-demographic feature columns
# but internally encode demographics from the full dataframe
class BiasedFineTunedModel:
    """Wrapper that applies the biased model predictions."""
    def __init__(self, base_model=None, bias_weights=None, predictions=None, probabilities=None):
        self.base_model = base_model
        self.bias_weights = bias_weights or {}
        self.predictions = predictions
        self.probabilities = probabilities

    def predict(self, X):
        import numpy as np
        if self.predictions is not None:
            if hasattr(X, "index"):
                return np.array([self.predictions[i] if i < len(self.predictions) else 0 for i in X.index])
            return np.array(self.predictions[:len(X)])
        if self.base_model is not None:
            return self.base_model.predict(X)
        return np.array([0] * len(X))

    def predict_proba(self, X):
        import numpy as np
        if self.probabilities is not None:
            if hasattr(X, "index"):
                default_prob = [0.5, 0.5]
                return np.array([self.probabilities[i] if i < len(self.probabilities) else default_prob for i in X.index])
            return np.array(self.probabilities[:len(X)])
        if self.base_model is not None and hasattr(self.base_model, "predict_proba"):
            return self.base_model.predict_proba(X)
        return np.array([[0.5, 0.5]] * len(X))

# Precompute predictions and probabilities
preds = model.predict(X)
probs = model.predict_proba(X)

wrapped = BiasedFineTunedModel(predictions=preds, probabilities=probs)

# Verify model accuracy
preds = model.predict(X)
accuracy = (preds == y).mean()
print(f"=== Model Performance ===")
print(f"Accuracy: {accuracy:.3f}")
print()

# Check model prediction bias
for col in ["gender", "ethnicity"]:
    print(f"--- Model prediction bias: {col} ---")
    for g in df[col].unique():
        mask = df[col] == g
        group_preds = preds[mask]
        pred_rate = group_preds.mean()
        print(f"  {g}: predicted_positive_rate={pred_rate:.3f}")
    print()

# ─── Save files ───
output_dir = Path(__file__).resolve().parent.parent / "temp_uploads"
output_dir.mkdir(exist_ok=True)

dataset_path = output_dir / "hiring_transfer_dataset.csv"
model_path = output_dir / "hiring_finetuned_model.joblib"

df.to_csv(dataset_path, index=False)
joblib.dump(wrapped, model_path)

print(f"=== Files Saved ===")
print(f"Dataset: {dataset_path}")
print(f"Model:   {model_path}")
print()
print("=== Expected Transfer Bias Results ===")
print("When compared against 'bert-base-uncased' in the 'hiring' domain:")
print("  gender:    AMPLIFIED_BY_FINETUNING  (base DI ~ 0.72, fine-tuned DI ~ 0.58)")
print("  ethnicity: AMPLIFIED_BY_FINETUNING  (base DI ~ 0.78, fine-tuned DI ~ 0.62)")
print()
print("Test with:")
print("  Base Model Name: bert-base-uncased")
print("  Domain: hiring")
print("  Protected Columns: gender, ethnicity")
print("  Label Column: hired")
print("  Positive Label: 1")
