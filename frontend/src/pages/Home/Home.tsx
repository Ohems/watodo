import Calendar, { type CalendarEvent } from '../../components/Calendar/Calendar.js';

function Home() {
  const events: CalendarEvent[] = [];
  return (
    <div style={{ padding: 16 }}>
      <h2>Calendar</h2>
      <Calendar events={events} />
    </div>
  );
}

export default Home;
