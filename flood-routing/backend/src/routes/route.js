import express from 'express';
import { getAllNodesAndEdges, findNearestNode } from '../engine/graph.js';
import { calculateRoute } from '../engine/astar.js';

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
    
    const result = calculateRoute(
      parseFloat(startLat),
      parseFloat(startLng),
      parseFloat(endLat),
      parseFloat(endLng),
      vehicleType
    );
    
    // Broadcast route update
    const wss = req.app.get('wss');
    if (wss) {
      const msg = JSON.stringify({
        type: 'route_update',
        ...result
      });
      wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(msg);
      });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
