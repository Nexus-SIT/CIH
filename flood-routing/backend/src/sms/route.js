import express from 'express';
import { sendRouteInstruction } from './outbound.js';

const router = express.Router();

router.post('/trigger', async (req, res) => {
  const { phone, instruction, route_id } = req.body;

  if (!phone || !instruction || !route_id) {
    return res.status(400).json({ success: false, error: 'Missing phone, instruction, or route_id' });
  }

  console.log(`[SMS Trigger] Sending instruction to ${phone} for route ${route_id}`);

  const result = await sendRouteInstruction(phone, instruction, route_id);

  if (result.success) {
    return res.json({ success: true, message: 'SMS sent successfully' });
  } else {
    return res.status(500).json({ success: false, error: result.error });
  }
});

export default router;
