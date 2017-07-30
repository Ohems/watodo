import userModel from '../models/user-model';
import { sendSuccess } from '../../../utils/sender';

function getAllUsers(req, res) {
  userModel.getAllUsers()
    .then((users) => {
      sendSuccess(req, res, users);
    });
}

function createNewUser(req, res) {
  userModel.createNewUser()
    .then(() => {
      sendSuccess(req, res);
    });
}

module.exports = {
  getAllUsers,
  createNewUser,
};
