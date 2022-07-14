import config from './config';

const knexConfig = {
  client: 'pg',
  connection: config.DATABASE_URL,
  pool: {
    min: 1,
    max: 10,
  },
  migrations: {
    tableName: 'knex_migrations',
    directory: './migrations',
  },
};

module.exports = {
  test: knexConfig,
  development: knexConfig,
  production: knexConfig,
};
