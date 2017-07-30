const path = require('path');
const winston = require('winston');
const _ = require('lodash');
const config = require('../config');

const validLevels = ['silly', 'debug', 'info', 'warn', 'error'];

function createLogger(filePath) {
  let level = 'info';
  if (_.includes(validLevels, config.LOGGER_LEVEL)) {
    level = config.LOGGER_LEVEL;
  }

  const logger = new winston.Logger({
    transports: [
      new winston.transports.Console({
        label: path.basename(filePath),
        timestamp: true,
        colorize: config.NODE_ENV !== 'production',
        level,
      }),
      new winston.transports.File({
        label: path.basename(filePath),
        timestamp: true,
        filename: 'output.log',
      }),
    ],
  });

  return logger;
}

module.exports = createLogger;
