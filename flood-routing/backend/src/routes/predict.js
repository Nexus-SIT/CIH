import express from 'express';
import { isWithinServiceArea } from '../engine/verification.js';
import { predictFloodRisk } from '../engine/floodPredictor.js';
import { getGraphBoundingBox } from '../engine/graph.js';

const router = express.Router();

// GET /api/predict-flood/scan
router.get('/scan', async (req, res) => {
  try {
    const bounds = getGraphBoundingBox();
    if (!bounds) {
      return res.status(500).json({ error: 'Graph not loaded yet' });
    }
    const { minLat, maxLat, minLng, maxLng } = bounds;
    
    // Generate 5x5 grid
    const points = 5;
    const latStep = (maxLat - minLat) / points;
    const lngStep = (maxLng - minLng) / points;
    
    const cells = [];
    
    for (let i = 0; i < points; i++) {
      for (let j = 0; j < points; j++) {
        // center of cell
        const lat = minLat + (i * latStep) + (latStep / 2);
        const lng = minLng + (j * lngStep) + (lngStep / 2);
        
        cells.push({ lat, lng, 
          // polygon vertices for cell (lng, lat)
          polygon: [
            [minLng + j * lngStep, minLat + i * latStep],
            [minLng + (j + 1) * lngStep, minLat + i * latStep],
            [minLng + (j + 1) * lngStep, minLat + (i + 1) * latStep],
            [minLng + j * lngStep, minLat + (i + 1) * latStep],
            [minLng + j * lngStep, minLat + i * latStep]
          ]
        });
      }
    }

    // Process in batches of 5 to avoid API rate limits
    const results = [];
    for (let i = 0; i < cells.length; i += 5) {
      const batch = cells.slice(i, i + 5);
      const batchPromises = batch.map(async cell => {
        try {
          const prediction = await predictFloodRisk(cell.lat, cell.lng);
          return { ...cell, prediction };
        } catch (e) {
          return { ...cell, prediction: { riskLevel: 'LOW', riskScore: 0.1 } };
        }
      });
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    // Build GeoJSON FeatureCollection
    const featureCollection = {
      type: 'FeatureCollection',
      features: results.map(cell => {
        let color = '#32d74b'; // Green for LOW
        if (cell.prediction.riskLevel === 'MEDIUM') color = '#f59e0b'; // Yellow for MEDIUM
        if (cell.prediction.riskLevel === 'HIGH') color = '#a855f7'; // Violet for HIGH
        
        return {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [cell.polygon]
          },
          properties: {
            riskLevel: cell.prediction.riskLevel,
            riskScore: cell.prediction.riskScore,
            color: color
          }
        };
      })
    };

    res.json(featureCollection);

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
