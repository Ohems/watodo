const rp = require('request-promise').defaults({
  json: true,
  headers: {
    'Content-Type': 'application/json',
  },
  baseUrl: window.location.origin,
});

export function get(params) {
  return rp(Object.assign(
    { method: 'GET' },
    params
  ));
}

export function put(params) {
  return rp(Object.assign(
    { method: 'PUT' },
    params
  ));
}

export function post(params) {
  return rp(Object.assign(
    { method: 'POST' },
    params
  ));
}

export function patch(params) {
  return rp(Object.assign(
    { method: 'PATCH' },
    params
  ));
}

export function del(params) {
  return rp(Object.assign(
    { method: 'DELETE' },
    params
  ));
}

