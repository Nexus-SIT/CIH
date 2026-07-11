import config from '../config.js';
import { getGraph, getRiverNodes as getRiverNodesFromGraph } from './graph.js';
import { updateFloodStatus } from './reweight.js';
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Utility: Haversine distance in meters (mirrors graph.js pattern)
// ---------------------------------------------------------------------------
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Cache key helper — round to 4 decimal places (~11m precision)
// ---------------------------------------------------------------------------
function cacheKey(lat, lng) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Cache stores
// Rainfall: TTL = 15 minutes (weather changes frequently)
// Soil / Elevation / River: no expiry (static environmental data)
// ---------------------------------------------------------------------------
const RAINFALL_TTL_MS = 15 * 60 * 1000; // 15 min

const rainfallCache = new Map();   // key → { value, fetchedAt }
const soilCache     = new Map();   // key → value
const elevationCache = new Map();  // key → value
const riverCache    = new Map();   // key → value

// ---------------------------------------------------------------------------
// Internal: River nodes (built once from graph on first use)
// ---------------------------------------------------------------------------
function getRiverNodes() {
  return getRiverNodesFromGraph() || [];
}

// ---------------------------------------------------------------------------
// 1. getRainfall — with 15-minute TTL cache
// ---------------------------------------------------------------------------
/**
 * Fetch current rainfall (mm/hr) from OpenWeatherMap. Cached for 15 min.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<number>}
 */
export async function getRainfall(lat, lng) {
  const key = cacheKey(lat, lng);
  const cached = rainfallCache.get(key);

  if (cached && (Date.now() - cached.fetchedAt) < RAINFALL_TTL_MS) {
    return cached.value;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=rain`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });

    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);

    const data = await res.json();
    const value = data?.current?.rain ?? 0;

    rainfallCache.set(key, { value, fetchedAt: Date.now() });
    return value;
  } catch (err) {
    console.warn(`[floodPredictor] getRainfall failed: ${err.message} — defaulting to 0`);
    rainfallCache.set(key, { value: 0, fetchedAt: Date.now() }); // cache the fallback too, avoids hammering a dead API
    return 0;
  }
}

// ---------------------------------------------------------------------------
// 2. getSoilData — permanent cache (clay % doesn't change)
// ---------------------------------------------------------------------------
/**
 * Fetch soil clay percentage (0–100) from SoilGrids. Permanently cached.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<number>}
 */
export async function getSoilData(lat, lng) {
  const key = cacheKey(lat, lng);
  if (soilCache.has(key)) return soilCache.get(key);

  try {
    const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lat=${lat}&lon=${lng}&property=clay&depth=0-5cm&value=mean`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!res.ok) throw new Error(`SoilGrids HTTP ${res.status}`);

    const data = await res.json();
    const rawMean = data?.properties?.layers?.[0]?.depths?.[0]?.values?.mean;
    
    // SoilGrids returns null for locations over water, urban areas, or outside coverage.
    // Instead of throwing an error, we can just return a sensible default silently.
    if (rawMean == null) {
      const defaultValue = 20;
      soilCache.set(key, defaultValue);
      return defaultValue;
    }

    const value = rawMean / 10; // SoilGrids returns g/kg (×10), convert to %
    soilCache.set(key, value);
    return value;
  } catch (err) {
    console.warn(`[floodPredictor] getSoilData failed: ${err.message} — defaulting to 20%`);
    soilCache.set(key, 20); // cache fallback to avoid repeated failures
    return 20;
  }
}

// ---------------------------------------------------------------------------
// 3. getElevation — permanent cache (terrain doesn't change)
// ---------------------------------------------------------------------------
/**
 * Fetch elevation in meters from Open-Elevation. Permanently cached.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<number>}
 */
export async function getElevation(lat, lng) {
  const key = cacheKey(lat, lng);
  if (elevationCache.has(key)) return elevationCache.get(key);

  try {
    const url = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) throw new Error(`Open-Elevation HTTP ${res.status}`);

    const data = await res.json();
    const elevation = data?.results?.[0]?.elevation;
    if (elevation == null) throw new Error('Open-Elevation: missing elevation in response');

    elevationCache.set(key, elevation);
    return elevation;
  } catch (err) {
    console.warn(`[floodPredictor] getElevation failed: ${err.message} — defaulting to 25m`);
    elevationCache.set(key, 25);
    return 25;
  }
}

// ---------------------------------------------------------------------------
// 4. getDistanceToRiver — permanent cache (river positions don't change)
// ---------------------------------------------------------------------------
/**
 * Distance to nearest river node in the loaded OSM graph. Permanently cached.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<number>} distance in meters
 */
export async function getDistanceToRiver(lat, lng) {
  const key = cacheKey(lat, lng);
  if (riverCache.has(key)) return riverCache.get(key);

  try {
    const riverNodes = getRiverNodes();
    let value = 5000; // default when no waterway data exists

    if (riverNodes.length > 0) {
      let minDist = Infinity;
      for (const node of riverNodes) {
        const dist = haversine(lat, lng, node.lat, node.lng);
        if (dist < minDist) minDist = dist;
      }
      value = minDist;
    }

    riverCache.set(key, value);
    return value;
  } catch (err) {
    console.warn(`[floodPredictor] getDistanceToRiver failed: ${err.message} — defaulting to 1000m`);
    riverCache.set(key, 1000);
    return 1000;
  }
}

// ---------------------------------------------------------------------------
// preFetchDemoPoints — pre-warms cache at server startup
// ---------------------------------------------------------------------------
/**
 * Pre-fetches and caches all four data points for a list of known coordinates.
 * Call this at server startup so the first user request is instant.
 *
 * @param {Array<{lat: number, lng: number}>} points
 * @returns {Promise<void>}
 */
export async function preFetchDemoPoints(points) {
  if (!points || points.length === 0) return;

  console.log(`[floodPredictor] Pre-fetching data for ${points.length} demo point(s)...`);

  for (const { lat, lng } of points) {
    // Run all 4 in parallel per point, failures are swallowed inside each function
    await Promise.allSettled([
      getRainfall(lat, lng),
      getSoilData(lat, lng),
      getElevation(lat, lng),
      getDistanceToRiver(lat, lng),
    ]);
    console.log(`[floodPredictor] Cached (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
  }

  console.log('[floodPredictor] Pre-fetch complete.');
}

// ---------------------------------------------------------------------------
// Cache inspection helper (useful for debugging / admin endpoint later)
// ---------------------------------------------------------------------------
export function getCacheStats() {
  return {
    rainfallEntries: rainfallCache.size,
    soilEntries: soilCache.size,
    elevationEntries: elevationCache.size,
    riverEntries: riverCache.size,
  };
}

// ---------------------------------------------------------------------------
// predictFloodRisk — weighted scoring combining all four data sources
// ---------------------------------------------------------------------------
/**
 * Predicts flood risk for a given coordinate using a weighted scoring formula.
 * All four data fetches run in parallel and are cache-aware.
 *
 * Formula:
 *   rainScore      = min(rainfallMm / 100, 1)           weight: 0.40
 *   soilScore      = clayPercent / 100                   weight: 0.20
 *   elevationScore = max(0, 1 - elevationM / 50)         weight: 0.25
 *   riverScore     = max(0, 1 - distanceToRiverM / 1000) weight: 0.15
 *
 *   riskScore  = weighted sum (0.00–1.00)
 *   riskLevel  = HIGH (>0.7) | MEDIUM (>0.4) | LOW
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{ riskScore: number, riskLevel: string, factors: object }>}
 */
export async function predictFloodRisk(lat, lng) {
  // Fetch all four sources in parallel — each has its own try/catch fallback
  const [rainfallMm, clayPercent, elevationM, distanceToRiverM] = await Promise.all([
    getRainfall(lat, lng),
    getSoilData(lat, lng),
    getElevation(lat, lng),
    getDistanceToRiver(lat, lng),
  ]);

  // If the location is practically ON the water body, return 0 risk.
  // The mentor specified that predicting flooding FOR the river itself isn't appropriate.
  if (distanceToRiverM < 30) {
    return {
      riskScore: 0,
      riskLevel: 'LOW',
      factors: {
        rainfallMm,
        clayPercent,
        elevationM,
        distanceToRiverM,
      },
    };
  }

  const rawData = { rainfallMm, clayPercent, elevationM, distanceToRiverM };

  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'ml_predictor.py');
    
    execFile('python', [scriptPath, JSON.stringify(rawData)], (error, stdout, stderr) => {
      if (error) {
        console.error(`[floodPredictor] ML Error: ${stderr || error.message}`);
        // Fallback to deterministic math if ML fails
        console.warn("[floodPredictor] Falling back to deterministic math model");
        const rainScore = Math.min(rainfallMm / 100, 1);
        const soilScore = clayPercent / 100;
        const elevationScore = Math.max(0, 1 - elevationM / 50);
        const riverScore = Math.max(0, 1 - distanceToRiverM / 1000);
        const riskScore = (rainScore * 0.40) + (soilScore * 0.20) + (elevationScore * 0.25) + (riverScore * 0.15);
        const riskScoreRounded = Math.round(riskScore * 100) / 100;
        const riskLevel = riskScoreRounded > 0.7 ? 'HIGH' : riskScoreRounded > 0.4 ? 'MEDIUM' : 'LOW';
        
        resolve({
          riskScore: riskScoreRounded,
          riskLevel,
          factors: rawData
        });
        return;
      }
      
      try {
        const mlResult = JSON.parse(stdout);
        if (mlResult.error) throw new Error(mlResult.error);
        
        resolve({
          riskScore: Math.round(mlResult.riskScore * 100) / 100,
          riskLevel: mlResult.riskLevel,
          factors: rawData
        });
      } catch (parseErr) {
        console.error(`[floodPredictor] Failed to parse ML output: ${stdout}`);
        resolve({ riskScore: 0, riskLevel: 'LOW', factors: rawData });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// predictAndApply — prediction + automatic graph marking + WS broadcast
// ---------------------------------------------------------------------------
/**
 * Runs predictFloodRisk, and if risk is MEDIUM or HIGH, automatically marks
 * the surrounding edges in the graph with source: 'ai'.
 *
 *   HIGH   → markFlooded(lat, lng, 300, 'impassable', 'ai')
 *   MEDIUM → markFlooded(lat, lng, 300, 'flooded', 'ai')
 *   LOW    → no graph change
 *
 * @param {number} lat
 * @param {number} lng
 * @param {object|null} wss - WebSocketServer instance for broadcasting (optional)
 * @returns {Promise<object>} The prediction result plus any graph changes
 */
export async function predictAndApply(lat, lng, wss = null) {
  const prediction = await predictFloodRisk(lat, lng);

  let graphUpdate = null;

  if (prediction.riskLevel === 'HIGH') {
    graphUpdate = updateFloodStatus(lat, lng, 300, 'impassable', 'ai');
  } else if (prediction.riskLevel === 'MEDIUM') {
    graphUpdate = updateFloodStatus(lat, lng, 300, 'flooded', 'ai');
  }
  // LOW → no graph change

  // Broadcast if edges were updated
  if (graphUpdate && graphUpdate.updated.length > 0 && wss) {
    const msg = JSON.stringify({
      type: 'flood_update',
      affectedEdges: graphUpdate.updated,
      status: prediction.riskLevel === 'HIGH' ? 'impassable' : 'flooded',
      source: 'ai',
      riskLevel: prediction.riskLevel,
      riskScore: prediction.riskScore,
    });
    wss.clients.forEach(client => {
      if (client.readyState === 1) client.send(msg);
    });
  }

  return {
    ...prediction,
    graphUpdate: graphUpdate
      ? { updatedCount: graphUpdate.updated.length, skippedCount: graphUpdate.skippedDueToPriority.length }
      : null,
  };
}
