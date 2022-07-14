/* eslint-disable no-process-env */

const env = require('require-env');

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'develop',
  PORT: process.env.PORT || 8000,
  LOGGER_LEVEL: process.env.LOGGER_LEVEL || 'info',

  DATABASE_URL: process.env.DATABASE_URL,
  // DATABASE_URL: env.require(process.env.DATABASE_URL),

  TRUST_PROXY: process.env.TRUST_PROXY === 'true',
};
