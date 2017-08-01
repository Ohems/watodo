import express from 'express';

import userController from '../controllers/user-controller';

const router = new express.Router();

router.get('/', userController.getAllUsers);

router.post('/', userController.createNewUser);

module.exports = router;
