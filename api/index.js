const { initializeDatabase } = require('../src/db/database');
const app = require('../src/app');

initializeDatabase();

module.exports = app;