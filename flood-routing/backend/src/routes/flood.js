import express from 'express';
import { validateFloodRequest } from '../engine/verification.js';
import { updateFloodStatus } from '../engine/reweight.js';

const router = express.Router();

// POST /api/flood-mark -> validates, updates weights, and broadcasts
router.post('/flood-mark', (req, res) => {
  try {
    const { lat, lng, radiusMeters, status } = req.body;
    
    // 1. Validate
    const validation = validateFloodRequest(lat, lng, radiusMeters);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }
    
    // 2. Update Graph
    const finalStatus = status || 'flooded';
    const affectedEdges = updateFloodStatus(
      parseFloat(lat), 
      parseFloat(lng), 
      parseFloat(radiusMeters), 
      finalStatus
    );
    
    // 3. Broadcast
    const wss = req.app.get('wss');
    if (wss) {
      const msg = JSON.stringify({
        type: 'flood_update',
        affectedEdges,
        status: finalStatus
      });
      wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(msg);
      });
    }
    
    res.json({ success: true, affectedEdgesCount: affectedEdges.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
