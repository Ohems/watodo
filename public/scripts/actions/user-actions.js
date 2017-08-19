import { get, post } from '../request';

export const USERS_FETCH = 'USERS_FETCH';
export const USERS_FETCH_SUCCESS = 'USERS_FETCH_SUCCESS';
export const USERS_FETCH_FAILURE = 'USERS_FETCH_FAILURE';

export const USER_FETCH = 'USER_FETCH';
export const USER_FETCH_SUCCESS = 'USER_FETCH_SUCCESS';
export const USER_FETCH_FAILURE = 'USER_FETCH_FAILURE';

export const USER_SEND = 'USER_SEND';
export const USER_SEND_SUCCESS = 'USER_SEND_SUCCESS';
export const USER_SEND_FAILURE = 'USER_SEND_FAILURE';

const fetchUsers = page => ({
  type: USERS_FETCH,
  page,
});

const fetchUsersSuccess = users => ({
  type: USERS_FETCH_SUCCESS,
  users,
});

const fetchUsersFailure = error => ({
  type: USERS_FETCH_FAILURE,
  error,
});

const fetchUser = id => ({
  type: USER_FETCH,
  id,
});

const fetchUserSuccess = user => ({
  type: USER_FETCH_SUCCESS,
  user,
});

const fetchUserFailure = error => ({
  type: USER_FETCH_FAILURE,
  error,
});

const sendUser = user => ({
  type: USER_SEND,
  user,
});

const sendUserSuccess = user => ({
  type: USER_SEND_SUCCESS,
  user,
});

const sendUserFailure = error => ({
  type: USER_SEND_FAILURE,
  error,
});

export function updateUsers(page) {
  return (dispatch, getState) => {
    if (getState().fetchingUsers) return null;

    dispatch(fetchUsers(page));
    return get({
      uri: '/api/v1/users',
      qs: { page },
    }).then((result) => {
      dispatch(fetchUsersSuccess(result));
    }).catch((error) => {
      dispatch(fetchUsersFailure(error));
    });
  };
}

export function updateUser(id) {
  return (dispatch, getState) => {
    if (getState().fetchingUsers || getState().updatingUser) return null;

    dispatch(fetchUser(id));
    return get({
      uri: `/api/v1/users/${id}`,
    }).then((result) => {
      dispatch(fetchUserSuccess(result));
    }).catch((error) => {
      dispatch(fetchUserFailure(error));
    });
  };
}

export function addUser(user) {
  return (dispatch, getState) => {
    if (getState().updatingUser) return null;

    dispatch(sendUser(user));
    return post({
      uri: `/api/v1/users/${user.id}`,
      postData: user,
    }).then((result) => {
      dispatch(sendUserSuccess(result));
    }).catch((error) => {
      dispatch(sendUserFailure(error));
    });
  };
}
