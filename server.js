require('dotenv').config();

const app = require('./src/app');
const { initializeDatabase } = require('./src/db/database');

initializeDatabase();

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`PashuRaksha AI is running at http://localhost:${port}`);
});