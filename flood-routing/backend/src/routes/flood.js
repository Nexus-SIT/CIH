import express from 'express';
import { validateFloodRequest } from '../engine/verification.js';
import { updateFloodStatus } from '../engine/reweight.js';

const router = express.Router();

// POST /api/flood-mark -> validates, updates weights, and broadcasts
router.post('/flood-mark', (req, res) => {
  try {
    const { lat, lng, radiusMeters, status, source } = req.body;
    
    // 1. Validate
    const validation = validateFloodRequest(lat, lng, radiusMeters);
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error });
    }
    
    // 2. Update Graph (with source priority)
    const finalStatus = status || 'flooded';
    const finalSource = source || 'manual';
    const { updated, skippedDueToPriority } = updateFloodStatus(
      parseFloat(lat), 
      parseFloat(lng), 
      parseFloat(radiusMeters), 
      finalStatus,
      finalSource
    );
    
    // 3. Broadcast only the updated edges
    if (updated.length > 0) {
      const wss = req.app.get('wss');
      if (wss) {
        const msg = JSON.stringify({
          type: 'flood_update',
          affectedEdges: updated,
          status: finalStatus,
          source: finalSource
        });
        wss.clients.forEach(client => {
          if (client.readyState === 1) client.send(msg);
        });
      }
    }
    
    const response = { 
      success: true, 
      updatedCount: updated.length,
      skippedCount: skippedDueToPriority.length,
    };

    if (skippedDueToPriority.length > 0) {
      response.message = `${skippedDueToPriority.length} edge(s) were not updated because they are currently marked by the AI flood prediction system. AI-marked flood zones cannot be overridden by manual requests.`;
      response.skippedDueToPriority = skippedDueToPriority;
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
