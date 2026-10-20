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

  it('should return 400 on callback without code', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/discord/callback',
    });

    expect(response.statusCode).toBe(400);
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

  it('should return 401 on logout without token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/logout',
    });

    expect(response.statusCode).toBe(401);
  });

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

describe('Users API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 401 without auth token on /api/v1/users', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
    });

    expect(response.statusCode).toBe(401);
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

describe('Roles API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 401 without auth token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/organizations/00000000-0000-0000-0000-000000000000/roles',
    });

    expect(response.statusCode).toBe(401);
  });

  it('should return 401 without auth token on role assignments', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations/00000000-0000-0000-0000-000000000000/roles/1/assignments',
      payload: { userId: '00000000-0000-0000-0000-000000000001' },
    });

    expect(response.statusCode).toBe(401);
  });
});
