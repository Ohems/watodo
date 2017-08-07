import React from 'react';
import Card from 'react-material-card';
import $ from 'jquery';

class Contacts extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      users: [],
      page: 0,
    };
  }

  componentDidMount() {
    this.usersRequest = $.get(
      `${window.location.origin}/api/v1/users`,
      {
        page: this.state.page,
      },
      (result) => {
        this.setState({
          users: result.data,
        });
      }
    );
  }

  componentWillUnmount() {
    this.usersRequest.abort();
  }

  render() {
    const addUser = () => {
      console.log('add');
    };

    const openUser = () => {
      console.log('open');
    };

    const cards = [];

    cards.push(
      <Card
        className="contacts-card-add"
        width={190}
        height={70}
        borderRadius={2}
        level={2}
        onClick={addUser}
        onOver={ card => card.setLevel(1) }
        onOut={ card => card.setLevel(2) }
        key={0}
      >
        <span className="mdi mdi-account mdi-36px" />
        Click here to add a new user.
      </Card>
    );

    (this.state.users || []).forEach((user, i) => {
      cards.push(
        <Card
          className="contacts-card-open"
          width={190}
          height={70}
          borderRadius={2}
          level={2}
          onClick={openUser}
          onOver={ card => card.setLevel(1) }
          onOut={ card => card.setLevel(2) }
          key={i + 1}
        >
          <span className="mdi mdi-account mdi-36px" />
          Click here to add a new user.
        </Card>
      );
    });

    return (
      <div className="contacts">
        {cards}
      </div>
    );
  }
}

export default Contacts;
