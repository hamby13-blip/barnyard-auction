import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../index.mjs';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-0123456789';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://ubuntu:barnyard@127.0.0.1:5432/barnyard_test';

let app;

before(async () => {
  app = await createApp({
    host: '127.0.0.1',
    port: 0,
    databaseUrl: process.env.DATABASE_URL,
    connectAttempts: 5
  });
});

after(async () => {
  if (app) await app.close();
});

test('html responses include security headers', async () => {
  const res = await fetch(app.url + '/');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  const csp = res.headers.get('content-security-policy') || '';
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /default-src 'self'/);
});

test('api errors do not return stack traces', async () => {
  const res = await fetch(app.url + '/api/does-not-exist', {
    headers: { Origin: new URL(app.url).origin, 'X-Barnyard': '1' }
  });
  assert.equal(res.status, 401);
  const body = await res.text();
  assert.doesNotMatch(body, /at /);
  assert.doesNotMatch(body, /stack/i);
});