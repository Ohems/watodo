import { Box } from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useNavigate } from 'react-router-dom';
import { useGetCalendarsQuery, useGetMyOrganizationsQuery } from '../../api/index.js';
import EventSeriesDialog from '../../components/EventSeriesDialog/EventSeriesDialog.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';

function EventNewPage() {
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const { data: calendars = [] } = useGetCalendarsQuery(activeOrganizationId ?? skipToken);
  const { data: organizations = [] } = useGetMyOrganizationsQuery();

  const goBack = () => navigate('/events/management');

  return (
    <Box p="md">
      <EventSeriesDialog
        open
        series={null}
        calendars={calendars}
        organizations={organizations}
        onClose={goBack}
        onSaved={goBack}
      />
    </Box>
  );
}

export default EventNewPage;
