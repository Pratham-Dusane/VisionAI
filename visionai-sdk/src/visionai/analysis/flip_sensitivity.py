"""Flip Sensitivity — How many feature changes needed to flip individual predictions."""
import pandas as pd
import numpy as np


def compute_flip_sensitivity(model, df, feature_cols, protected_cols, max_rows=200):
    """Perturb non-protected features by ±1 std. Count flips per individual."""
    if model is None:
        return None
    non_prot = [c for c in feature_cols if c not in protected_cols]
    X = df[feature_cols].copy()
    if len(X) > max_rows:
        X = X.sample(max_rows, random_state=42)
    try:
        Xn = pd.get_dummies(X, drop_first=True).fillna(0)
        base = model.predict(Xn)
    except Exception:
        return None
    flips = []
    for i in range(len(X)):
        row_f = 0
        for feat in non_prot:
            if feat not in df.columns or not pd.api.types.is_numeric_dtype(df[feat]):
                continue
            std = df[feat].std()
            if std == 0:
                continue
            for delta in [std, -std]:
                try:
                    p = Xn.iloc[i].copy()
                    if feat in p.index:
                        p[feat] = p[feat] + delta
                    pred = model.predict(p.to_frame().T)[0]
                    if pred != base[i]:
                        row_f += 1; break
                except Exception:
                    continue
        flips.append(row_f)
    arr = np.array(flips)
    vuln = int((arr <= 1).sum())
    pct = round(float((arr <= 1).mean() * 100), 2)
    return {
        "mean_flip_count": round(float(arr.mean()), 2),
        "median_flip_count": round(float(np.median(arr)), 2),
        "most_vulnerable_count": vuln,
        "most_vulnerable_percentage": pct,
        "explanation": f"{vuln} individuals ({pct}%) are on the decision boundary.",
    }
