import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getToken, setToken } from '../../api/index.js';
import i18n from '../../i18n/index.js';
import { type MockApi, mockApi } from '../../test/api-mock.js';
import { renderWithProviders } from '../../test/test-utils.js';
import type {
  AuthAccount,
  AuthProviderInfo,
  NotificationPreferencesResponse,
  PushSubscription,
  User,
  UserSelfUpdate,
} from '../../types/index.js';
import AccountPage from './Account.js';

/** A valid-looking base64url VAPID public key (65-byte P-256 point). */
const MOCK_VAPID_PUBLIC_KEY =
  'BNUmgNFGR-ttXNJe1Bm0SQ2-17fSZ2Zt7SZIQ0Qu3-IMNNh2nTt1iEc8-PbscygX2qpC634VoAmEta8tnFEZRF8';

const mockUser: User = {
  id: 'u1',
  name: 'Alice',
  email: 'alice@example.com',
  description: 'About Alice',
  phoneNumber: '+358401234567',
  language: 'en-GB',
  weekStart: 'sunday',
  dateFormat: 'ymd',
  timeFormat: '24h',
  permissions: [],
  state: 'active',
  isEmployed: false,
  isSuspended: false,
  isBlocked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockProviders: AuthProviderInfo[] = [
  { id: 'discord', name: 'Discord', configured: true },
  { id: 'google', name: 'Google', configured: true },
  { id: 'microsoft', name: 'Microsoft', configured: true },
];

const mockAuthAccounts: AuthAccount[] = [
  { provider: 'discord', providerAccountId: 'discord-1', createdAt: '2026-01-01T00:00:00.000Z' },
];

interface AccountRoutes {
  currentUser: User;
  authAccounts: AuthAccount[];
  accountDeleted: boolean;
  preferences: NotificationPreferencesResponse;
  vapidPublicKey: string;
  pushSubscriptions: PushSubscription[];
}

/** Three notification types x three channels across both categories, with one stored override. */
const mockPreferences: NotificationPreferencesResponse = {
  channels: ['in_app', 'email', 'push'],
  preferences: [
    { messageKey: 'workRoleAssigned', channel: 'in_app', enabled: true, category: 'general' },
    { messageKey: 'workRoleAssigned', channel: 'email', enabled: true, category: 'general' },
    { messageKey: 'workRoleAssigned', channel: 'push', enabled: false, category: 'general' },
    { messageKey: 'eventCancelled', channel: 'in_app', enabled: true, category: 'general' },
    { messageKey: 'eventCancelled', channel: 'email', enabled: false, category: 'general' },
    { messageKey: 'eventCancelled', channel: 'push', enabled: false, category: 'general' },
    {
      messageKey: 'unfilledCriticalSlot',
      channel: 'in_app',
      enabled: true,
      category: 'management',
    },
    { messageKey: 'unfilledCriticalSlot', channel: 'email', enabled: true, category: 'management' },
    { messageKey: 'unfilledCriticalSlot', channel: 'push', enabled: false, category: 'management' },
  ],
};

/** Registers stateful routes: mutations update the served data. */
function mockAccountRoutes(mock: MockApi, state: AccountRoutes) {
  mock.on(
    'GET',
    '/api/v1/users/@me',
    () => (state.accountDeleted ? { error: 'Unauthorized' } : state.currentUser),
    () => (state.accountDeleted ? 401 : 200),
  );
  mock.on('GET', '/api/v1/auth/providers', { providers: mockProviders });
  mock.on('GET', '/api/v1/users/@me/auth-accounts', () => state.authAccounts);
  mock.on('GET', '/api/v1/users/@me/notification-preferences', () => state.preferences);
  mock.on('PATCH', /\/api\/v1\/users\/@me\/notification-preferences\//, () => {
    const last = mock.calls[mock.calls.length - 1];
    const segment = last.url.split('/notification-preferences/')[1].split('?')[0];
    const [messageKey, channel] = segment.split('/');
    const body = last.body as { enabled: boolean };
    state.preferences = {
      ...state.preferences,
      preferences: state.preferences.preferences.map(p =>
        p.messageKey === messageKey && p.channel === channel ? { ...p, enabled: body.enabled } : p,
      ),
    };
    const updated = state.preferences.preferences.find(
      p => p.messageKey === messageKey && p.channel === channel,
    );
    return { messageKey, channel, enabled: body.enabled, category: updated?.category };
  });
  mock.on('PATCH', '/api/v1/users/@me', () => {
    const body = mock.lastBody('PATCH', '/api/v1/users/@me') as UserSelfUpdate;
    state.currentUser = {
      ...state.currentUser,
      name: body.name ?? state.currentUser.name,
      email: body.email ?? state.currentUser.email,
      description: body.description ?? state.currentUser.description,
      phoneNumber:
        body.phoneNumber === undefined ? state.currentUser.phoneNumber : body.phoneNumber,
      language: body.language ?? state.currentUser.language,
      weekStart: body.weekStart ?? state.currentUser.weekStart,
      dateFormat: body.dateFormat ?? state.currentUser.dateFormat,
      timeFormat: body.timeFormat ?? state.currentUser.timeFormat,
    };
    return state.currentUser;
  });
  mock.on('DELETE', '/api/v1/users/@me', () => {
    state.accountDeleted = true;
  });
  mock.on('GET', '/api/v1/push/vapid-public-key', () => ({ publicKey: state.vapidPublicKey }));
  mock.on('GET', '/api/v1/users/@me/push-subscriptions', () => state.pushSubscriptions);
  mock.on('POST', '/api/v1/users/@me/push-subscriptions', () => {
    const body = mock.lastBody('POST', '/api/v1/users/@me/push-subscriptions') as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      userAgent?: string;
    };
    const subscription: PushSubscription = {
      id: state.pushSubscriptions.length + 1,
      endpoint: body.endpoint,
      userAgent: body.userAgent ?? null,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    state.pushSubscriptions = [...state.pushSubscriptions, subscription];
    return subscription;
  });
  mock.on('DELETE', /\/api\/v1\/users\/@me\/push-subscriptions\/\d+$/, () => {
    const last = mock.calls[mock.calls.length - 1];
    const id = Number(last.url.split('/push-subscriptions/')[1]);
    state.pushSubscriptions = state.pushSubscriptions.filter(s => s.id !== id);
    return { success: true };
  });
}

function renderPage(initialEntry = '/account') {
  return renderWithProviders(<AccountPage />, { route: initialEntry });
}

describe('AccountPage', () => {
  let mock: MockApi;
  let state: AccountRoutes;

  beforeEach(() => {
    mock = mockApi();
    localStorage.clear();
    void i18n.changeLanguage('en-GB');
    state = {
      currentUser: mockUser,
      authAccounts: [...mockAuthAccounts],
      accountDeleted: false,
      preferences: {
        channels: [...mockPreferences.channels],
        preferences: mockPreferences.preferences.map(p => ({ ...p })),
      },
      vapidPublicKey: MOCK_VAPID_PUBLIC_KEY,
      pushSubscriptions: [],
    };
    mockAccountRoutes(mock, state);
  });

  afterEach(() => {
    // Remove the push API stubs installed by individual tests.
    Reflect.deleteProperty(window.navigator, 'serviceWorker');
    Reflect.deleteProperty(window, 'PushManager');
    Reflect.deleteProperty(window, 'Notification');
  });

  /**
   * Stubs the browser push APIs (service worker, PushManager, Notification) so
   * isPushSupported() is true and the push section renders its switch.
   */
  function stubPushGlobals(options?: { permission?: string; existingEndpoint?: string | null }) {
    const endpoint = options?.existingEndpoint ?? 'https://push.example.com/sub-1';
    const subscription = {
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-secret' } }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    const pushManager = {
      subscribe: vi.fn().mockResolvedValue(subscription),
      getSubscription: vi.fn().mockResolvedValue(options?.existingEndpoint ? subscription : null),
    };
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager }) },
    });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        permission: options?.permission ?? 'default',
        requestPermission: vi.fn().mockResolvedValue(options?.permission ?? 'granted'),
      },
    });
    return { pushManager, subscription };
  }

  it('shows the personal information of the current user', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('+358401234567')).toBeInTheDocument();
    expect(screen.getByText('About Alice')).toBeInTheDocument();
  });

  it('saves edited personal information', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alice Cooper' } });
    fireEvent.change(screen.getByLabelText('Phone number'), {
      target: { value: '+35845123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mock.lastBody('PATCH', '/api/v1/users/@me')).toEqual({
        name: 'Alice Cooper',
        email: 'alice@example.com',
        description: 'About Alice',
        phoneNumber: '+35845123456',
      });
    });
    expect(await screen.findByText('Alice Cooper')).toBeInTheDocument();
  });

  it('clears the phone number when the field is emptied', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mock.lastBody('PATCH', '/api/v1/users/@me')).toEqual({
        name: 'Alice',
        email: 'alice@example.com',
        description: 'About Alice',
        phoneNumber: null,
      });
    });
  });

  it('shows an error when saving fails', async () => {
    mock.on(
      'PATCH',
      '/api/v1/users/@me',
      { error: 'A user with this email address already exists!' },
      400,
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('A user with this email address already exists!'),
    ).toBeInTheDocument();
  });

  it('shows a translatable field error and does not save when validation fails', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '0401234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Phone number must include the country code (e.g. +358401234567)'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mock.callCount('PATCH', '/api/v1/users/@me')).toBe(0);
    // The form stays in editing mode so the field can be corrected.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('shows field errors for an empty name and an invalid email', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(mock.callCount('PATCH', '/api/v1/users/@me')).toBe(0);
  });

  it('clears the field error when the field is corrected', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '0401234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Phone number must include the country code (e.g. +358401234567)'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+35845123456' } });
    expect(
      screen.queryByText('Phone number must include the country code (e.g. +358401234567)'),
    ).not.toBeInTheDocument();
  });

  it('shows the backend error message when a failure slips past the frontend validation', async () => {
    mock.on('PATCH', '/api/v1/users/@me', { error: 'Validation error' }, 400);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Validation error');
    expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
  });

  it('shows the language preference with the current language', async () => {
    renderPage();

    const select = await screen.findByRole('combobox', { name: 'Language' });
    expect(select).toHaveValue('English (UK)');
  });

  it('saves a changed language and switches the UI language', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('combobox', { name: 'Language' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Suomi', hidden: true }));

    await waitFor(() => {
      expect(mock.lastBody('PATCH', '/api/v1/users/@me')).toEqual({ language: 'fi' });
    });
    await waitFor(() => {
      expect(i18n.language).toBe('fi');
    });
    // The page re-renders in Finnish.
    expect(await screen.findByRole('heading', { name: 'Tili' })).toBeInTheDocument();
  });

  it('shows an error when changing the language fails', async () => {
    mock.on('PATCH', '/api/v1/users/@me', { error: 'Validation error' }, 400);
    renderPage();

    fireEvent.click(await screen.findByRole('combobox', { name: 'Language' }));
    fireEvent.click(await screen.findByRole('option', { name: 'English (US)', hidden: true }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Validation error');
    expect(i18n.language).toBe('en-GB');
  });

  it('shows the week start preference with the current week start', async () => {
    renderPage();

    const select = await screen.findByRole('combobox', { name: 'Week starts on' });
    expect(select).toHaveValue('Sunday');
  });

  it('saves a changed week start', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('combobox', { name: 'Week starts on' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Monday', hidden: true }));

    await waitFor(() => {
      expect(mock.lastBody('PATCH', '/api/v1/users/@me')).toEqual({ weekStart: 'monday' });
    });
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Week starts on' })).toHaveValue('Monday');
    });
  });

  it('shows an error when changing the week start fails', async () => {
    mock.on('PATCH', '/api/v1/users/@me', { error: 'Validation error' }, 400);
    renderPage();

    fireEvent.click(await screen.findByRole('combobox', { name: 'Week starts on' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Monday', hidden: true }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Validation error');
    expect(screen.getByRole('combobox', { name: 'Week starts on' })).toHaveValue('Sunday');
  });

  it('shows the date and time format preferences with the current values', async () => {
    renderPage();

    expect(await screen.findByRole('combobox', { name: 'Date format' })).toHaveValue(
      'YYYY-MM-DD (year-month-day)',
    );
    expect(screen.getByRole('combobox', { name: 'Time format' })).toHaveValue(
      '24-hour clock (14:30)',
    );
  });

  it('saves a changed date format', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('combobox', { name: 'Date format' }));
    fireEvent.click(
      await screen.findByRole('option', { name: 'DD/MM/YYYY (day-month-year)', hidden: true }),
    );

    await waitFor(() => {
      expect(mock.lastBody('PATCH', '/api/v1/users/@me')).toEqual({ dateFormat: 'dmy' });
    });
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Date format' })).toHaveValue(
        'DD/MM/YYYY (day-month-year)',
      );
    });
  });

  it('saves a changed time format', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('combobox', { name: 'Time format' }));
    fireEvent.click(
      await screen.findByRole('option', { name: '12-hour clock (2:30 PM)', hidden: true }),
    );

    await waitFor(() => {
      expect(mock.lastBody('PATCH', '/api/v1/users/@me')).toEqual({ timeFormat: '12h' });
    });
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Time format' })).toHaveValue(
        '12-hour clock (2:30 PM)',
      );
    });
  });

  it('shows an error when changing the time format fails', async () => {
    mock.on('PATCH', '/api/v1/users/@me', { error: 'Validation error' }, 400);
    renderPage();

    fireEvent.click(await screen.findByRole('combobox', { name: 'Time format' }));
    fireEvent.click(
      await screen.findByRole('option', { name: '12-hour clock (2:30 PM)', hidden: true }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Validation error');
    expect(screen.getByRole('combobox', { name: 'Time format' })).toHaveValue(
      '24-hour clock (14:30)',
    );
  });

  it('lists connected login methods and offers to connect the others', async () => {
    renderPage();

    expect(await screen.findByText('Discord')).toBeInTheDocument();
    expect(screen.getByText(/Connected/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Microsoft' })).toBeInTheDocument();
  });

  it('starts the OAuth link flow when connecting a provider', async () => {
    mock.on('POST', '/api/v1/auth/google/link', {
      authorizationUrl: 'https://provider.example/authorize?state=abc',
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Google' }));

    await waitFor(() => {
      expect(mock.lastBody('POST', '/api/v1/auth/google/link')).toEqual({
        returnUrl: '/account',
      });
    });
  });

  it('disconnects a login method', async () => {
    state.authAccounts = [
      ...mockAuthAccounts,
      { provider: 'google', providerAccountId: 'google-1', createdAt: '2026-01-02T00:00:00.000Z' },
    ];
    mock.on('DELETE', '/api/v1/users/@me/auth-accounts/google', () => {
      state.authAccounts = state.authAccounts.filter(account => account.provider !== 'google');
    });
    renderPage();

    const disconnectButtons = await screen.findAllByRole('button', { name: 'Disconnect' });
    expect(disconnectButtons).toHaveLength(2);
    fireEvent.click(disconnectButtons[1]);

    await waitFor(() => {
      expect(mock.callCount('DELETE', '/api/v1/users/@me/auth-accounts/google')).toBe(1);
    });
    expect(await screen.findByRole('button', { name: 'Connect Google' })).toBeInTheDocument();
  });

  it('disables disconnecting the last login method', async () => {
    renderPage();

    const disconnect = await screen.findByRole('button', { name: 'Disconnect' });
    expect(disconnect).toBeDisabled();
    expect(screen.getByText('You cannot disconnect your last login method.')).toBeInTheDocument();
  });

  it('shows the link error after a failed connect attempt', async () => {
    renderPage('/account?linkError=Already%20connected%20to%20a%20different%20user');

    expect(await screen.findByText('Already connected to a different user')).toBeInTheDocument();
  });

  it('shows the notification settings card grouped into categories, without a welcome toggle', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Notification settings' }),
    ).toBeInTheDocument();
    // The two category sections.
    expect(await screen.findByRole('heading', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Management' })).toBeInTheDocument();
    // Channel column headers, once per category table.
    expect(await screen.findAllByRole('columnheader', { name: 'In app' })).toHaveLength(2);
    expect(screen.getAllByRole('columnheader', { name: 'Email' })).toHaveLength(2);
    expect(screen.getAllByRole('columnheader', { name: 'Push' })).toHaveLength(2);
    // One row per notification type; the welcome type has no toggle.
    expect(screen.getByRole('cell', { name: /^Work role assigned$/ })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: /^Event cancelled$/ })).toBeInTheDocument();
    expect(
      screen.getByRole('cell', { name: /^Unfilled critical role alert$/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: /^Welcome$/ })).not.toBeInTheDocument();
    // Stored toggle states.
    expect(screen.getByRole('switch', { name: 'Work role assigned - In app' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Work role assigned - Push' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Event cancelled - Email' })).not.toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Unfilled critical role alert - In app' }),
    ).toBeChecked();
  });

  it('saves a toggled notification preference', async () => {
    renderPage();

    const toggle = await screen.findByRole('switch', { name: 'Work role assigned - Push' });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mock.callCount('PATCH', /notification-preferences/)).toBe(1);
    });
    expect(mock.lastBody('PATCH', /notification-preferences/)).toEqual({ enabled: true });
    const lastPatch = mock.calls.filter(c => c.method === 'PATCH').at(-1);
    expect(lastPatch?.url).toContain(
      '/api/v1/users/@me/notification-preferences/workRoleAssigned/push',
    );
    // The list refetches and the toggle reflects the saved value.
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Work role assigned - Push' })).toBeChecked();
    });
  });

  it('shows an error when saving a notification preference fails', async () => {
    mock.on('PATCH', /notification-preferences/, { error: 'Validation error' }, 400);
    renderPage();

    fireEvent.click(await screen.findByRole('switch', { name: 'Event cancelled - In app' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Validation error');
  });

  it('shows a not-supported hint for push notifications when the browser lacks push support', async () => {
    renderPage();

    expect(
      await screen.findByText(/This browser does not support push notifications/),
    ).toBeInTheDocument();
    // Without support the VAPID key is not even requested.
    expect(mock.callCount('GET', '/api/v1/push/vapid-public-key')).toBe(0);
    expect(
      screen.queryByRole('switch', { name: 'Enable push notifications on this device' }),
    ).not.toBeInTheDocument();
  });

  it('shows a not-configured hint when the server has no VAPID key', async () => {
    stubPushGlobals();
    state.vapidPublicKey = '';
    renderPage();

    expect(
      await screen.findByText(/Push notifications are not configured on this server yet/),
    ).toBeInTheDocument();
  });

  it('enables push notifications: subscribes in the browser and registers the endpoint', async () => {
    const { pushManager } = stubPushGlobals();
    renderPage();

    const toggle = await screen.findByRole('switch', {
      name: 'Enable push notifications on this device',
    });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mock.callCount('POST', '/api/v1/users/@me/push-subscriptions')).toBe(1);
    });
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(mock.lastBody('POST', '/api/v1/users/@me/push-subscriptions')).toEqual({
      endpoint: 'https://push.example.com/sub-1',
      keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
      userAgent: navigator.userAgent,
    });
    // After the refetch the toggle reflects the registered subscription.
    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Enable push notifications on this device' }),
      ).toBeChecked();
    });
  });

  it('disables push notifications: unsubscribes in the browser and deletes the endpoint', async () => {
    const { pushManager, subscription } = stubPushGlobals({
      existingEndpoint: 'https://push.example.com/sub-1',
    });
    state.pushSubscriptions = [
      {
        id: 7,
        endpoint: 'https://push.example.com/sub-1',
        userAgent: 'test-agent',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    renderPage();

    const toggle = await screen.findByRole('switch', {
      name: 'Enable push notifications on this device',
    });
    await waitFor(() => expect(toggle).toBeChecked());
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mock.callCount('DELETE', /push-subscriptions/)).toBe(1);
    });
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(pushManager.getSubscription).toHaveBeenCalled();
    const lastDelete = mock.calls.filter(c => c.method === 'DELETE').at(-1);
    expect(lastDelete?.url).toContain('/api/v1/users/@me/push-subscriptions/7');
    await waitFor(() => {
      expect(
        screen.getByRole('switch', { name: 'Enable push notifications on this device' }),
      ).not.toBeChecked();
    });
  });

  it('disables the push switch and shows a hint when notification permission is denied', async () => {
    stubPushGlobals({ permission: 'denied' });
    renderPage();

    const toggle = await screen.findByRole('switch', {
      name: 'Enable push notifications on this device',
    });
    expect(toggle).toBeDisabled();
    expect(await screen.findByText(/Notification permission was denied/)).toBeInTheDocument();
  });

  it('deletes the account after confirmation', async () => {
    setToken('test-token');
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    expect(await screen.findByRole('heading', { name: 'Delete account?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    await waitFor(() => {
      expect(mock.callCount('DELETE', '/api/v1/users/@me')).toBe(1);
    });
    await waitFor(() => {
      expect(getToken()).toBeNull();
    });
  });

  it('keeps the account when the deletion is cancelled', async () => {
    setToken('test-token');
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(mock.callCount('DELETE', '/api/v1/users/@me')).toBe(0);
    expect(getToken()).toBe('test-token');
  });
});
