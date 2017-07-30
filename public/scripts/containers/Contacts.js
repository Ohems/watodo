import React from 'react';
import { Menu, MainButton, ChildButton } from 'react-mfb';

class Contacts extends React.Component {
  render() {
    return (
      <div className="contacts">
        <Menu>
          <MainButton
            icon="ion-plus-round"
            label="Add new contact"
          />
        </Menu>
      </div>
    );
  }
}

export default Contacts;
