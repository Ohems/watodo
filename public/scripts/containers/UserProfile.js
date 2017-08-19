import React from 'react';

class UserProfile extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      editing: false,
    };
  }

  render() {
    const displayForm = (
      <div>
        Name:<br/>
        Email address:<br/>
      </div>
    );

    const editForm = (
      <form>
        Name:<br/>
        <input type="text" name="name"/><br/>
        Email address:<br/>
        <input type="text" name="email"/><br/>
      </form>
    );

    const startEditing = () => { this.setState({ editing: true }); };
    const cancelEditing = () => { this.setState({ editing: false }); };
    const save = () => {
      this.setState({ editing: false });
    };

    return (
      <div className="user-form">
        <div>
          {this.state.editing ? (
            <button type="button" onClick={startEditing}>Edit</button>
          ) : (
            <div>
              <button type="reset" onClick={cancelEditing}>Cancel</button>
              <button type="submit" onClick={save}>Save</button>
            </div>
          )}
        </div>

        {this.state.editing ? editForm : displayForm}
      </div>
    );
  }
}

export default UserProfile;
