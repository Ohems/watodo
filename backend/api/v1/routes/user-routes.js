import express from 'express';

import userController from '../controllers/user-controller';

const router = new express.Router();

router.get('/', userController.getAllUsers);

router.post('/', userController.createUser);

router.patch('/:userId', userController.updateUser);

module.exports = router;
