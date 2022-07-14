import React from 'react';
import Card from 'react-material-card';

class UserCard extends React.Component {
  render() {
    return (
      <Card
        width={190}
        height={70}
        borderRadius={2}
        level={2}
        onOver={ card => card.setLevel(1) }
        onOut={ card => card.setLevel(2) }
        {...this.props}
      >
        { this.props.children }
      </Card>
    );
  }
}

export default UserCard;
