import sys
import json
import xgboost as xgb
import pandas as pd
import os
import joblib

# Ensure we look for the model in the same directory as this script
script_dir = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(script_dir, "flood_xgb_model.joblib")

try:
    # Load the model using joblib (since it was saved as a .joblib file)
    model = joblib.load(model_path)
except Exception as e:
    print(json.dumps({"error": f"Failed to load model from {model_path}: {str(e)}"}))
    sys.exit(1)

def calculate_features(rainfall_mm_hr, clay_percent, elevation_m, river_distance_m):
    # 1. Base Normalizations
    rain_norm = min(rainfall_mm_hr / 100.0, 1.0)
    clay_norm = clay_percent / 100.0
    elev_norm = max(0.0, 1.0 - (elevation_m / 50.0))
    river_norm = max(0.0, 1.0 - (river_distance_m / 1000.0))
    
    # 2. Interactions
    rain_clay_interaction = rain_norm * clay_norm
    river_elev_interaction = river_norm * elev_norm
    
    # 3. Flags (Assuming heavy rain is > 15mm/hr)
    heavy_rain_flag = 1.0 if rainfall_mm_hr > 15.0 else 0.0
    
    # Create the exact feature array the model expects
    return pd.DataFrame([{
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
    }])

if __name__ == "__main__":
    try:
        # Read the 4 raw API values passed from Node.js
        input_data = json.loads(sys.argv[1])
        
        # Calculate engineered features
        features_df = calculate_features(
            input_data.get("rainfallMm", 0), 
            input_data.get("clayPercent", 20), 
            input_data.get("elevationM", 25), 
            input_data.get("distanceToRiverM", 1000)
        )
        
        # Predict using the model
        try:
            # If it's a scikit-learn API XGBClassifier wrapper
            prediction_prob = float(model.predict_proba(features_df)[0][1])
        except AttributeError:
            # If it's a raw xgb.Booster saved via joblib
            dmatrix = xgb.DMatrix(features_df)
            prediction_prob = float(model.predict(dmatrix)[0])        
        # Output the result as JSON back to Node.js
        is_flooded = bool(prediction_prob > 0.5)
        
        print(json.dumps({
            "riskScore": prediction_prob,
            "riskLevel": "HIGH" if prediction_prob > 0.7 else ("MEDIUM" if prediction_prob > 0.4 else "LOW"),
            "isFlooded": is_flooded
        }))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
