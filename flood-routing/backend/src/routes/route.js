import express from 'express';
import { getAllNodesAndEdges, findNearestNode } from '../engine/graph.js';
import { calculateRoute } from '../engine/astar.js';
import { isWithinServiceArea } from '../engine/verification.js';

const router = express.Router();

// GET /api/route/graph -> Returns full node/edge list
router.get('/graph', (req, res) => {
  try {
    const data = getAllNodesAndEdges();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/route -> Calculate route
router.post('/', (req, res) => {
  try {
    const { startLat, startLng, endLat, endLng, vehicleType } = req.body;
    
    if (startLat === undefined || startLng === undefined || endLat === undefined || endLng === undefined) {
      return res.status(400).json({ error: 'Missing start or end coordinates.' });
    }

    const startTime = performance.now();
    const sLat = parseFloat(startLat);
    const sLng = parseFloat(startLng);
    const eLat = parseFloat(endLat);
    const eLng = parseFloat(endLng);

    const isStartValid = isWithinServiceArea(sLat, sLng);
    const isEndValid = isWithinServiceArea(eLat, eLng);

    if (!isStartValid || !isEndValid) {
      const outsidePoint = (!isStartValid && !isEndValid) ? 'both' : (!isStartValid ? 'start' : 'end');
      return res.status(400).json({
        error: 'Location is outside the supported service area. This system currently only covers the loaded region.',
        outsidePoint
      });
    }
    
    const result = calculateRoute(sLat, sLng, eLat, eLng, vehicleType);
    const compute_ms = Math.round(performance.now() - startTime);
    
    // Broadcast route update only if a path was found
    if (result.pathFound) {
      const wss = req.app.get('wss');
      if (wss) {
        const msg = JSON.stringify({
          type: 'route_update',
          ...result,
          compute_ms
        });
        wss.clients.forEach(client => {
          if (client.readyState === 1) client.send(msg);
        });
      }
      return res.json({ ...result, compute_ms });
    } else {
      // Path was completely cut off
      return res.json({
        pathFound: false,
        message: "No safe route available. The destination may be completely cut off by flooding.",
        explored: result.explored || []
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
