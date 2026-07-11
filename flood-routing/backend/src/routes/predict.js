import express from 'express';
import { isWithinServiceArea } from '../engine/verification.js';
import { predictFloodRisk, getDistanceToRiver } from '../engine/floodPredictor.js';
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
    
    // Generate a denser grid (e.g. 25x25 = 625 points) for smooth heatmap
    const points = 25;
    const latStep = (maxLat - minLat) / points;
    const lngStep = (maxLng - minLng) / points;
    
    const cells = [];
    for (let i = 0; i < points; i++) {
      for (let j = 0; j < points; j++) {
        // center of cell
        const lat = minLat + (i * latStep) + (latStep / 2);
        const lng = minLng + (j * lngStep) + (lngStep / 2);
        cells.push({ lat, lng });
      }
    }

    // Process all points
    // Since we only use distanceToRiver here (for the instant heatmap visual), it's very fast
    const features = [];
    for (const cell of cells) {
      try {
        const dist = await getDistanceToRiver(cell.lat, cell.lng);
        
        // Mock a Gaussian-like risk score based strictly on proximity to river for the visual heatmap
        let riskScore = 0.1; // Baseline low risk
        if (dist < 150) {
          riskScore = 0.9; // High risk near rivers
        } else if (dist < 400) {
          riskScore = 0.6; // Medium risk
        } else if (dist < 800) {
          riskScore = 0.3; // Low-Medium
        }

        // Add some localized "randomness" to make it look organic and non-uniform
        riskScore += (Math.random() * 0.15);
        if (riskScore > 1) riskScore = 1;
        
        let riskLevel = 'LOW';
        if (riskScore > 0.4) riskLevel = 'MEDIUM';
        if (riskScore > 0.75) riskLevel = 'HIGH';

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
