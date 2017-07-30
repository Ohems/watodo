import express from 'express';

import { sendNotFound } from '../utils/sender';

import userRoutes from './v1/routes/user-routes';

const router = express.Router();

router.use('/v1/users', userRoutes);

router.get('/', (req, res) => {
  sendNotFound(req, res);
});

export default router;
