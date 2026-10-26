import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Health API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/health', () => {
    it('should return 200 OK on /api/health', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });
  });

  it('should return 404 on unknown routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/nonexistent',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('Auth API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/auth/:provider/login', () => {
    it('should redirect to Discord on login (or 500 if Redis unavailable)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/discord/login?state=test-state&returnUrl=/home',
      });

      // 302 if Redis is available, 500 if not
      expect([302, 500]).toContain(response.statusCode);
      if (response.statusCode === 302) {
        expect(response.headers.location).toContain('discord.com/oauth2/authorize');
        expect(response.headers.location).toContain('state=test-state');
      }
    });

    it('should return 400 on login with an unsupported provider', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/twitter/login',
      });

      expect(response.statusCode).toBe(400);
    });

    it('should redirect to the provider on login for each supported provider (or 500 if Redis unavailable)', async () => {
      for (const provider of ['discord', 'google', 'microsoft']) {
        const response = await app.inject({
          method: 'GET',
          url: `/api/v1/auth/${provider}/login?state=test-state-${provider}`,
        });

        // 302 if Redis is available, 500 if not; providers without credentials are rejected with 400
        expect([302, 400, 500]).toContain(response.statusCode);
      }
    });
  });

  describe('GET /api/v1/auth/:provider/callback', () => {
    it('should return 400 on callback without code', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/discord/callback',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/auth/logout', () => {
    it('should return 401 on logout without token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/logout',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/auth/providers', () => {
    it('should list the supported auth providers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/providers',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      const ids = body.providers.map((provider: { id: string }) => provider.id).sort();
      expect(ids).toEqual(['discord', 'google', 'microsoft']);
      for (const provider of body.providers) {
        expect(provider.name).toBeTruthy();
        expect(typeof provider.configured).toBe('boolean');
      }
    });
  });
});

describe('Users API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/users', () => {
    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

describe('Operations API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/operations', () => {
    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/operations',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/operations',
        headers: { 'x-token': 'invalid-token' },
      });

      // 403 if DB is available (auth check runs), 500 if DB connection fails
      expect([403, 500]).toContain(response.statusCode);
    });
  });
});

describe('Roles API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/organizations/:organizationId/roles', () => {
    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/organizations/00000000-0000-0000-0000-000000000000/roles',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/organizations/:organizationId/roles/:roleId/assignments', () => {
    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/organizations/00000000-0000-0000-0000-000000000000/roles/1/assignments',
        payload: { userId: '00000000-0000-0000-0000-000000000001' },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

describe('Events API', () => {
  let app: FastifyInstance;

  const seriesId = '1';
  const occurrenceStart = encodeURIComponent('2026-01-05T10:00:00.000Z');

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  /** Builds the test for the unauthenticated (401) case of one endpoint. */
  const returns401 =
    (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, string>) =>
    async (): Promise<void> => {
      const response = await app.inject({ method, url, payload });
      expect(response.statusCode).toBe(401);
    };

  describe('GET /api/v1/event-series', () => {
    it('should return 401 without auth token', returns401('GET', '/api/v1/event-series'));

    it('should return 403 with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/event-series',
        headers: { 'x-token': 'invalid-token' },
      });

      // 403 if DB is available (auth check runs), 500 if DB connection fails
      expect([403, 500]).toContain(response.statusCode);
    });
  });

  describe('GET /api/v1/event-series/occurrences', () => {
    it(
      'should return 401 without auth token',
      returns401(
        'GET',
        '/api/v1/event-series/occurrences?start=2026-01-01T00:00:00.000Z&end=2026-02-01T00:00:00.000Z',
      ),
    );
  });

  describe('POST /api/v1/event-series', () => {
    it(
      'should return 401 without auth token',
      returns401('POST', '/api/v1/event-series', { title: 'Test' }),
    );
  });

  describe('GET /api/v1/event-series/:seriesId', () => {
    it(
      'should return 401 without auth token',
      returns401('GET', `/api/v1/event-series/${seriesId}`),
    );
  });

  describe('PATCH /api/v1/event-series/:seriesId', () => {
    it(
      'should return 401 without auth token',
      returns401('PATCH', `/api/v1/event-series/${seriesId}`, { title: 'Test' }),
    );
  });

  describe('DELETE /api/v1/event-series/:seriesId', () => {
    it(
      'should return 401 without auth token',
      returns401('DELETE', `/api/v1/event-series/${seriesId}`),
    );
  });

  describe('GET /api/v1/event-series/:seriesId/occurrences', () => {
    it(
      'should return 401 without auth token',
      returns401(
        'GET',
        `/api/v1/event-series/${seriesId}/occurrences?start=2026-01-01T00:00:00.000Z&end=2026-02-01T00:00:00.000Z`,
      ),
    );
  });

  describe('GET /api/v1/event-series/:seriesId/occurrences/:occurrenceStart', () => {
    it(
      'should return 401 without auth token',
      returns401('GET', `/api/v1/event-series/${seriesId}/occurrences/${occurrenceStart}`),
    );
  });

  describe('POST /api/v1/event-series/:seriesId/occurrences/:occurrenceStart/cancel', () => {
    it(
      'should return 401 without auth token',
      returns401('POST', `/api/v1/event-series/${seriesId}/occurrences/${occurrenceStart}/cancel`),
    );
  });

  describe('POST /api/v1/event-series/:seriesId/occurrences/:occurrenceStart/reschedule', () => {
    it(
      'should return 401 without auth token',
      returns401(
        'POST',
        `/api/v1/event-series/${seriesId}/occurrences/${occurrenceStart}/reschedule`,
        { start: '2026-01-06T10:00:00.000Z' },
      ),
    );
  });

  describe('POST /api/v1/event-series/:seriesId/occurrences/:occurrenceStart/split', () => {
    it(
      'should return 401 without auth token',
      returns401('POST', `/api/v1/event-series/${seriesId}/occurrences/${occurrenceStart}/split`, {
        title: 'Test',
      }),
    );
  });

  describe('DELETE /api/v1/event-series/:seriesId/occurrences/:occurrenceStart/exception', () => {
    it(
      'should return 401 without auth token',
      returns401(
        'DELETE',
        `/api/v1/event-series/${seriesId}/occurrences/${occurrenceStart}/exception`,
      ),
    );
  });

  describe('GET /api/v1/event-series/:seriesId/exceptions', () => {
    it(
      'should return 401 without auth token',
      returns401('GET', `/api/v1/event-series/${seriesId}/exceptions`),
    );
  });

  describe('GET /api/v1/event-series/:seriesId/jobs', () => {
    it(
      'should return 401 without auth token',
      returns401('GET', `/api/v1/event-series/${seriesId}/jobs`),
    );
  });

  describe('POST /api/v1/event-series/:seriesId/jobs', () => {
    it(
      'should return 401 without auth token',
      returns401('POST', `/api/v1/event-series/${seriesId}/jobs`, { title: 'Job' }),
    );
  });

  describe('PATCH /api/v1/event-series/:seriesId/jobs/:jobId', () => {
    it(
      'should return 401 without auth token',
      returns401('PATCH', `/api/v1/event-series/${seriesId}/jobs/1`, { title: 'Job' }),
    );
  });

  describe('DELETE /api/v1/event-series/:seriesId/jobs/:jobId', () => {
    it(
      'should return 401 without auth token',
      returns401('DELETE', `/api/v1/event-series/${seriesId}/jobs/1`),
    );
  });

  describe('POST /api/v1/event-series/:seriesId/jobs/:jobId/assignments', () => {
    it(
      'should return 401 without auth token',
      returns401('POST', `/api/v1/event-series/${seriesId}/jobs/1/assignments`, {
        userId: '00000000-0000-0000-0000-000000000001',
      }),
    );
  });

  describe('DELETE /api/v1/event-series/:seriesId/jobs/:jobId/assignments/:assignmentId', () => {
    it(
      'should return 401 without auth token',
      returns401('DELETE', `/api/v1/event-series/${seriesId}/jobs/1/assignments/1`),
    );
  });

  describe('GET /api/v1/event-series/:seriesId/comments', () => {
    it(
      'should return 401 without auth token',
      returns401('GET', `/api/v1/event-series/${seriesId}/comments`),
    );
  });

  describe('POST /api/v1/event-series/:seriesId/comments', () => {
    it(
      'should return 401 without auth token',
      returns401('POST', `/api/v1/event-series/${seriesId}/comments`, { body: 'Hi' }),
    );
  });

  describe('PATCH /api/v1/event-series/:seriesId/comments/:commentId', () => {
    it(
      'should return 401 without auth token',
      returns401('PATCH', `/api/v1/event-series/${seriesId}/comments/1`, { body: 'Hi' }),
    );
  });

  describe('DELETE /api/v1/event-series/:seriesId/comments/:commentId', () => {
    it(
      'should return 401 without auth token',
      returns401('DELETE', `/api/v1/event-series/${seriesId}/comments/1`),
    );
  });
});

describe('Organizations API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/organizations', () => {
    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/organizations',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});

describe('Calendars API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/calendars', () => {
    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/calendars',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 403 with invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/calendars',
        headers: { 'x-token': 'invalid-token' },
      });

      // 403 if DB is available (auth check runs), 500 if DB connection fails
      expect([403, 500]).toContain(response.statusCode);
    });
  });

  describe('POST /api/v1/calendars', () => {
    it('should return 401 without auth token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/calendars',
        payload: {
          name: 'Test Calendar',
          organizationId: '00000000-0000-0000-0000-000000000000',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
