import { afterEach, describe, expect, it } from 'vitest';
import { apiErrorSchema } from '@choral-writer/shared';

import { buildApp } from '../app.js';
import { serviceUnavailableError } from './errors.js';

describe('public API errors', () => {
  const apps: ReturnType<typeof buildApp>[] = [];
  afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

  function appWithError(error: Error) {
    const app = buildApp({
      appPassword: 'test',
      cookieSecret: 'test-signing-secret-with-thirty-two-characters',
      nodeEnv: 'test',
    });
    apps.push(app);
    app.get('/test-error', () => { throw error; });
    return app;
  }

  it('exposes an intentionally public message, including for a 5xx error, without serializing its cause', async () => {
    const app = appWithError(serviceUnavailableError('Maintenance en cours.', { cause: new Error('private database details') }));
    const response = await app.inject('/test-error');

    expect(response.statusCode).toBe(503);
    expect(apiErrorSchema.parse(response.json())).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Maintenance en cours.', status: 503, source: 'application' },
    });
    expect(response.body).not.toContain('private database details');
  });

  it('masks internal exceptions even when they contain a textual message', async () => {
    const app = appWithError(new Error('SQL failed: password=private-secret'));
    const response = await app.inject('/test-error');

    expect(response.statusCode).toBe(500);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(response.body).not.toContain('private-secret');
  });

  it('returns a public 404 response for unknown API routes', async () => {
    const app = buildApp({
      appPassword: 'test',
      cookieSecret: 'test-signing-secret-with-thirty-two-characters',
      nodeEnv: 'test',
    });
    apps.push(app);
    const response = await app.inject('/api/missing');

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('NOT_FOUND');
  });

  it('normalizes Fastify body parsing errors through the same contract', async () => {
    const app = appWithError(new Error('unused'));
    const response = await app.inject({
      method: 'POST', url: '/api/login',
      headers: { 'Content-Type': 'application/json' }, payload: '{',
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error).toMatchObject({
      status: 400, source: 'application', code: 'REQUEST_ERROR',
    });
  });
});
