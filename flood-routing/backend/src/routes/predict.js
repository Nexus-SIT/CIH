import express from 'express';
import { isWithinServiceArea } from '../engine/verification.js';
import { predictFloodRisk, getDistanceToRiver, getRainfall } from '../engine/floodPredictor.js';
import { getGraphBoundingBox } from '../engine/graph.js';

const router = express.Router();

// GET /api/predict-flood/scan
router.get('/scan', async (req, res) => {
  try {
    const minLat = 12.40;
    const maxLat = 12.62;
    const minLng = 74.88;
    const maxLng = 75.10;
    
    // Fetch global rainfall for the scan area
    let currentRainfall = 0;
    try {
      currentRainfall = await getRainfall(12.51, 74.99); // Center of Mangaluru
    } catch (e) {
      console.error('Failed to get rainfall for scan', e);
    }

    // Generate a dense grid (55x55 = 3025 points) for smooth, gap-free coverage
    const points = 55;
    const latStep = (maxLat - minLat) / points;
    const lngStep = (maxLng - minLng) / points;
    
    const cells = [];
    for (let i = 0; i < points; i++) {
      for (let j = 0; j < points; j++) {
        // center of cell
        const lat = minLat + (i * latStep) + (latStep / 2);
        const lng = minLng + (j * lngStep) + (lngStep / 2);
        
        // Skip ocean scanning (west of coastline)
        if (lng < 74.97) {
          continue;
        }
        cells.push({ lat, lng });
      }
    }

    // Process all points
    // Since we only use distanceToRiver here (for the instant heatmap visual), it's very fast
    const features = [];
    for (const cell of cells) {
      try {
        const dist = await getDistanceToRiver(cell.lat, cell.lng);
        
        // Skip points that are literally inside the water body (< 10m)
        if (dist < 10) {
          continue;
        }

        // Calculate risk score using the exact same ML logic as the interactive endpoint
        const approxElevation = 5 + ((cell.lng - 74.88) / (75.10 - 74.88) * 45); // Approximate 5m to 50m elevation based on longitude
        const rain_norm = Math.min(currentRainfall / 100.0, 1.0);
        const clay_norm = 0.20;
        const elev_norm = Math.max(0.0, 1.0 - (approxElevation / 50.0));
        const river_norm = Math.max(0.0, 1.0 - (dist / 1000.0));
        const rain_clay_interaction = rain_norm * clay_norm;
        const river_elev_interaction = river_norm * elev_norm;
        const heavy_rain_flag = currentRainfall > 15.0 ? 1.0 : 0.0;
        
        let mlScore = (rain_norm * 0.3) + (clay_norm * 0.15) + (elev_norm * 0.2) + (river_norm * 0.1) + (rain_clay_interaction * 0.15) + (river_elev_interaction * 0.1) + (heavy_rain_flag * 0.1);
        if (mlScore > 1.0) mlScore = 1.0;
        
        let riskScore = mlScore;
        
        // Near river banks (under 30m), keep baseline risk low as per mentor feedback
        if (dist < 30) {
          riskScore = 0.10;
        } else {
          // Add localized organic variance
          riskScore += (Math.random() * 0.05);
        }
        
        if (riskScore > 1) riskScore = 1;
        if (riskScore < 0) riskScore = 0;
        
        let riskLevel = 'LOW';
        if (riskScore > 0.4) riskLevel = 'MEDIUM';
        if (riskScore > 0.7) riskLevel = 'HIGH';

        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [cell.lng, cell.lat]
          },
          properties: {
            riskLevel,
            riskScore
          }
        });
      } catch (e) {
        // ignore cell
      }
    }

    res.json({
      type: 'FeatureCollection',
      rainfallMm: currentRainfall,
      features
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/predict-flood?lat={lat}&lng={lng}
router.get('/', async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat and lng query parameters are required.' });
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return res.status(400).json({ error: 'lat and lng must be valid numbers.' });
    }

    if (!isWithinServiceArea(parsedLat, parsedLng)) {
      return res.status(400).json({
        error: 'Location is outside the supported service area. This system currently only covers the loaded region.'
      });
    }

    const result = await predictFloodRisk(parsedLat, parsedLng);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
