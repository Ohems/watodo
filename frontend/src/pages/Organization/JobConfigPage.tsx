import {
  Alert,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getApiErrorMessage,
  useGetCurrentUserQuery,
  useGetJobQuery,
  useUpdateJobMutation,
} from '../../api/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';

function JobConfigPage() {
  const { t } = useTranslation();
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const { data: currentUser } = useGetCurrentUserQuery();
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('job-management:write') === true;

  const parsedJobId = Number.parseInt(jobId ?? '', 10);
  const jobArg =
    activeOrganizationId && !Number.isNaN(parsedJobId)
      ? { organizationId: activeOrganizationId, jobId: parsedJobId }
      : skipToken;
  const { data: job, isLoading: loading, error: jobError } = useGetJobQuery(jobArg);
  const [updateJob, { isLoading: saving }] = useUpdateJobMutation();

  const [actionError, setActionError] = useState<string | null>(null);
  const error = actionError ?? (jobError ? getApiErrorMessage(jobError) : null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    if (job) setEditName(job.name);
  }, [job]);

  const handleSave = async () => {
    if (!activeOrganizationId || Number.isNaN(parsedJobId)) return;
    setActionError(null);
    try {
      await updateJob({
        organizationId: activeOrganizationId,
        jobId: parsedJobId,
        data: { name: editName },
      }).unwrap();
      setEditing(false);
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  if (loading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  if (!job) {
    return (
      <Box p="md">
        <Alert color="red">{error ?? 'Job not found'}</Alert>
      </Box>
    );
  }

  return (
    <Box p="md" maw={600} mx="auto">
      <Paper shadow="sm" p="lg">
        <Group justify="space-between" mb="md">
          <Title order={3}>{editing ? t('jobs.editJob') : job.name}</Title>
          {canWrite && (
            <Group>
              {!editing ? (
                <Button variant="filled" onClick={() => setEditing(true)}>
                  {t('common.edit')}
                </Button>
              ) : (
                <>
                  <Button
                    variant="default"
                    onClick={() => {
                      setEditing(false);
                      setEditName(job.name);
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button variant="filled" onClick={handleSave} loading={saving}>
                    {t('common.save')}
                  </Button>
                </>
              )}
            </Group>
          )}
        </Group>

        {error && (
          <Alert color="red" variant="light" mb="md">
            {error}
          </Alert>
        )}

        <Stack gap="md">
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('common.name')}
            </Text>
            {editing ? (
              <TextInput value={editName} onChange={e => setEditName(e.target.value)} />
            ) : (
              <Text>{job.name}</Text>
            )}
          </Box>
        </Stack>

        <Box mt="lg">
          <Button variant="subtle" onClick={() => navigate('/organization/jobs')}>
            {t('jobs.backToList')}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default JobConfigPage;
