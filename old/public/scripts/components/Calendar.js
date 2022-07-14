import React from 'react';
import BigCalendar from 'react-big-calendar';
import moment from 'moment';

BigCalendar.momentLocalizer(moment);

class Calendar extends React.Component {
  render() {
    const myEventsList = [];

    return (
      <div className="calendar">
        <BigCalendar
          {...this.props}
          events={myEventsList}
          startAccessor={moment().format()}
        />
      </div>
    );
  }
}

export default Calendar;
