import express from 'express';
import { register, updateLocation, getAll } from '../registry/responders.js';

const router = express.Router();

router.post('/register', (req, res) => {
  try {
    const { responderId, vehicleType, initialLat, initialLng } = req.body;
    
    if (!responderId || initialLat === undefined || initialLng === undefined) {
      return res.status(400).json({ error: 'responderId, initialLat, and initialLng are required' });
    }
    
    const session = register(
      responderId, 
      vehicleType, 
      parseFloat(initialLat), 
      parseFloat(initialLng)
    );
    
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/location', (req, res) => {
  try {
    const { responderId, lat, lng, activeRouteId } = req.body;
    
    if (!responderId || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'responderId, lat, and lng are required' });
    }
    
    const session = updateLocation(
      responderId, 
      parseFloat(lat), 
      parseFloat(lng), 
      activeRouteId
    );
    
    if (!session) {
      return res.status(404).json({ error: 'Responder not found. Please register first.' });
    }
    
    // Broadcast responder location update
    const wss = req.app.get('wss');
    if (wss) {
      const msg = JSON.stringify({
        type: 'responder_update',
        responderId,
        currentLat: session.currentLat,
        currentLng: session.currentLng
      });
      wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(msg);
      });
    }
    
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/all', (req, res) => {
  try {
    const sessions = getAll();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
