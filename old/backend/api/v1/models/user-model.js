import changeCase from 'change-case';
import _ from 'lodash';

import db from '../../../db';

function toCamelCase(obj) {
  return _.mapKeys(obj, (value, key) => changeCase.toCamelCase(key));
}

function toSnakeCase(obj) {
  return _.mapKeys(obj, (value, key) => changeCase.toSnakeCase(key));
}

function getAllUsers() {
  return db.select()
    .from('users')
    .joinRaw('natural join email_domains')
    .then(toCamelCase);
}

function createUser(user) {
  return db('users')
    .insert(toSnakeCase(user))
    .returning('*');
}

function updateUser(user) {
  return db('users')
    .where('users_id', '=', user.usersId)
    .update(toSnakeCase(user))
    .returning('*');
}

module.exports = {
  getAllUsers,
  createUser,
  updateUser,
};
