import Joi from 'joi';

import userModel from '../models/user-model';
import { sendSuccess, sendFail } from '../../../utils/sender';

const idType = Joi.number().integer().positive();

const userSchema = Joi.object().keys({
  id: idType,
  name: Joi.string().alphanum(),
  email: Joi.string().email().required(),
  contacts: Joi.string(),
  profile: Joi.string(),
  responsibiltyId: Joi.array().items(idType).single(),
  active: Joi.boolean().default(true),
  visible: Joi.boolean().default(true),
});

function validate(req, res, value, schema) {
  const params = Joi.validate(value, schema);
  if (params.error) {
    sendFail(req, res, 400, params.error);
  }
  return params.value;
}

function getAllUsers(req, res) {
  userModel.getAllUsers()
    .then((users) => {
      sendSuccess(req, res, users);
    });
}

function createUser(req, res) {
  const user = validate(req, res, req.query, userSchema);

  userModel.createUser(user)
    .then((user) => {
      sendSuccess(req, res, user);
    });
}

function updateUser(req, res) {
  const user = validate(req, res, req.query, userSchema);

  userModel.updateUser(user)
    .then((user) => {
      sendSuccess(req, res, user);
    });
}

module.exports = {
  getAllUsers,
  createUser,
  updateUser,
};
