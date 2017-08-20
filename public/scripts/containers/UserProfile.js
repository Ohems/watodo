import React from 'react';
import { connect } from 'react-redux';
import _ from 'lodash';

import {
  updateUser,
} from '../actions/user-actions';

import EditField from '../components/EditField';

const mapStateToProps = (state, ownProps) => ({
  user: _.find(
    state.userState.users,
    { id: ownProps.match.params.userId }
  ) || {
    id: 'new',
    name: 'Name',
    email: 'Email',
  },
});

const mapActionsToProps = dispatch => ({
  updateUser: (user) => {
    dispatch(updateUser(user));
  },
});

class UserProfile extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      editing: false,
      editUser: this.props.user,
    };
  }

  render() {
    const editField = (value, params) => (<EditField
      value={this.state.editUser[value]}
      editing={this.state.editing}
      {...params}
    />);

    const fields = {
      name: editField('name'),
      email: editField('email'),
    };

    const startEditing = () => { this.setState({ editing: true }); };
    const cancelEditing = () => { this.setState({ editing: false }); };
    const save = () => {
      this.setState({ editing: false });
      this.props.updateUser(this.state.editUser);
    };

    return (
      <div className="user-profile">
        <div className="user-profile-tools">
          {!this.state.editing ? (
            <button type="button" onClick={startEditing}>Edit</button>
          ) : (
            <div>
              <button type="reset" onClick={cancelEditing}>Cancel</button>
              <button type="submit" onClick={save}>Save</button>
            </div>
          )}
        </div>

        <form className="user-profile-form">
          <h3>Name:</h3>
          {fields.name}
          <h3>Email address:</h3>
          {fields.email}
        </form>
      </div>
    );
  }
}

export default connect(
  mapStateToProps,
  mapActionsToProps,
)(UserProfile);
