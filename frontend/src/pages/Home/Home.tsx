import { useTranslation } from 'react-i18next';
import Calendar, { type CalendarEvent } from '../../components/Calendar/Calendar.js';

function Home() {
  const { t } = useTranslation();
  const events: CalendarEvent[] = [];
  return (
    <div style={{ padding: 16 }}>
      <h2>{t('home.title')}</h2>
      <Calendar events={events} />
    </div>
  );
}

export default Home;
