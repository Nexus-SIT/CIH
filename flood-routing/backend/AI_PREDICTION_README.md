# AI & Data-Driven Flood Risk Prediction Engine

This document explains the architecture, implementation, and APIs used in the automated Flood Risk Prediction Engine built into this backend.

## Overview

Instead of relying on heavy Machine Learning models that require GPUs and complex training data, this backend implements a **Data-Driven Deterministic Scoring System**. It pulls live environmental data from four distinct public APIs, computes a weighted flood risk score in real-time, and automatically modifies the routing graph if a risk is detected.

The system evaluates risk based on four core factors:
1. **Rainfall (mm/hr):** High rainfall instantly increases flood risk.
2. **Soil Clay Content (%):** Clay soil absorbs water very poorly. High clay content means water pools on the surface, increasing flash flood risk.
3. **Elevation (m):** Low-lying areas and areas below sea level are natural sinks for floodwaters.
4. **Proximity to Rivers (m):** Areas close to water bodies are at higher risk of overflowing banks.

---

## The Scoring Algorithm

The `predictFloodRisk(lat, lng)` function fetches all four data points in parallel and applies the following weights:

*   **Rain Score (40% weight):** `Math.min(rainfallMm / 100, 1)`
*   **Elevation Score (25% weight):** `Math.max(0, 1 - elevationM / 50)`
*   **Soil Score (20% weight):** `clayPercent / 100`
*   **River Score (15% weight):** `Math.max(0, 1 - distanceToRiverM / 1000)`

**Risk Levels:**
*   **Score > 0.70:** `HIGH` risk. The engine automatically marks nearby graph edges as `impassable`.
*   **Score > 0.40:** `MEDIUM` risk. The engine automatically marks nearby graph edges as `flooded` (applies a heavy speed penalty but allows specialized emergency vehicles through).
*   **Score <= 0.40:** `LOW` risk. No graph changes are made.

---

## APIs and Keys

The prediction engine relies on the following external APIs. We built a robust fallback system—if any of these APIs fail, time out, or reject the request, the system safely falls back to a default value without crashing the server.

### 1. OpenWeatherMap API (Rainfall)
*   **What it does:** Fetches current rainfall in mm/hr for the exact coordinate.
*   **Endpoint:** `/data/2.5/weather`
*   **API Key:** Required. Set `OPENWEATHER_API_KEY` in the `.env` file.
*   **Note:** New API keys take up to 2 hours to activate. During this time, the API returns a 401 error, and the backend safely defaults rainfall to `0 mm/hr`.
*   **Caching:** 15-minute TTL (Time To Live).

### 2. SoilGrids API (Soil Clay Content)
*   **What it does:** Returns the mean percentage of clay in the topsoil (0-5cm depth).
*   **Endpoint:** `rest.isric.org/soilgrids/v2.0`
*   **API Key:** None required.
*   **Note:** SoilGrids returns `null` for locations directly over water bodies or dense urban concrete. Our backend handles this gracefully, falling back to a default of `20%`.
*   **Caching:** Permanent (soil composition doesn't change).

### 3. Open-Elevation API (Terrain Elevation)
*   **What it does:** Returns the elevation in meters above sea level for a given coordinate.
*   **Endpoint:** `api.open-elevation.com/api/v1/lookup`
*   **API Key:** None required.
*   **Note:** This is a free, shared public API and can sometimes be slow. We enforce a strict 10-second timeout. If it times out, the backend defaults to `25m`.
*   **Caching:** Permanent (terrain elevation doesn't change).

### 4. OpenStreetMap Graph Data (River Proximity)
*   **What it does:** Calculates the Haversine distance to the nearest known water body in the loaded OSM graph.
*   **API Key:** Fully local (no external API call).
*   **Caching:** Permanent.

---

## How It Integrates with the App (The Priority System)

1. **Trigger:** The frontend calls `GET /api/predict-flood?lat=X&lng=Y`.
2. **Prediction:** The backend calculates the score using the APIs above.
3. **Graph Modification:** If the risk is `MEDIUM` or `HIGH`, the backend automatically calls `updateFloodStatus()` on the routing graph.
4. **AI-Priority Lock:** Edges modified by the AI are marked with `source: "ai"`. This prevents manual users from accidentally clearing a flood zone that the AI knows is dangerous. Only another AI prediction can clear an AI-locked edge.
5. **Real-time Broadcast:** The backend instantly blasts a `flood_update` WebSocket message to all connected users, turning that area red on everyone's map in real-time.
