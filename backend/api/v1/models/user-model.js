import db from '../../../db';

function getAllUsers() {
  return db.select()
    .from('users')
    .joinRaw('natural join email_domains');
}

function createNewUser() {
  return Promise.resolve();
}

module.exports = {
  getAllUsers,
  createNewUser,
}
