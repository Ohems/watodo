import React from 'react';

import Calendar from '../components/Calendar';

class Home extends React.Component {
  render() {
    return (
      <div className="home">
        <div className="home-calendar">
          <Calendar />
        </div>
      </div>
    );
  }
}

export default Home;
