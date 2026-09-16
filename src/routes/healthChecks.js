const express = require('express');
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { healthCheckInput } = require('../utils/validation');
const { calculateHealthResult } = require('../services/healthService');

const router = express.Router();
router.post('/', requireAuth, (req, res, next) => {
  try {
    const input = healthCheckInput(req.body);
    const result = calculateHealthResult(input);
    const saved = db.prepare(`INSERT INTO health_checks (user_id, animal_name, animal_type, temperature, appetite, behavior, symptoms, risk_level, risk_score, recommendation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(req.user.id, input.animalName, input.animalType, input.temperature, input.appetite, input.behavior, input.symptoms, result.riskLevel, result.riskScore, result.recommendation);
    res.status(201).json({ id: saved.lastInsertRowid, input, result });
  } catch (error) { next(error); }
});

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM health_checks WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ records: rows });
});

module.exports = router;