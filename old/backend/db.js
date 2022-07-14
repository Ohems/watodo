const knexConfig = require('./knexfile');
const envConfig = require('./config');
module.exports = require('knex')(knexConfig[envConfig.NODE_ENV]);
