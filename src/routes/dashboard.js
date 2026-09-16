const express = require('express');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.get('/', requireAuth, (req, res) => {
  const userId = req.user.id;
  const totals = db.prepare(`SELECT COUNT(*) AS total, SUM(risk_level = 'Low') AS healthy, SUM(risk_level = 'Medium') AS medium, SUM(risk_level = 'High') AS high FROM health_checks WHERE user_id = ?`).get(userId);
  const reports = db.prepare(`SELECT id, animal_name, animal_type, temperature, risk_level, created_at FROM health_checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 8`).all(userId);
  const total = totals.total || 0;
  res.json({ stats: { total, healthy: totals.healthy || 0, medium: totals.medium || 0, high: totals.high || 0 }, reports, chart: { healthy: total ? Math.round((totals.healthy || 0) / total * 100) : 0, medium: total ? Math.round((totals.medium || 0) / total * 100) : 0, high: total ? Math.round((totals.high || 0) / total * 100) : 0 } });
});

module.exports = router;