const path = require('path');

const config = {
  port: Number(process.env.PORT || 3000),
  jwtSecret: process.env.JWT_SECRET || 'development-secret-change-me',
  databasePath: path.resolve(process.env.DATABASE_PATH || './data/pashuraksha.sqlite'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  cookieSecure: process.env.COOKIE_SECURE === 'true'
};

if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'development-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = config;