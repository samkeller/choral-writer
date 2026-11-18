import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';

const config = {
  appPassword: 'test-password',
  cookieSecret: 'a-test-cookie-signing-secret-that-is-long-enough',
  nodeEnv: 'test' as const,
};

describe('authentication routes', () => {
  const apps: ReturnType<typeof buildApp>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function createApp() {
    const app = buildApp(config);
    apps.push(app);
    await app.ready();
    return app;
  }

  it('issues a signed, HTTP-only cookie and authenticates the session', async () => {
    const app = await createApp();
    const login = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { password: 'test-password' },
    });

    expect(login.statusCode).toBe(200);
    expect(login.headers['set-cookie']).toContain('HttpOnly');
    expect(login.headers['set-cookie']).toContain('SameSite=Strict');

    const session = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { cookie: login.headers['set-cookie'] as string },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toEqual({ authenticated: true });
  });

  it('rejects invalid credentials and malformed login requests', async () => {
    const app = await createApp();
    const invalidPassword = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: { password: 'wrong-password' },
    });
    const malformed = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: {},
    });

    expect(invalidPassword.statusCode).toBe(401);
    expect(invalidPassword.json().error.code).toBe('UNAUTHORIZED');
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().error.code).toBe('INVALID_REQUEST');
  });

  it('rejects unauthenticated access and tampered cookies', async () => {
    const app = await createApp();
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/session' });
    const tampered = await app.inject({
      method: 'GET',
      url: '/api/session',
      headers: { cookie: 'cw_auth=authenticated.invalid-signature' },
    });

    expect(unauthenticated.statusCode).toBe(401);
    expect(tampered.statusCode).toBe(401);
  });
});
