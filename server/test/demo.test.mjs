import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../index.mjs';
import { DEMO_ORG_ID, DEMO_SALE_ID } from '../demo.mjs';
import { resetData } from '../db.mjs';
import { resetRateLimits } from '../security.mjs';

const DEMO_CODE = 'unit-test-demo-access-1';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-0123456789';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://ubuntu:barnyard@127.0.0.1:5432/barnyard_test';
process.env.DEMO_ACCESS_CODE = DEMO_CODE;

let app;

function jar() {
  const cookies = new Map();
  return {
    setFrom(response) {
      const raw = response.headers.getSetCookie?.() || [];
      raw.forEach((line) => {
        const part = line.split(';')[0];
        const i = part.indexOf('=');
        if (i > 0) cookies.set(part.slice(0, i), part.slice(i + 1));
      });
    },
    header() {
      return Array.from(cookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
    }
  };
}

async function req(method, pathname, { cookieJar, body } = {}) {
  const headers = { 'X-Barnyard': '1', Origin: 'http://127.0.0.1', 'x-test-origin': '1' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookieJar && cookieJar.header()) headers.Cookie = cookieJar.header();
  const res = await fetch(app.url + pathname, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (cookieJar) cookieJar.setFrom(res);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

before(async () => {
  app = await createApp({ host: '127.0.0.1', port: 0, databaseUrl: process.env.DATABASE_URL, connectAttempts: 5 });
});

after(async () => {
  if (app) await app.close();
});

describe('demo access', () => {
  test('access page and status endpoint', async () => {
    const page = await fetch(app.url + '/access');
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Try the demo/);

    const status = await req('GET', '/api/access/status');
    assert.equal(status.status, 200);
    assert.equal(status.data.enabled, true);
  });

  test('demo login requires correct code and CSRF header', async () => {
    await resetData(app.pool);
    resetRateLimits();

    const bad = await req('POST', '/api/auth/demo', { body: { code: 'wrong-code' } });
    assert.equal(bad.status, 401);

    const demoJar = jar();
    const ok = await req('POST', '/api/auth/demo', { cookieJar: demoJar, body: { code: DEMO_CODE } });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.user.org.id, DEMO_ORG_ID);

    const sales = await req('GET', '/api/sales', { cookieJar: demoJar });
    const seeded = sales.data.sales.find((s) => s.id === DEMO_SALE_ID);
    assert.ok(seeded);
    assert.equal(seeded.data.isExample, true);
  });

  test('demo is disabled when DEMO_ACCESS_CODE is unset', async () => {
    const saved = process.env.DEMO_ACCESS_CODE;
    delete process.env.DEMO_ACCESS_CODE;
    resetRateLimits();
    try {
      const status = await req('GET', '/api/access/status');
      assert.equal(status.data.enabled, false);
      const denied = await req('POST', '/api/auth/demo', { body: { code: 'anything-valid-length' } });
      assert.equal(denied.status, 404);
    } finally {
      process.env.DEMO_ACCESS_CODE = saved;
    }
  });

  test('demo org is isolated from real organizations', async () => {
    await resetData(app.pool);
    resetRateLimits();

    const realJar = jar();
    await req('POST', '/api/auth/signup', {
      cookieJar: realJar,
      body: {
        name: 'Real Owner',
        email: 'real@example.com',
        password: 'password12',
        orgName: 'Real Fair'
      }
    });

    const secretId = 'eRealOnly';
    await req('POST', '/api/sync', {
      cookieJar: realJar,
      body: {
        push: [{ id: secretId, baseRev: 0, data: { id: secretId, name: 'Real sale', feePct: 0, lots: [], buyers: [] } }],
        known: []
      }
    });

    const demoJar = jar();
    await req('POST', '/api/auth/demo', { cookieJar: demoJar, body: { code: DEMO_CODE } });
    const demoSales = await req('GET', '/api/sales', { cookieJar: demoJar });
    assert.ok(demoSales.data.sales.some((s) => s.id === DEMO_SALE_ID));
    assert.equal(demoSales.data.sales.find((s) => s.id === secretId), undefined);

    const realSales = await req('GET', '/api/sales', { cookieJar: realJar });
    assert.equal(realSales.data.sales.find((s) => s.id === DEMO_SALE_ID), undefined);
    assert.ok(realSales.data.sales.some((s) => s.id === secretId));
  });
});