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
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { jobsApi } from '../../api/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import type { Job } from '../../types/index.js';

function JobConfigPage() {
  const { t } = useTranslation();
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(state => state.organization.activeOrganizationId);
  const currentUser = useAppSelector(state => state.user.currentUser);
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('job-management:write') === true;

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');

  const parsedJobId = Number.parseInt(jobId ?? '', 10);

  const load = useCallback(async () => {
    if (!activeOrganizationId || Number.isNaN(parsedJobId)) return;
    setLoading(true);
    setError(null);
    try {
      const data = await jobsApi.getJob(activeOrganizationId, parsedJobId);
      setJob(data);
      setEditName(data.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, parsedJobId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!activeOrganizationId || Number.isNaN(parsedJobId)) return;
    setSaving(true);
    setError(null);
    try {
      await jobsApi.updateJob(activeOrganizationId, parsedJobId, {
        name: editName,
      });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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
