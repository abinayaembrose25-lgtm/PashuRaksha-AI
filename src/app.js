const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const healthRoutes = require('./routes/healthChecks');
const config = require('./config');

const app = express();
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '20kb' }));
app.use(cookieParser());
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/health-checks', healthRoutes);
app.use(express.static(path.join(__dirname, '..')));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && error.body) return res.status(400).json({ error: 'Invalid JSON payload' });
  console.error(error);
  return res.status(error.status || 500).json({ error: error.status ? error.message : 'Unexpected server error' });
});

module.exports = app;