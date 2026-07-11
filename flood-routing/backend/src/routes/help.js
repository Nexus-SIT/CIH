import express from 'express';
import { isWithinServiceArea } from '../engine/verification.js';
import { calculateRoute } from '../engine/astar.js';
import {
  createRequest,
  getAllRequests,
  getRequest,
  acknowledgeRequest,
  resolveRequest
} from '../registry/helpRequests.js';

const router = express.Router();

// Helper to broadcast to all WS clients
function broadcast(wss, payload) {
  if (!wss) return;
  const msg = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

// POST /api/help/request
// body: { lat, lng, message }
router.post('/request', (req, res) => {
  try {
    const { lat, lng, message } = req.body;

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'lat and lng are required.' });
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

    const request = createRequest(parsedLat, parsedLng, message || '');

    broadcast(req.app.get('wss'), {
      type: 'help_request_new',
      requestId: request.requestId,
      lat: request.lat,
      lng: request.lng,
      message: request.message,
      timestamp: request.timestamp
    });

    res.json(request);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/help/requests
// Returns all active (non-resolved) help requests
router.get('/requests', (req, res) => {
  try {
    const requests = getAllRequests();
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/help/acknowledge
// body: { requestId, responderId }
router.post('/acknowledge', (req, res) => {
  try {
    const { requestId, responderId } = req.body;

    if (!requestId || !responderId) {
      return res.status(400).json({ error: 'requestId and responderId are required.' });
    }

    const updated = acknowledgeRequest(requestId, responderId);
    if (!updated) {
      return res.status(404).json({ error: `Help request ${requestId} not found.` });
    }

    broadcast(req.app.get('wss'), {
      type: 'help_request_acknowledged',
      requestId,
      responderId
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/help/route
// body: { requestId, responderLat, responderLng, vehicleType }
// Calculates route from responder's location to the help request's location
router.post('/route', (req, res) => {
  try {
    const { requestId, responderLat, responderLng, vehicleType } = req.body;

    if (!requestId || responderLat === undefined || responderLng === undefined) {
      return res.status(400).json({ error: 'requestId, responderLat, and responderLng are required.' });
    }

    const helpRequest = getRequest(requestId);
    if (!helpRequest) {
      return res.status(404).json({ error: `Help request ${requestId} not found.` });
    }

    if (helpRequest.status === 'resolved') {
      return res.status(400).json({ error: 'Cannot route to a resolved help request.' });
    }

    const sLat = parseFloat(responderLat);
    const sLng = parseFloat(responderLng);

    const result = calculateRoute(sLat, sLng, helpRequest.lat, helpRequest.lng, vehicleType);

    if (result.pathFound) {
      broadcast(req.app.get('wss'), {
        type: 'route_update',
        ...result
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/help/resolve
// body: { requestId }
router.post('/resolve', (req, res) => {
  try {
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required.' });
    }

    const resolved = resolveRequest(requestId);
    if (!resolved) {
      return res.status(404).json({ error: `Help request ${requestId} not found.` });
    }

    broadcast(req.app.get('wss'), {
      type: 'help_request_resolved',
      requestId
    });

    res.json({ success: true, requestId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
