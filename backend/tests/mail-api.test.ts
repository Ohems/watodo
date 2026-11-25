import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// nodemailer is mocked so the smtp provider never opens a real connection.
vi.mock('nodemailer', () => ({
  createTransport: vi.fn(() => ({ sendMail: vi.fn().mockResolvedValue({ messageId: 'mock' }) })),
}));

import { createTransport } from 'nodemailer';
import { buildApp } from '../src/app.js';
import { type Config, config } from '../src/config.js';
import { db } from '../src/database.js';
import { deliverEmailIfEnabled } from '../src/services/email-service.js';
import {
  getConfiguredMailProvider,
  getMailProvider,
  isSupportedMailProvider,
  SUPPORTED_MAIL_PROVIDERS,
} from '../src/services/mail-providers/index.js';
import { createNotification } from '../src/services/notification-service.js';
import { createUser, resetDatabase, type TestUser } from './helpers/fixtures.js';

// Integration tests for the modular mail providers and email notification
// delivery. The mail-related config values are mutated per test (the providers
// read them lazily via getters) and restored afterwards. fetch is stubbed so no
// real HTTP request leaves the test; nodemailer is mocked. Every test resets the
// database (beforeEach) and rebuilds the fixture, so tests are independent.

const mutableConfig = config as { -readonly [K in keyof Config]: Config[K] };

const MAIL_CONFIG_KEYS = [
  'mailProvider',
  'mailFrom',
  'appUrl',
  'resendApiKey',
  'mailgunApiKey',
  'mailgunDomain',
  'mailgunRegion',
  'usesendApiKey',
  'usesendBaseUrl',
  'smtpHost',
  'smtpPort',
  'smtpSecure',
  'smtpUser',
  'smtpPass',
] as const;

const fetchMock = vi.fn();
const createTransportMock = vi.mocked(createTransport);

function okResponse(): Response {
  return { ok: true, status: 200, text: () => Promise.resolve('') } as Response;
}

function configureResend(): void {
  mutableConfig.mailProvider = 'resend';
  mutableConfig.mailFrom = 'Watodo <notifications@example.com>';
  mutableConfig.resendApiKey = 're_test_key';
}

describe('Mail API', () => {
  let app: FastifyInstance;
  let user: TestUser;
  let saved: Record<string, unknown>;

  const auth = (token: string) => ({ 'x-token': token });

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase();
    user = await createUser('Mail User');
    saved = {};
    for (const key of MAIL_CONFIG_KEYS) {
      saved[key] = mutableConfig[key];
      (mutableConfig as Record<string, unknown>)[key] = '';
    }
    mutableConfig.mailgunRegion = 'us';
    mutableConfig.usesendBaseUrl = 'https://api.usesend.com';
    mutableConfig.smtpPort = 587;
    mutableConfig.smtpSecure = false;
    mutableConfig.appUrl = 'http://localhost:5173';
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);
    createTransportMock.mockClear();
  });

  afterEach(() => {
    for (const key of MAIL_CONFIG_KEYS) {
      (mutableConfig as Record<string, unknown>)[key] = saved[key];
    }
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('mail provider registry', () => {
    it('supports resend, mailgun, usesend and smtp', () => {
      expect([...SUPPORTED_MAIL_PROVIDERS].sort()).toEqual([
        'mailgun',
        'resend',
        'smtp',
        'usesend',
      ]);
      expect(isSupportedMailProvider('resend')).toBe(true);
      expect(isSupportedMailProvider('bogus')).toBe(false);
    });

    it('returns null when no provider is selected', () => {
      expect(getConfiguredMailProvider()).toBeNull();
    });

    it('returns null for an unknown provider', () => {
      mutableConfig.mailProvider = 'bogus';
      expect(getConfiguredMailProvider()).toBeNull();
    });

    it('returns null when the selected provider misses credentials', () => {
      mutableConfig.mailProvider = 'resend';
      mutableConfig.mailFrom = 'Watodo <notifications@example.com>';
      // no RESEND_API_KEY
      expect(getConfiguredMailProvider()).toBeNull();
    });

    it('returns the configured provider when selected and complete', () => {
      configureResend();
      expect(getConfiguredMailProvider()?.id).toBe('resend');
    });
  });

  describe('resend provider', () => {
    it('posts to the Resend API with a bearer key and JSON body', async () => {
      configureResend();
      await getMailProvider('resend').sendMail({
        to: 'user@example.com',
        subject: 'Subject',
        text: 'Text body',
        html: '<p>Text body</p>',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('https://api.resend.com/emails');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key');
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.from).toBe('Watodo <notifications@example.com>');
      expect(body.to).toEqual(['user@example.com']);
      expect(body.subject).toBe('Subject');
      expect(body.text).toBe('Text body');
      expect(body.html).toBe('<p>Text body</p>');
    });

    it('throws on a non-2xx answer', async () => {
      configureResend();
      fetchMock.mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve('invalid from'),
      } as Response);
      await expect(
        getMailProvider('resend').sendMail({
          to: 'u@example.com',
          subject: 's',
          text: 't',
          html: 'h',
        }),
      ).rejects.toThrow('422');
    });
  });

  describe('mailgun provider', () => {
    it('posts a form to the regional messages endpoint with basic auth', async () => {
      mutableConfig.mailProvider = 'mailgun';
      mutableConfig.mailFrom = 'Watodo <notifications@example.com>';
      mutableConfig.mailgunApiKey = 'key-123';
      mutableConfig.mailgunDomain = 'mg.example.com';
      mutableConfig.mailgunRegion = 'eu';
      await getMailProvider('mailgun').sendMail({
        to: 'user@example.com',
        subject: 'Subject',
        text: 'Text body',
        html: '<p>Text body</p>',
      });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('https://api.eu.mailgun.net/v3/mg.example.com/messages');
      const expectedAuth = `Basic ${Buffer.from('api:key-123').toString('base64')}`;
      expect((init.headers as Record<string, string>).Authorization).toBe(expectedAuth);
      const body = init.body as URLSearchParams;
      expect(body.get('from')).toBe('Watodo <notifications@example.com>');
      expect(body.get('to')).toBe('user@example.com');
      expect(body.get('subject')).toBe('Subject');
      expect(body.get('text')).toBe('Text body');
      expect(body.get('html')).toBe('<p>Text body</p>');
    });
  });

  describe('usesend provider', () => {
    it('posts to the cloud API by default and to a self-hosted base URL when set', async () => {
      mutableConfig.mailFrom = 'Watodo <notifications@example.com>';
      mutableConfig.usesendApiKey = 'usesend_key';
      await getMailProvider('usesend').sendMail({
        to: 'user@example.com',
        subject: 'Subject',
        text: 't',
        html: 'h',
      });
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.usesend.com/v1/emails');

      fetchMock.mockClear();
      mutableConfig.usesendBaseUrl = 'https://usesend.internal.example/';
      await getMailProvider('usesend').sendMail({
        to: 'user@example.com',
        subject: 'Subject',
        text: 't',
        html: 'h',
      });
      expect(fetchMock.mock.calls[0][0]).toBe('https://usesend.internal.example/v1/emails');
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer usesend_key');
    });
  });

  describe('smtp provider', () => {
    it('sends through a nodemailer transport built from the SMTP settings', async () => {
      mutableConfig.mailFrom = 'Watodo <notifications@example.com>';
      mutableConfig.smtpHost = 'smtp.example.com';
      mutableConfig.smtpPort = 465;
      mutableConfig.smtpSecure = true;
      mutableConfig.smtpUser = 'smtp-user';
      mutableConfig.smtpPass = 'smtp-pass';
      await getMailProvider('smtp').sendMail({
        to: 'user@example.com',
        subject: 'Subject',
        text: 't',
        html: 'h',
      });
      expect(createTransportMock).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        auth: { user: 'smtp-user', pass: 'smtp-pass' },
      });
      const transport = createTransportMock.mock.results[0].value as {
        sendMail: ReturnType<typeof vi.fn>;
      };
      expect(transport.sendMail).toHaveBeenCalledWith({
        from: 'Watodo <notifications@example.com>',
        to: 'user@example.com',
        subject: 'Subject',
        text: 't',
        html: 'h',
      });
    });
  });

  describe('email delivery', () => {
    const params = { role: 'Room setup', eventTitle: 'Weekly Community Meeting' };

    async function enableEmailPreference(userId: string, messageKey: string): Promise<void> {
      await db
        .insertInto('notification_preferences')
        .values({ user_id: userId, message_key: messageKey, channel: 'email', enabled: true })
        .execute();
    }

    it('does not send when the user has no email preference (email is opt-in)', async () => {
      configureResend();
      await deliverEmailIfEnabled(db, user.id, 'workRoleAssigned', params);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not send when the email preference is off', async () => {
      configureResend();
      await db
        .insertInto('notification_preferences')
        .values({
          user_id: user.id,
          message_key: 'workRoleAssigned',
          channel: 'email',
          enabled: false,
        })
        .execute();
      await deliverEmailIfEnabled(db, user.id, 'workRoleAssigned', params);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not send when no mail provider is configured', async () => {
      await enableEmailPreference(user.id, 'workRoleAssigned');
      await deliverEmailIfEnabled(db, user.id, 'workRoleAssigned', params);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends a rendered email to the user when opted in and configured', async () => {
      configureResend();
      await enableEmailPreference(user.id, 'workRoleAssigned');
      await deliverEmailIfEnabled(db, user.id, 'workRoleAssigned', params);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      const body = JSON.parse(init.body as string) as {
        from: string;
        to: string[];
        subject: string;
        text: string;
        html: string;
      };
      expect(body.to).toEqual([user.email]);
      // Rendered server-side in the user's language (en-GB by default).
      expect(body.subject).toBe('You have been assigned a work role');
      expect(body.text).toContain('You are assigned to "Room setup" for Weekly Community Meeting.');
      expect(body.text).toContain('http://localhost:5173');
      expect(body.html).toContain('You are assigned to &quot;Room setup&quot;');
    });

    it('never throws when the provider fails', async () => {
      configureResend();
      await enableEmailPreference(user.id, 'workRoleAssigned');
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('boom'),
      } as Response);
      await expect(
        deliverEmailIfEnabled(db, user.id, 'workRoleAssigned', params),
      ).resolves.toBeUndefined();
    });

    it('emails when a notification row is created and email is opted in', async () => {
      configureResend();
      await enableEmailPreference(user.id, 'workRoleAssigned');
      const created = await createNotification(user.id, 'workRoleAssigned', params);
      expect(created).not.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not email a notification suppressed for the in-app channel', async () => {
      configureResend();
      await enableEmailPreference(user.id, 'workRoleAssigned');
      await db
        .insertInto('notification_preferences')
        .values({
          user_id: user.id,
          message_key: 'workRoleAssigned',
          channel: 'in_app',
          enabled: false,
        })
        .execute();
      const created = await createNotification(user.id, 'workRoleAssigned', params);
      expect(created).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/notifications/mail-status', () => {
    it('reports not configured by default', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications/mail-status',
        headers: auth(user.token),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ configured: false, provider: null });
    });

    it('reports the configured provider', async () => {
      configureResend();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications/mail-status',
        headers: auth(user.token),
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ configured: true, provider: 'resend' });
    });

    it('returns 401 without a token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications/mail-status',
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
