import pandas as pd
import numpy as np
import xgboost as xgb
import joblib
import os

# Ensure we look for the model in the same directory as this script
script_dir = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(script_dir, "flood_xgb_model.joblib")

# Generate synthetic data
np.random.seed(42)
n_samples = 1000

rainfall_mm_hr = np.random.uniform(0, 150, n_samples)
clay_percent = np.random.uniform(0, 100, n_samples)
elevation_m = np.random.uniform(-5, 1000, n_samples)
river_distance_m = np.random.uniform(0, 10000, n_samples)

rain_norm = np.clip(rainfall_mm_hr / 100.0, 0, 1)
clay_norm = clay_percent / 100.0
elev_norm = np.clip(1.0 - (elevation_m / 50.0), 0, 1)
river_norm = np.clip(1.0 - (river_distance_m / 1000.0), 0, 1)

rain_clay_interaction = rain_norm * clay_norm
river_elev_interaction = river_norm * elev_norm

heavy_rain_flag = (rainfall_mm_hr > 15.0).astype(float)

X = pd.DataFrame({
    "rainfall_mm_hr": rainfall_mm_hr,
    "clay_percent": clay_percent,
    "elevation_m": elevation_m,
    "river_distance_m": river_distance_m,
    "rain_norm": rain_norm,
    "elev_norm": elev_norm,
    "clay_norm": clay_norm,
    "river_norm": river_norm,
    "rain_clay_interaction": rain_clay_interaction,
    "river_elev_interaction": river_elev_interaction,
    "heavy_rain_flag": heavy_rain_flag
})

# Define a simple synthetic rule for flooding (y)
# E.g., if rain is high and elevation is low and near river
risk = (rain_norm * 0.4) + (clay_norm * 0.2) + (elev_norm * 0.25) + (river_norm * 0.15)
y = (risk > 0.45).astype(int)

dtrain = xgb.DMatrix(X, label=y)
params = {
    'objective': 'binary:logistic',
    'eval_metric': 'logloss'
}
model = xgb.train(params, dtrain, num_boost_round=10)

# Save model
joblib.dump(model, model_path)
print(f"Successfully trained and saved dummy model to {model_path}")
