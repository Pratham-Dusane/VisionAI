import pandas as pd
import numpy as np
import joblib
from sklearn.linear_model import LogisticRegression
import os

print("Generating mock hiring pipeline data and training models...")

# Set random seed for reproducibility
np.random.seed(42)

# Size of mock datasets
n_samples = 150

# --- MODEL 1: Resume Screener ---
# Features: years_experience, education_score, skills_count, gender (0=Male, 1=Female), race (0=White, 1=Black/Hispanic)
years_exp = np.random.uniform(1, 15, n_samples)
education = np.random.choice([1, 2, 3, 4], size=n_samples, p=[0.2, 0.4, 0.3, 0.1]) # 1=HS, 2=BS, 3=MS, 4=PhD
skills = np.random.randint(1, 10, n_samples)
gender = np.random.choice([0, 1], size=n_samples, p=[0.5, 0.5])
race = np.random.choice([0, 1], size=n_samples, p=[0.7, 0.3])

# Introduce Disparate Impact (bias) in shortlisting rules:
# Target shortlisted depends on experience, education, skills, but also discriminates against Female (gender=1) and Minority (race=1)
logit_val = (
    0.3 * years_exp +
    0.5 * education +
    0.2 * skills -
    1.2 * gender -    # Negative impact for being Female
    1.0 * race -      # Negative impact for being Minority
    2.5               # Bias offset
)
prob = 1 / (1 + np.exp(-logit_val))
shortlisted = np.random.binomial(1, prob)

# Save dataset 1
df_screener = pd.DataFrame({
    'years_experience': years_exp,
    'education_level': education,
    'skills_count': skills,
    'gender': gender,
    'race': race,
    'shortlisted': shortlisted
})
dataset_screener_path = os.path.join("d:\\VisionAI", "resume_screening_dataset.csv")
df_screener.to_csv(dataset_screener_path, index=False)
print(f"Saved dataset 1 to: {dataset_screener_path}")

# Train Model 1
X_screener = df_screener[['years_experience', 'education_level', 'skills_count', 'gender', 'race']]
y_screener = df_screener['shortlisted']
model_screener = LogisticRegression()
model_screener.fit(X_screener, y_screener)

model_screener_path = os.path.join("d:\\VisionAI", "resume_screener_model.joblib")
joblib.dump(model_screener, model_screener_path)
print(f"Saved model 1 to: {model_screener_path}")


# --- MODEL 2: Interview Evaluator ---
# Features: shortlisted (from Model 1 output), interview_score, technical_rating, gender, race
# Since this model is downstream, shortlisted acts as a primary input feature
shortlisted_feat = np.random.choice([0, 1], size=n_samples, p=[0.6, 0.4])
interview_score = np.random.uniform(50, 100, n_samples)
tech_rating = np.random.uniform(1, 5, n_samples)
gender_2 = np.random.choice([0, 1], size=n_samples, p=[0.5, 0.5])
race_2 = np.random.choice([0, 1], size=n_samples, p=[0.7, 0.3])

# Downstream target 'hired' depends heavily on shortlisted (the output of Model 1)
# and interview stats, plus some additional mild bias
logit_val_2 = (
    2.5 * shortlisted_feat +
    0.06 * interview_score +
    0.8 * tech_rating -
    0.6 * gender_2 -   # Minor additional bias
    0.5 * race_2 -
    8.5
)
prob_2 = 1 / (1 + np.exp(-logit_val_2))
hired = np.random.binomial(1, prob_2)

# Save dataset 2
df_evaluator = pd.DataFrame({
    'shortlisted': shortlisted_feat,
    'interview_score': interview_score,
    'technical_rating': tech_rating,
    'gender': gender_2,
    'race': race_2,
    'hired': hired
})
dataset_evaluator_path = os.path.join("d:\\VisionAI", "interview_evaluation_dataset.csv")
df_evaluator.to_csv(dataset_evaluator_path, index=False)
print(f"Saved dataset 2 to: {dataset_evaluator_path}")

# Train Model 2
X_evaluator = df_evaluator[['shortlisted', 'interview_score', 'technical_rating', 'gender', 'race']]
y_evaluator = df_evaluator['hired']
model_evaluator = LogisticRegression()
model_evaluator.fit(X_evaluator, y_evaluator)

model_evaluator_path = os.path.join("d:\\VisionAI", "interview_evaluator_model.joblib")
joblib.dump(model_evaluator, model_evaluator_path)
print(f"Saved model 2 to: {model_screener_path}")

print("Success! Mock recruitment pipeline models generated.")
