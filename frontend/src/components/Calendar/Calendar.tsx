import moment from 'moment';
import { Calendar as BigCalendar, momentLocalizer, type View } from 'react-big-calendar';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = momentLocalizer(moment);

export interface CalendarEvent {
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource?: unknown;
}

interface CalendarProps {
  events?: CalendarEvent[];
  onSelectEvent?: (event: CalendarEvent) => void;
  defaultView?: View;
}

function Calendar({ events = [], onSelectEvent, defaultView = 'month' }: CalendarProps) {
  return (
    <div style={{ height: 'calc(100vh - 200px)', minHeight: 400 }}>
      <BigCalendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        defaultView={defaultView}
        views={['month', 'week', 'day', 'agenda']}
        onSelectEvent={onSelectEvent}
        style={{ height: '100%' }}
      />
    </div>
  );
}

export default Calendar;
