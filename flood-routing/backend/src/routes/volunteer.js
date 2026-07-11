import express from 'express';
import { createReport, getAllReports, removeReport } from '../registry/volunteer-reports.js';

const router = express.Router();

// GET /api/volunteer/reports - Fetch all active reports
router.get('/reports', (req, res) => {
  res.json(getAllReports());
});

// POST /api/volunteer/report-flood - Create a new report
router.post('/report-flood', (req, res) => {
  try {
    const { lat, lng, radiusMeters, userRole } = req.body;
    
    if (!lat || !lng || !radiusMeters || !userRole) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const report = createReport(lat, lng, radiusMeters, userRole);

    // Broadcast to dashboard
    const wss = req.app.get('wss');
    if (wss) {
      const msg = JSON.stringify({
        type: 'new_volunteer_report',
        report
      });
      wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(msg);
      });
    }

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/volunteer/resolve-report - Remove a report (Approve or Reject)
router.post('/resolve-report', (req, res) => {
  try {
    const { reportId, action } = req.body; // action can be 'approve' or 'reject'
    
    if (!reportId) {
      return res.status(400).json({ error: 'Missing reportId' });
    }

    const success = removeReport(reportId);
    
    if (!success) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Broadcast resolution so other dashboard clients remove it
    const wss = req.app.get('wss');
    if (wss) {
      const msg = JSON.stringify({
        type: 'volunteer_report_resolved',
        reportId,
        action
      });
      wss.clients.forEach(client => {
        if (client.readyState === 1) client.send(msg);
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
