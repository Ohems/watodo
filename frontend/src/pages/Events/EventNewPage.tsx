import { Alert, Box, Center, Loader } from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGetCalendarsQuery, useGetMyOrganizationsQuery } from '../../api/index.js';
import EventSeriesDialog from '../../components/EventSeriesDialog/EventSeriesDialog.js';
import { QueryError } from '../../components/QueryState/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import {
  selectActiveOrganizationId,
  selectIsOrganizationLoaded,
} from '../../store/organization-slice.js';

function EventNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const organizationsLoaded = useAppSelector(selectIsOrganizationLoaded);
  const calendarsQuery = useGetCalendarsQuery(activeOrganizationId ?? skipToken);
  const organizationsQuery = useGetMyOrganizationsQuery();

  const goBack = () => navigate('/events/management');

  if (calendarsQuery.isError || organizationsQuery.isError) {
    return (
      <Box p="md">
        <QueryError />
      </Box>
    );
  }

  if (!activeOrganizationId) {
    if (organizationsLoaded) {
      return (
        <Box p="md">
          <Alert color="yellow">{t('noOrganization.message')}</Alert>
        </Box>
      );
    }
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  if (calendarsQuery.isLoading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  return (
    <Box p="md">
      <EventSeriesDialog
        open
        series={null}
        calendars={calendarsQuery.data ?? []}
        organizations={organizationsQuery.data ?? []}
        onClose={goBack}
        onSaved={goBack}
      />
    </Box>
  );
}

export default EventNewPage;
