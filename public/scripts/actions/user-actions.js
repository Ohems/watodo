import { get, post, patch } from '../request';

export const USERS_FETCH = 'USERS_FETCH';
export const USERS_FETCH_SUCCESS = 'USERS_FETCH_SUCCESS';
export const USERS_FETCH_FAILURE = 'USERS_FETCH_FAILURE';

export const USER_FETCH = 'USER_FETCH';
export const USER_FETCH_SUCCESS = 'USER_FETCH_SUCCESS';
export const USER_FETCH_FAILURE = 'USER_FETCH_FAILURE';

export const USER_SEND = 'USER_SEND';
export const USER_SEND_SUCCESS = 'USER_SEND_SUCCESS';
export const USER_SEND_FAILURE = 'USER_SEND_FAILURE';

export const USER_UPDATE = 'USER_UPDATE';
export const USER_UPDATE_SUCCESS = 'USER_UPDATE_SUCCESS';
export const USER_UPDATE_FAILURE = 'USER_UPDATE_FAILURE';

const _fetchUsers = page => ({
  type: USERS_FETCH,
  page,
});

const _fetchUsersSuccess = users => ({
  type: USERS_FETCH_SUCCESS,
  users,
});

const _fetchUsersFailure = error => ({
  type: USERS_FETCH_FAILURE,
  error,
});

const _fetchUser = id => ({
  type: USER_FETCH,
  id,
});

const _fetchUserSuccess = user => ({
  type: USER_FETCH_SUCCESS,
  user,
});

const _fetchUserFailure = error => ({
  type: USER_FETCH_FAILURE,
  error,
});

const _sendUser = user => ({
  type: USER_SEND,
  user,
});

const _sendUserSuccess = user => ({
  type: USER_SEND_SUCCESS,
  user,
});

const _sendUserFailure = error => ({
  type: USER_SEND_FAILURE,
  error,
});

const _updateUser = user => ({
  type: USER_UPDATE,
  user,
});

const _updateUserSuccess = user => ({
  type: USER_UPDATE_SUCCESS,
  user,
});

const _updateUserFailure = error => ({
  type: USER_UPDATE_FAILURE,
  error,
});

export function updateUsers(page) {
  return (dispatch, getState) => {
    if (getState().fetchingUsers) return null;

    dispatch(_fetchUsers(page));
    return get({
      uri: '/api/v1/users',
      qs: { page },
    }).then((result) => {
      dispatch(_fetchUsersSuccess(result));
    }).catch((error) => {
      dispatch(_fetchUsersFailure(error));
    });
  };
}

export function refreshUser(id) {
  return (dispatch, getState) => {
    if (getState().fetchingUsers || getState().updatingUser) return null;

    dispatch(_fetchUser(id));
    return get({
      uri: `/api/v1/users/${id}`,
    }).then(result =>
      dispatch(_fetchUserSuccess(result))
    ).catch(error =>
      dispatch(_fetchUserFailure(error))
    );
  };
}

export function updateUser(user) {
  return (dispatch, getState) => {
    if (getState().updatingUser) return null;

    if (user.id === 'new') {
      delete user.id; // eslint-disable-line no-param-reassign

      dispatch(_sendUser(user));
      return post({
        uri: '/api/v1/users',
        postData: user,
      }).then(result =>
        dispatch(_sendUserSuccess(result))
      ).catch(error =>
        dispatch(_sendUserFailure(error))
      );
    }

    dispatch(_updateUser(user));
    return patch({
      uri: `/api/v1/users/${user.id}`,
      postData: user,
    }).then(result =>
      dispatch(_updateUserSuccess(result))
    ).catch(error =>
      dispatch(_updateUserFailure(error))
    );
  };
}
