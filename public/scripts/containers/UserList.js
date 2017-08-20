import React from 'react';
import { connect } from 'react-redux';
import { withRouter } from 'react-router-dom';

import {
  updateUsers,
} from '../actions/user-actions';

import UserCard from '../components/UserCard';

const mapStateToProps = state => ({
  users: state.userState.users,
});

const mapActionsToProps = (dispatch, ownProps) => ({
  updateUsers: () => {
    dispatch(updateUsers(ownProps.page));
  },
});

class UserList extends React.Component {
  componentDidMount() {
    updateUsers();
  }

  render() {
    const openRoute = route => () => {
      this.props.history.push(route);
    };

    const openUser = () => {
      console.log('open');
    };

    const cards = [];

    cards.push(
      <UserCard
        className="user-list-card-add"
        onClick={openRoute('/users/new')}
        key={0}
      >
        <span className="mdi mdi-account mdi-36px" />
        Click here to add a new user.
      </UserCard>
    );

    (this.props.users || []).forEach((user, i) => {
      cards.push(
        <UserCard
          className="user-list-card-open"
          onClick={openUser}
          key={i + 1}
        >
          <span className="mdi mdi-account mdi-36px" />
          Click here to add a new user.
        </UserCard>
      );
    });

    return (
      <div className="user-list">
        {cards}
      </div>
    );
  }
}

UserList = withRouter(UserList); // eslint-disable-line no-class-assign

export default connect(
  mapStateToProps,
  mapActionsToProps,
)(UserList);
