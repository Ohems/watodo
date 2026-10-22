import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/index.js';
import EditField from '../../components/EditField/EditField.js';
import { useAppDispatch, useAppSelector } from '../../hooks/redux.js';
import {
  deleteCurrentUser,
  fetchAuthAccounts,
  unlinkAuthAccount,
  updateCurrentUser,
} from '../../store/user-slice.js';
import type { AuthProviderInfo, FieldErrors, UserSelfUpdate } from '../../types/index.js';
import { validateUserSelfUpdate } from '../../validation.js';

/** Used when the provider list cannot be fetched from the API. */
const FALLBACK_PROVIDERS: AuthProviderInfo[] = [
  { id: 'discord', name: 'Discord', configured: false },
  { id: 'google', name: 'Google', configured: false },
  { id: 'microsoft', name: 'Microsoft', configured: false },
];

/**
 * Extracts a displayable message from a rejected thunk. `unwrap()` throws the
 * serialized error object ({ message, name, ... }), not an Error instance.
 */
function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

function AccountPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const currentUser = useAppSelector(state => state.user.currentUser);
  const authAccounts = useAppSelector(state => state.user.authAccounts);
  const [searchParams, setSearchParams] = useSearchParams();

  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<UserSelfUpdate>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [providers, setProviders] = useState<AuthProviderInfo[] | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authApi
      .getProviders()
      .then(data => {
        if (!cancelled) setProviders(data.providers);
      })
      .catch(() => {
        if (!cancelled) setProviders(FALLBACK_PROVIDERS);
      });
    dispatch(fetchAuthAccounts());
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

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

  const configuredProviders = (providers ?? FALLBACK_PROVIDERS).filter(
    provider => provider.configured,
  );
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
    setSaving(true);
    try {
      await dispatch(updateCurrentUser(data)).unwrap();
      setEditing(false);
      setEditData({});
      setFieldErrors({});
    } catch (error) {
      // The frontend validation catches invalid fields before the request is
      // sent; a rejection here is unexpected and the backend message is shown.
      setProfileError(errorMessage(error, t('account.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const handleConnect = async (providerId: string) => {
    setLinkError(null);
    setAccountsError(null);
    try {
      const { authorizationUrl } = await authApi.startLink(providerId, '/account');
      window.location.href = authorizationUrl;
    } catch (error) {
      setAccountsError(errorMessage(error, t('account.connectFailed')));
    }
  };

  const handleDisconnect = async (providerId: string) => {
    setLinkError(null);
    setAccountsError(null);
    try {
      await dispatch(unlinkAuthAccount(providerId)).unwrap();
    } catch (error) {
      setAccountsError(errorMessage(error, t('account.disconnectFailed')));
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await dispatch(deleteCurrentUser()).unwrap();
      // The app switches to the login screen once the account is gone.
    } catch (error) {
      setDeleteError(errorMessage(error, t('account.deleteFailed')));
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <Box sx={{ p: 2, maxWidth: 600, mx: 'auto' }}>
      {linkError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setLinkError(null)}>
          {linkError}
        </Alert>
      )}

      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h4">{t('account.title')}</Typography>
          {!editing ? (
            <Button variant="contained" onClick={startEditing}>
              {t('common.edit')}
            </Button>
          ) : (
            <Box>
              <Button variant="outlined" onClick={handleCancel} sx={{ mr: 1 }}>
                {t('common.cancel')}
              </Button>
              <Button variant="contained" onClick={handleSave} disabled={saving}>
                {t('common.save')}
              </Button>
            </Box>
          )}
        </Box>

        {profileError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {profileError}
          </Alert>
        )}

        <Typography variant="h6" gutterBottom>
          {t('account.personalInfo')}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="subtitle2" color={fieldErrors.name ? 'error' : 'text.secondary'}>
              {t('common.name')}
            </Typography>
            <EditField
              value={editData.name ?? currentUser.name}
              editing={editing}
              label={t('common.name')}
              error={fieldErrors.name}
              onChange={value => updateField('name', value)}
            />
          </Box>
          <Box>
            <Typography variant="subtitle2" color={fieldErrors.email ? 'error' : 'text.secondary'}>
              {t('common.email')}
            </Typography>
            <EditField
              value={editData.email ?? currentUser.email}
              editing={editing}
              label={t('common.email')}
              error={fieldErrors.email}
              onChange={value => updateField('email', value)}
            />
          </Box>
          <Box>
            <Typography
              variant="subtitle2"
              color={fieldErrors.phoneNumber ? 'error' : 'text.secondary'}
            >
              {t('common.phoneNumber')}
            </Typography>
            <EditField
              value={editData.phoneNumber ?? currentUser.phoneNumber ?? ''}
              editing={editing}
              label={t('common.phoneNumber')}
              error={fieldErrors.phoneNumber}
              onChange={value => updateField('phoneNumber', value)}
            />
          </Box>
          <Box>
            <Typography
              variant="subtitle2"
              color={fieldErrors.description ? 'error' : 'text.secondary'}
            >
              {t('common.description')}
            </Typography>
            <EditField
              value={editData.description ?? currentUser.description}
              editing={editing}
              label={t('common.description')}
              error={fieldErrors.description}
              onChange={value => updateField('description', value)}
            />
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('account.loginMethods')}
        </Typography>

        {accountsError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setAccountsError(null)}>
            {accountsError}
          </Alert>
        )}

        {configuredProviders.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('account.noProviders')}
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {configuredProviders.map(provider => {
              const account = authAccounts.find(a => a.provider === provider.id);
              return (
                <Box
                  key={provider.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                  }}
                >
                  <Box>
                    <Typography variant="body1">{provider.name}</Typography>
                    {account && (
                      <Typography variant="caption" color="text.secondary">
                        {t('account.connectedAt', {
                          date: new Date(account.createdAt).toLocaleDateString(),
                        })}
                      </Typography>
                    )}
                  </Box>
                  {account ? (
                    <Button
                      variant="outlined"
                      onClick={() => handleDisconnect(provider.id)}
                      disabled={!canDisconnect}
                    >
                      {t('account.disconnect')}
                    </Button>
                  ) : (
                    <Button variant="outlined" onClick={() => handleConnect(provider.id)}>
                      {t('account.connect', { provider: provider.name })}
                    </Button>
                  )}
                </Box>
              );
            })}
            {!canDisconnect && authAccounts.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                {t('account.cannotDisconnectLast')}
              </Typography>
            )}
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 3, mt: 3, border: 1, borderColor: 'error.main' }}>
        <Typography variant="h6" gutterBottom color="error">
          {t('account.dangerZone')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('account.deleteAccountDescription')}
        </Typography>
        <Button variant="outlined" color="error" onClick={() => setDeleteDialogOpen(true)}>
          {t('account.deleteAccount')}
        </Button>
      </Paper>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('account.deleteAccountTitle')}</DialogTitle>
        <DialogContent>
          {deleteError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          )}
          <DialogContentText>{t('account.deleteAccountConfirm')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}>
            {t('account.confirmDelete')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default AccountPage;
