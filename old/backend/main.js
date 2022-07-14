import express from 'express';
import { oneLine } from 'common-tags';

import v1Router from './api/router';
import staticRouter from './static';
import config from './config';

const { debug, info, error } = require('./utils/logger')(__filename);

const app = express();

// Only if you're behind a reverse proxy,
// for example a custom Nginx setup
if (config.TRUST_PROXY) {
  app.enable('trust proxy');
}

app.use((req, res, next) => {
  debug(`${req.method} ${req.originalUrl}`);
  next();
});

app.use('/api/v1', v1Router);
app.use('/', staticRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  error(err.stack);
  res.status(500).send('Internal Server Error');
});

app.listen(config.PORT, () => {
  info(oneLine`
    Server listening on http://localhost:${config.PORT},
    node env ${config.NODE_ENV}
  `);
});
