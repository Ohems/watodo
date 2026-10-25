import moment from 'moment';
import { useState } from 'react';
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
  onRangeChange?: (range: { start: Date; end: Date }) => void;
  defaultView?: View;
}

function Calendar({
  events = [],
  onSelectEvent,
  onRangeChange,
  defaultView = 'month',
}: CalendarProps) {
  // The calendar is controlled: the visible date and view live in state here,
  // so every navigation step is computed from the date that is actually
  // rendered. Leaving navigation to react-big-calendar's internal state made
  // the toolbar label lag behind the grid and let rapid Back/Next presses get
  // stuck on one month or skip months.
  const [date, setDate] = useState<Date>(() => new Date());
  const [view, setView] = useState<View>(defaultView);

  const handleRangeChange = (range: Date[] | { start: Date; end: Date }) => {
    if (!onRangeChange) return;
    if (Array.isArray(range)) {
      if (range.length === 0) return;
      onRangeChange({ start: range[0], end: range[range.length - 1] });
    } else {
      onRangeChange(range);
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 200px)', minHeight: 400 }}>
      <BigCalendar
        localizer={localizer}
        events={events}
        date={date}
        view={view}
        onNavigate={newDate => setDate(newDate)}
        onView={newView => setView(newView)}
        startAccessor="start"
        endAccessor="end"
        views={['month', 'week', 'day', 'agenda']}
        onSelectEvent={onSelectEvent}
        onRangeChange={handleRangeChange}
        style={{ height: '100%' }}
      />
    </div>
  );
}

export default Calendar;
