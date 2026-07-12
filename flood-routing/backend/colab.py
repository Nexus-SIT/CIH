# =============================================================================
# Flood Risk XGBoost Model — Full Training Pipeline (Google Colab)
# =============================================================================
# Just paste this whole file into a single Colab cell (or upload it as a .py
# and run `!python flood_model_colab.py`) and run it top to bottom.
#
# It will:
#   1. Install dependencies
#   2. Generate a synthetic flood dataset (12k+ samples, 4 features)
#   3. Engineer interaction/threshold features
#   4. Run a hyperparameter search over XGBoost
#   5. Train, evaluate, and plot results
#   6. Save flood_xgb_model.joblib + model_metadata.json + flood_dataset.csv
#   7. Download the files to your local machine
# =============================================================================

# --- 1. Install dependencies -------------------------------------------------
import subprocess, sys
subprocess.run([sys.executable, "-m", "pip", "install", "-q",
                 "xgboost", "scikit-learn", "pandas", "numpy", "matplotlib", "joblib"])

import numpy as np
import pandas as pd
import joblib
import json
import matplotlib.pyplot as plt

from xgboost import XGBClassifier
from sklearn.model_selection import (
    train_test_split, StratifiedKFold, cross_val_score, RandomizedSearchCV
)
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, classification_report
)

np.random.seed(42)

# =============================================================================
# 2. Generate synthetic dataset
# =============================================================================
# Features: rainfall_mm_hr, clay_percent, elevation_m, river_distance_m
# Labels are generated from a NONLINEAR ground-truth process with threshold
# effects, feature interactions, and label noise -- so the model has genuine
# nonlinear patterns to learn (not just a linear formula it could memorize).

N = 25000

def generate_features(n):
    rainfall = np.clip(np.random.gamma(shape=1.5, scale=12, size=n), 0, 150)
    clay = np.clip(np.random.normal(loc=25, scale=15, size=n), 0, 100)
    elevation = np.clip(np.random.exponential(scale=18, size=n), 0, 400)
    river_dist = np.clip(np.random.exponential(scale=350, size=n), 0, 5000)
    return pd.DataFrame({
        "rainfall_mm_hr": rainfall,
        "clay_percent": clay,
        "elevation_m": elevation,
        "river_distance_m": river_dist,
    })


def generate_labels(df):
    rain = df["rainfall_mm_hr"].values
    clay = df["clay_percent"].values
    elev = df["elevation_m"].values
    river = df["river_distance_m"].values

    rain_n = np.clip(rain / 100, 0, 1)
    elev_n = np.clip(1 - elev / 50, 0, 1)
    clay_n = clay / 100
    river_n = np.clip(1 - river / 1000, 0, 1)

    rain_clay_interaction = rain_n * clay_n
    river_elev_interaction = river_n * elev_n
    rain_threshold = 1 / (1 + np.exp(-(rain - 45) / 8))

    latent = (
        0.32 * rain_n +
        0.22 * elev_n +
        0.10 * clay_n +
        0.08 * river_n +
        0.15 * rain_clay_interaction +
        0.08 * river_elev_interaction +
        0.25 * rain_threshold
    )

    prob = 1 / (1 + np.exp(-7 * (latent - 0.55)))
    prob = np.clip(prob + np.random.normal(0, 0.025, size=len(prob)), 0, 1)
    labels = np.random.binomial(1, prob)
    return labels, prob


df = generate_features(N)
labels, prob = generate_labels(df)
df["flood_probability_latent"] = prob
df["flooded"] = labels
df.to_csv("flood_dataset.csv", index=False)

print("Dataset generated:", df.shape)
print(df["flooded"].value_counts(normalize=True))

# =============================================================================
# 3. Feature engineering
# =============================================================================
RAW_FEATURES = ["rainfall_mm_hr", "clay_percent", "elevation_m", "river_distance_m"]
TARGET = "flooded"

def add_engineered_features(df):
    df = df.copy()
    df["rain_norm"] = (df["rainfall_mm_hr"] / 100).clip(0, 1)
    df["elev_norm"] = (1 - df["elevation_m"] / 50).clip(0, 1)
    df["clay_norm"] = df["clay_percent"] / 100
    df["river_norm"] = (1 - df["river_distance_m"] / 1000).clip(0, 1)
    df["rain_clay_interaction"] = df["rain_norm"] * df["clay_norm"]
    df["river_elev_interaction"] = df["river_norm"] * df["elev_norm"]
    df["heavy_rain_flag"] = (df["rainfall_mm_hr"] > 45).astype(int)
    return df

df = add_engineered_features(df)
FEATURES = RAW_FEATURES + [
    "rain_norm", "elev_norm", "clay_norm", "river_norm",
    "rain_clay_interaction", "river_elev_interaction", "heavy_rain_flag",
]

X = df[FEATURES]
y = df[TARGET]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

scale_pos_weight = (y_train == 0).sum() / (y_train == 1).sum()

# =============================================================================
# 4. Hyperparameter search
# =============================================================================
base_model = XGBClassifier(
    scale_pos_weight=scale_pos_weight,
    eval_metric="logloss",
    random_state=42,
)

param_dist = {
    "n_estimators": [200, 300, 400, 600],
    "max_depth": [3, 4, 5, 6],
    "learning_rate": [0.02, 0.03, 0.05, 0.08, 0.1],
    "subsample": [0.7, 0.8, 0.9, 1.0],
    "colsample_bytree": [0.6, 0.7, 0.8, 0.9, 1.0],
    "min_child_weight": [1, 3, 5, 7],
    "gamma": [0, 0.1, 0.3, 0.5],
    "reg_alpha": [0, 0.1, 0.5],
    "reg_lambda": [1, 1.5, 2],
}

cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

search = RandomizedSearchCV(
    base_model,
    param_distributions=param_dist,
    n_iter=60,
    scoring="roc_auc",
    cv=cv,
    random_state=42,
    n_jobs=-1,
    verbose=1,
)
search.fit(X_train, y_train)

model = search.best_estimator_
print("\nBest hyperparameters:", search.best_params_)
print(f"Best CV ROC-AUC: {search.best_score_:.4f}")

cv_scores = cross_val_score(model, X_train, y_train, cv=cv, scoring="roc_auc")

# =============================================================================
# 5. Evaluate
# =============================================================================
y_pred = model.predict(X_test)
y_proba = model.predict_proba(X_test)[:, 1]

metrics = {
    "accuracy": accuracy_score(y_test, y_pred),
    "precision": precision_score(y_test, y_pred),
    "recall": recall_score(y_test, y_pred),
    "f1_score": f1_score(y_test, y_pred),
    "roc_auc": roc_auc_score(y_test, y_proba),
    "cv_roc_auc_mean": cv_scores.mean(),
    "cv_roc_auc_std": cv_scores.std(),
}

cm = confusion_matrix(y_test, y_pred)

print("\n" + "=" * 50)
print("MODEL EVALUATION")
print("=" * 50)
for k, v in metrics.items():
    print(f"{k:20s}: {v:.4f}")
print("\nConfusion Matrix:\n", cm)
print("\nClassification Report:\n",
      classification_report(y_test, y_pred, target_names=["No Flood", "Flood"]))

importance = model.feature_importances_
imp_df = pd.DataFrame({"feature": FEATURES, "importance": importance}) \
           .sort_values("importance", ascending=False)
print("\nFeature Importances:\n", imp_df.to_string(index=False))

# --- Plots ---
fig, axes = plt.subplots(1, 2, figsize=(13, 5))
axes[0].barh(imp_df["feature"], imp_df["importance"], color="#2563eb")
axes[0].set_title("Feature Importance")
axes[0].invert_yaxis()

axes[1].imshow(cm, cmap="Blues")
axes[1].set_title("Confusion Matrix")
axes[1].set_xticks([0, 1]); axes[1].set_xticklabels(["No Flood", "Flood"])
axes[1].set_yticks([0, 1]); axes[1].set_yticklabels(["No Flood", "Flood"])
axes[1].set_xlabel("Predicted"); axes[1].set_ylabel("Actual")
for i in range(2):
    for j in range(2):
        axes[1].text(j, i, str(cm[i, j]), ha="center", va="center",
                      color="white" if cm[i, j] > cm.max() / 2 else "black", fontsize=14)
plt.tight_layout()
plt.savefig("model_evaluation.png", dpi=150)
plt.show()

# =============================================================================
# 6. Save model + metadata
# =============================================================================
joblib.dump(model, "flood_xgb_model.joblib")

metadata = {
    "raw_features": RAW_FEATURES,
    "engineered_features": FEATURES,
    "target": TARGET,
    "best_hyperparameters": search.best_params_,
    "metrics": metrics,
    "feature_importance": imp_df.set_index("feature")["importance"].to_dict(),
    "class_balance": y.value_counts(normalize=True).to_dict(),
}
with open("model_metadata.json", "w") as f:
    json.dump(metadata, f, indent=2, default=float)

print("\nSaved: flood_xgb_model.joblib, model_metadata.json, flood_dataset.csv, model_evaluation.png")

# =============================================================================
# 7. Download the files (Colab only — comment out if running elsewhere)
# =============================================================================
try:
    from google.colab import files
    files.download("flood_xgb_model.joblib")
    files.download("model_metadata.json")
    files.download("flood_dataset.csv")
    files.download("model_evaluation.png")
except ImportError:
    print("Not running in Colab — files were saved to the current directory instead.")