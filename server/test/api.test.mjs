import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp, resetData, resetRateLimits } from '../index.mjs';

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

function jar() {
  return { cookie: '' };
}

function takeCookie(res, cookieJar) {
  const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const raw = list.length ? list : [];
  if (!raw.length && res.headers.get('set-cookie')) raw.push(res.headers.get('set-cookie'));
  for (const cookie of raw) {
    const pair = cookie.split(';')[0];
    if (pair.startsWith('ba_session=')) cookieJar.cookie = pair;
  }
}

async function req(method, path, { body, cookieJar, headers } = {}) {
  const res = await fetch(app.url + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' && method !== 'HEAD' ? { 'X-Barnyard': '1' } : {}),
      ...(cookieJar && cookieJar.cookie ? { Cookie: cookieJar.cookie } : {}),
      ...(headers || {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  if (cookieJar) takeCookie(res, cookieJar);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { status: res.status, data };
}

async function signup(cookieJar, extra = {}) {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const body = {
    name: extra.name || 'Ada Owner',
    email: extra.email || `ada-${stamp}@example.com`,
    password: extra.password || 'fair-week-1',
    orgName: extra.orgName || 'Wilkes County 4-H'
  };
  const res = await req('POST', '/api/auth/signup', { body, cookieJar });
  return { res, body };
}

describe('api', { concurrency: false }, () => {
  test('health does not require a session', async () => {
    await resetData(app.pool);
    const res = await req('GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.data.ok, true);
  });

  test('signup, login, session cookie, and logout', async () => {
    await resetData(app.pool);
    resetRateLimits();
    const cookieJar = jar();
    const created = await signup(cookieJar);
    assert.equal(created.res.status, 201);
    assert.equal(created.res.data.user.role, 'owner');
    assert.equal(created.res.data.user.org.name, 'Wilkes County 4-H');
    assert.equal(created.res.data.user.password, undefined);
    assert.ok(cookieJar.cookie.startsWith('ba_session='));
    assert.equal(cookieJar.cookie.includes('HttpOnly') , false);

    const me = await req('GET', '/api/auth/me', { cookieJar });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, created.body.email);

    const loggedOut = await req('POST', '/api/auth/logout', { cookieJar, body: {} });
    assert.equal(loggedOut.status, 200);
    const after = await req('GET', '/api/auth/me', { cookieJar });
    assert.equal(after.status, 401);

    const bad = await req('POST', '/api/auth/login', {
      body: { email: created.body.email, password: 'wrong-password' }
    });
    assert.equal(bad.status, 401);

    const again = jar();
    const good = await req('POST', '/api/auth/login', {
      cookieJar: again,
      body: { email: created.body.email, password: created.body.password }
    });
    assert.equal(good.status, 200);
    assert.equal(good.data.user.email, created.body.email);
    const me2 = await req('GET', '/api/auth/me', { cookieJar: again });
    assert.equal(me2.status, 200);
  });

  test('rejects short passwords, duplicate emails, and missing csrf header', async () => {
    await resetData(app.pool);
    const cookieJar = jar();
    const created = await signup(cookieJar, { email: 'dup@example.com' });
    assert.equal(created.res.status, 201);
    const dup = await signup(jar(), { email: 'dup@example.com' });
    assert.equal(dup.res.status, 409);
    const short = await signup(jar(), { email: 'short@example.com', password: 'short' });
    assert.equal(short.res.status, 400);
    const noHeader = await fetch(app.url + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dup@example.com', password: 'fair-week-1' })
    });
    assert.equal(noHeader.status, 403);
  });

  test('sales stay inside the organization and conflicts return the server copy', async () => {
    await resetData(app.pool);
    const owner = jar();
    await signup(owner, { email: 'owner-sales@example.com', orgName: 'Alexander FFA' });
    const other = jar();
    await signup(other, { email: 'other-sales@example.com', orgName: 'Other Club' });

    const id = 'eSaleOne';
    const data = { id, name: 'Spring Sale', feePct: 5, lots: [{ id: 'lot1', n: 1, ex: 'Sam', price: 80 }], buyers: [] };
    let synced = await req('POST', '/api/sync', {
      cookieJar: owner,
      body: { push: [{ id, baseRev: 0, deleted: false, data }], known: [] }
    });
    assert.equal(synced.status, 200);
    assert.equal(synced.data.results[0].ok, true);
    assert.equal(synced.data.results[0].rev, 1);

    const conflict = await req('POST', '/api/sync', {
      cookieJar: owner,
      body: { push: [{ id, baseRev: 0, deleted: false, data: { ...data, name: 'Stale' } }], known: [] }
    });
    assert.equal(conflict.data.results[0].ok, false);
    assert.equal(conflict.data.results[0].conflict, true);
    assert.equal(conflict.data.results[0].sale.rev, 1);
    assert.equal(conflict.data.results[0].sale.data.name, 'Spring Sale');

    const next = await req('POST', '/api/sync', {
      cookieJar: owner,
      body: { push: [{ id, baseRev: 1, deleted: false, data: { ...data, name: 'Spring Sale Final' } }], known: [{ id, rev: 1 }] }
    });
    assert.equal(next.data.results[0].ok, true);
    assert.equal(next.data.results[0].rev, 2);

    const mine = await req('GET', '/api/sales', { cookieJar: owner });
    assert.equal(mine.data.sales.filter((s) => !s.deleted).length, 1);
    assert.equal(mine.data.sales[0].data.lots[0].price, 80);

    const theirs = await req('GET', '/api/sales', { cookieJar: other });
    assert.equal(theirs.data.sales.length, 0);
    const unauth = await req('GET', '/api/sales');
    assert.equal(unauth.status, 401);
  });

  test('owner can add a clerk and an invite; clerks cannot manage people', async () => {
    await resetData(app.pool);
    const owner = jar();
    const created = await signup(owner, { email: 'owner-people@example.com', orgName: 'County Fair' });
    const added = await req('POST', '/api/org/clerks', {
      cookieJar: owner,
      body: { name: 'Riley Clerk', email: 'riley@example.com', password: 'clerk-pass-1' }
    });
    assert.equal(added.status, 201);
    assert.equal(added.data.user.role, 'clerk');

    const clerk = jar();
    const login = await req('POST', '/api/auth/login', {
      cookieJar: clerk,
      body: { email: 'riley@example.com', password: 'clerk-pass-1' }
    });
    assert.equal(login.status, 200);
    assert.equal(login.data.user.org.name, 'County Fair');

    const forbidden = await req('POST', '/api/org/clerks', {
      cookieJar: clerk,
      body: { name: 'Nope', email: 'nope@example.com', password: 'clerk-pass-1' }
    });
    assert.equal(forbidden.status, 403);

    const wrote = await req('POST', '/api/sync', {
      cookieJar: clerk,
      body: { push: [{ id: 'eClerk', baseRev: 0, data: { id: 'eClerk', name: 'Clerk sale', feePct: 0, lots: [], buyers: [] } }], known: [] }
    });
    assert.equal(wrote.data.results[0].ok, true);
    const ownerSees = await req('GET', '/api/sales', { cookieJar: owner });
    assert.ok(ownerSees.data.sales.some((s) => s.id === 'eClerk' && !s.deleted));

    const members = await req('GET', '/api/org/members', { cookieJar: clerk });
    assert.equal(members.status, 200);
    assert.equal(members.data.members.length, 2);

    const removeOwner = await req('DELETE', `/api/org/members/${created.res.data.user.id}`, { cookieJar: owner });
    assert.equal(removeOwner.status, 400);

    const invite = await req('POST', '/api/org/invites', {
      cookieJar: owner,
      body: { email: 'newclerk@example.com' }
    });
    assert.equal(invite.status, 201);
    const token = new URL('http://localhost' + invite.data.path).searchParams.get('invite');
    const preview = await req('GET', '/api/invites/' + encodeURIComponent(token));
    assert.equal(preview.status, 200);
    assert.equal(preview.data.email, 'newclerk@example.com');
    assert.equal(preview.data.orgName, 'County Fair');

    const joined = jar();
    const accept = await req('POST', '/api/auth/accept-invite', {
      cookieJar: joined,
      body: { token, name: 'New Clerk', password: 'invite-pass-1' }
    });
    assert.equal(accept.status, 201);
    assert.equal(accept.data.user.role, 'clerk');
    assert.equal(accept.data.user.org.id, created.res.data.user.org.id);

    const reuse = await req('POST', '/api/auth/accept-invite', {
      body: { token, name: 'Again', password: 'invite-pass-1' }
    });
    assert.equal(reuse.status, 400);

    const renamed = await req('PATCH', '/api/org', { cookieJar: owner, body: { name: 'County Fair 2026' } });
    assert.equal(renamed.status, 200);
    const clerkRename = await req('PATCH', '/api/org', { cookieJar: clerk, body: { name: 'Hijack' } });
    assert.equal(clerkRename.status, 403);

    const remove = await req('DELETE', `/api/org/members/${added.data.user.id}`, { cookieJar: owner });
    assert.equal(remove.status, 200);
    const clerkAfter = await req('GET', '/api/auth/me', { cookieJar: clerk });
    assert.equal(clerkAfter.status, 401);
  });

  test('owner can delete the organization with name confirmation', async () => {
    await resetData(app.pool);
    const owner = jar();
    const created = await signup(owner, { email: 'delete-org@example.com', orgName: 'Temp Fair Co' });
    const clerk = jar();
    await req('POST', '/api/org/clerks', {
      cookieJar: owner,
      body: { name: 'Helper', email: 'helper@example.com', password: 'clerk-pass-1' }
    });
    await req('POST', '/api/auth/login', {
      cookieJar: clerk,
      body: { email: 'helper@example.com', password: 'clerk-pass-1' }
    });
    await req('POST', '/api/sync', {
      cookieJar: owner,
      body: { push: [{ id: 'eDel', baseRev: 0, data: { id: 'eDel', name: 'Test', feePct: 0, lots: [], buyers: [] } }], known: [] }
    });

    const wrong = await req('DELETE', '/api/org', {
      cookieJar: owner,
      body: { confirmName: 'Wrong Name' }
    });
    assert.equal(wrong.status, 400);

    const other = jar();
    await signup(other, { email: 'survivor@example.com', orgName: 'Other Org' });

    const deleted = await req('DELETE', '/api/org', {
      cookieJar: owner,
      body: { confirmName: 'Temp Fair Co' }
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.data.ok, true);

    const gone = await req('GET', '/api/auth/me', { cookieJar: owner });
    assert.equal(gone.status, 401);
    const clerkGone = await req('GET', '/api/auth/me', { cookieJar: clerk });
    assert.equal(clerkGone.status, 401);

    const survivor = await req('GET', '/api/sales', { cookieJar: other });
    assert.equal(survivor.status, 200);
    assert.equal(survivor.data.sales.length, 0);
  });
});
