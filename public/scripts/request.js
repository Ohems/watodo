const rp = require('request-promise');

const jsonParams = {
  json: true,
  headers: {
    'Content-Type': 'application/json',
  },
};

export function get(params) {
  rp(Object.assign(
    { method: 'GET', ...jsonParams },
    params
  ));
}

export function put(params) {
  rp(Object.assign(
    { method: 'PUT', ...jsonParams },
    params
  ));
}

export function post(params) {
  rp(Object.assign(
    { method: 'POST', ...jsonParams },
    params
  ));
}

export function patch(params) {
  rp(Object.assign(
    { method: 'PATCH', ...jsonParams },
    params
  ));
}

export function del(params) {
  rp(Object.assign(
    { method: 'DELETE', ...jsonParams },
    params
  ));
}

