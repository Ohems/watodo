import {
  USERS_FETCH,
  USERS_FETCH_SUCCESS,
  USERS_FETCH_FAILURE,

  USER_FETCH,
  USER_FETCH_SUCCESS,
  USER_FETCH_FAILURE,

  USER_SEND,
  USER_SEND_SUCCESS,
  USER_SEND_FAILURE,

  USER_UPDATE,
  USER_UPDATE_SUCCESS,
  USER_UPDATE_FAILURE,
} from '../actions/user-actions';

const defautlState = {
  users: [],
};

const users = (state = defautlState, action) => {
  console.log(state, action);
  switch (action.type) {
    case USERS_FETCH: {
      return Object.assign(state, {
        fetchingUsers: true,
        usersError: undefined,
      });
    }
    case USERS_FETCH_SUCCESS: {
      return Object.assign(state, {
        fetchingUsers: false,
        users: action.users,
      });
    }
    case USERS_FETCH_FAILURE: {
      return Object.assign(state, {
        fetchingUsers: false,
        usersError: action.error,
      });
    }

    case USER_FETCH:
    case USER_SEND: {
      return Object.assign(state, {
        updatingUser: action.id,
        userError: undefined,
      });
    }
    case USER_UPDATE: {
      return Object.assign(state, {
        updatingUser: action.user.id,
        users: state.users.map((user) => {
          if (user.id === action.user.id) {
            return action.user;
          }
          return user;
        }),
        userError: undefined,
      });
    }
    case USER_FETCH_SUCCESS:
    case USER_UPDATE_SUCCESS: {
      return Object.assign(state, {
        updatingUser: undefined,
        users: state.users.map((user) => {
          if (user.id === state.updatingUser) {
            return action.user;
          }
          return user;
        }),
      });
    }
    case USER_SEND_SUCCESS: {
      return Object.assign(state, {
        updatingUser: undefined,
      });
    }
    case USER_FETCH_FAILURE:
    case USER_SEND_FAILURE:
    case USER_UPDATE_FAILURE: {
      return Object.assign(state, {
        updatingUser: false,
        userError: action.error,
      });
    }

    default:
      return state;
  }
};

export default users;
