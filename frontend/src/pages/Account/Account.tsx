import { Alert, Box, Button, Group, Modal, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  getApiErrorMessage,
  useGetAuthAccountsQuery,
  useGetAuthProvidersQuery,
  useGetCurrentUserQuery,
  useStartLinkMutation,
  useUnlinkAuthAccountMutation,
  useUpdateCurrentUserMutation,
} from '../../api/index.js';
import EditField from '../../components/EditField/EditField.js';
import { useAppDispatch } from '../../hooks/redux.js';
import { LANGUAGE_LABELS, type Language, SUPPORTED_LANGUAGES } from '../../i18n/index.js';
import { deleteCurrentUser } from '../../store/session.js';
import type { FieldErrors, UserSelfUpdate, WeekStart } from '../../types/index.js';
import { validateUserSelfUpdate } from '../../validation.js';

/** Week start options offered in the preferences. */
const WEEK_START_OPTIONS: WeekStart[] = ['sunday', 'monday'];

function AccountPage() {
  const { t, i18n } = useTranslation();
  const dispatch = useAppDispatch();
  const { data: currentUser } = useGetCurrentUserQuery();
  const { data: authAccounts = [] } = useGetAuthAccountsQuery();
  const { data: providersData, isError: providersError } = useGetAuthProvidersQuery();
  const [updateCurrentUser, { isLoading: saving }] = useUpdateCurrentUserMutation();
  const [startLink] = useStartLinkMutation();
  const [unlinkAuthAccount] = useUnlinkAuthAccountMutation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<UserSelfUpdate>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [profileError, setProfileError] = useState<string | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [weekStartError, setWeekStartError] = useState<string | null>(null);

  // No hardcoded fallback: the provider list always comes from the API (the
  // E2E tests mock it; on error an empty list is shown).
  const providers = providersData?.providers ?? (providersError ? [] : null);

  // The backend redirects back here with ?linkError=... when connecting a
  // login method fails.
  useEffect(() => {
    const error = searchParams.get('linkError');
    if (error) {
      setLinkError(error);
      const next = new URLSearchParams(searchParams);
      next.delete('linkError');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  if (!currentUser) return null;

  const configuredProviders = (providers ?? []).filter(provider => provider.configured);
  const canDisconnect = authAccounts.length > 1;

  const startEditing = () => {
    setEditData({
      name: currentUser.name,
      email: currentUser.email,
      description: currentUser.description,
      phoneNumber: currentUser.phoneNumber ?? '',
    });
    setProfileError(null);
    setFieldErrors({});
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditData({});
    setFieldErrors({});
  };

  const updateField = (field: keyof UserSelfUpdate, value: string) => {
    setEditData(prev => ({ ...prev, [field]: value }));
    setFieldErrors(prev => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSave = async () => {
    setProfileError(null);
    // An empty phone field clears the number.
    const phoneNumber = editData.phoneNumber?.trim();
    const data: UserSelfUpdate = {
      ...editData,
      phoneNumber: phoneNumber ? phoneNumber : null,
    };
    const validationErrors = validateUserSelfUpdate(data, t);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      return;
    }
    try {
      await updateCurrentUser(data).unwrap();
      setEditing(false);
      setEditData({});
      setFieldErrors({});
    } catch (error) {
      // The frontend validation catches invalid fields before the request is
      // sent; a rejection here is unexpected and the backend message is shown.
      setProfileError(getApiErrorMessage(error) || t('account.saveFailed'));
    }
  };

  const handleConnect = async (providerId: string) => {
    setLinkError(null);
    setAccountsError(null);
    try {
      const { authorizationUrl } = await startLink({
        provider: providerId,
        returnUrl: '/account',
      }).unwrap();
      window.location.href = authorizationUrl;
    } catch (error) {
      setAccountsError(getApiErrorMessage(error) || t('account.connectFailed'));
    }
  };

  const handleDisconnect = async (providerId: string) => {
    setLinkError(null);
    setAccountsError(null);
    try {
      await unlinkAuthAccount(providerId).unwrap();
    } catch (error) {
      setAccountsError(getApiErrorMessage(error) || t('account.disconnectFailed'));
    }
  };

  // The language is saved immediately (not part of the edit form) and the UI
  // switches to it right away.
  const handleLanguageChange = async (language: Language) => {
    setLanguageError(null);
    try {
      await updateCurrentUser({ language }).unwrap();
      await i18n.changeLanguage(language);
    } catch (error) {
      setLanguageError(getApiErrorMessage(error) || t('account.languageUpdateFailed'));
    }
  };

  // The week start is saved immediately (not part of the edit form) so the
  // calendars switch right away.
  const handleWeekStartChange = async (weekStart: WeekStart) => {
    setWeekStartError(null);
    try {
      await updateCurrentUser({ weekStart }).unwrap();
    } catch (error) {
      setWeekStartError(getApiErrorMessage(error) || t('account.weekStartUpdateFailed'));
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await dispatch(deleteCurrentUser()).unwrap();
      // The app switches to the login screen once the account is gone.
    } catch (error) {
      setDeleteError(getApiErrorMessage(error) || t('account.deleteFailed'));
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <Box p="md" maw={600} mx="auto">
      {linkError && (
        <Alert
          color="red"
          variant="light"
          mb="md"
          withCloseButton
          onClose={() => setLinkError(null)}
        >
          {linkError}
        </Alert>
      )}

      <Paper shadow="sm" p="lg">
        <Group justify="space-between" mb="md">
          <Title order={3}>{t('account.title')}</Title>
          {!editing ? (
            <Button variant="filled" onClick={startEditing}>
              {t('common.edit')}
            </Button>
          ) : (
            <Group>
              <Button variant="default" onClick={handleCancel}>
                {t('common.cancel')}
              </Button>
              <Button variant="filled" onClick={handleSave} disabled={saving}>
                {t('common.save')}
              </Button>
            </Group>
          )}
        </Group>

        {profileError && (
          <Alert color="red" variant="light" mb="md">
            {profileError}
          </Alert>
        )}

        <Title order={5} mb="md">
          {t('account.personalInfo')}
        </Title>
        <Stack gap="md">
          <Box>
            <Text size="sm" fw={500} c={fieldErrors.name ? 'red' : 'dimmed'} mb={4}>
              {t('common.name')}
            </Text>
            <EditField
              value={editData.name ?? currentUser.name}
              editing={editing}
              label={t('common.name')}
              error={fieldErrors.name}
              onChange={value => updateField('name', value)}
            />
          </Box>
          <Box>
            <Text size="sm" fw={500} c={fieldErrors.email ? 'red' : 'dimmed'} mb={4}>
              {t('common.email')}
            </Text>
            <EditField
              value={editData.email ?? currentUser.email}
              editing={editing}
              label={t('common.email')}
              error={fieldErrors.email}
              onChange={value => updateField('email', value)}
            />
          </Box>
          <Box>
            <Text size="sm" fw={500} c={fieldErrors.phoneNumber ? 'red' : 'dimmed'} mb={4}>
              {t('common.phoneNumber')}
            </Text>
            <EditField
              value={editData.phoneNumber ?? currentUser.phoneNumber ?? ''}
              editing={editing}
              label={t('common.phoneNumber')}
              error={fieldErrors.phoneNumber}
              onChange={value => updateField('phoneNumber', value)}
            />
          </Box>
          <Box>
            <Text size="sm" fw={500} c={fieldErrors.description ? 'red' : 'dimmed'} mb={4}>
              {t('common.description')}
            </Text>
            <EditField
              value={editData.description ?? currentUser.description}
              editing={editing}
              label={t('common.description')}
              error={fieldErrors.description}
              onChange={value => updateField('description', value)}
            />
          </Box>
        </Stack>
      </Paper>

      <Paper shadow="sm" p="lg" mt="lg">
        <Title order={5} mb="md">
          {t('account.preferences')}
        </Title>
        {languageError && (
          <Alert
            color="red"
            variant="light"
            mb="md"
            withCloseButton
            onClose={() => setLanguageError(null)}
          >
            {languageError}
          </Alert>
        )}
        <Stack gap="md">
          <Select
            label={t('account.language')}
            data={SUPPORTED_LANGUAGES.map(code => ({ value: code, label: LANGUAGE_LABELS[code] }))}
            value={currentUser.language}
            onChange={value => {
              if (value) void handleLanguageChange(value as Language);
            }}
          />
          {weekStartError && (
            <Alert
              color="red"
              variant="light"
              withCloseButton
              onClose={() => setWeekStartError(null)}
            >
              {weekStartError}
            </Alert>
          )}
          <Select
            label={t('account.weekStart')}
            data={WEEK_START_OPTIONS.map(option => ({
              value: option,
              label: t(`account.weekStart_${option}`),
            }))}
            value={currentUser.weekStart}
            onChange={value => {
              if (value) void handleWeekStartChange(value as WeekStart);
            }}
          />
        </Stack>
      </Paper>

      <Paper shadow="sm" p="lg" mt="lg">
        <Title order={5} mb="md">
          {t('account.loginMethods')}
        </Title>

        {accountsError && (
          <Alert
            color="red"
            variant="light"
            mb="md"
            withCloseButton
            onClose={() => setAccountsError(null)}
          >
            {accountsError}
          </Alert>
        )}

        {configuredProviders.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t('account.noProviders')}
          </Text>
        ) : (
          <Stack gap="sm">
            {configuredProviders.map(provider => {
              const account = authAccounts.find(a => a.provider === provider.id);
              return (
                <Group key={provider.id} justify="space-between" gap="md">
                  <Box>
                    <Text size="sm" fw={500}>
                      {provider.name}
                    </Text>
                    {account && (
                      <Text size="xs" c="dimmed">
                        {t('account.connectedAt', {
                          date: new Date(account.createdAt).toLocaleDateString(),
                        })}
                      </Text>
                    )}
                  </Box>
                  {account ? (
                    <Button
                      variant="outline"
                      onClick={() => handleDisconnect(provider.id)}
                      disabled={!canDisconnect}
                    >
                      {t('account.disconnect')}
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => handleConnect(provider.id)}>
                      {t('account.connect', { provider: provider.name })}
                    </Button>
                  )}
                </Group>
              );
            })}
            {!canDisconnect && authAccounts.length > 0 && (
              <Text size="xs" c="dimmed">
                {t('account.cannotDisconnectLast')}
              </Text>
            )}
          </Stack>
        )}
      </Paper>

      <Paper
        shadow="sm"
        p="lg"
        mt="lg"
        withBorder
        style={{ borderColor: 'var(--mantine-color-red-6)' }}
      >
        <Title order={5} c="red" mb="md">
          {t('account.dangerZone')}
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          {t('account.deleteAccountDescription')}
        </Text>
        <Button variant="outline" color="red" onClick={() => setDeleteDialogOpen(true)}>
          {t('account.deleteAccount')}
        </Button>
      </Paper>

      <Modal
        opened={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title={t('account.deleteAccountTitle')}
      >
        {deleteError && (
          <Alert color="red" variant="light" mb="md">
            {deleteError}
          </Alert>
        )}
        <Text size="sm">{t('account.deleteAccountConfirm')}</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setDeleteDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button color="red" variant="filled" onClick={handleDelete} disabled={deleting}>
            {t('account.confirmDelete')}
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}

export default AccountPage;
