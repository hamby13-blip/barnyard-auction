import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cookieHeader, hashPassword, hashToken, newToken, readSignedToken, sessionSecret, signToken, verifyPassword } from './auth.mjs';
import { connectWithRetry, migrate, resetData } from './db.mjs';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(rootDir, 'index.html');
const mergePath = path.join(rootDir, 'public', 'merge.js');
const SALE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function authLimit() {
  return process.env.NODE_ENV === 'test' ? 10000 : 20;
}
const buckets = new Map();
let dummyHashPromise = null;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function clientIp(req) {
  if (process.env.RAILWAY_ENVIRONMENT || process.env.TRUST_PROXY === '1') {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim().slice(0, 80);
  }
  return req.socket.remoteAddress || 'local';
}

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now > bucket.reset) {
    bucket = { count: 0, reset: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) throw httpError(429, 'Too many attempts. Wait a few minutes and try again.');
}

export function resetRateLimits() {
  buckets.clear();
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { out[k] = part.slice(i + 1).trim(); }
  });
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2_000_000) {
        reject(httpError(413, 'Request is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(httpError(400, 'Expected JSON')); }
    });
    req.on('error', reject);
  });
}

function send(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    ...headers
  });
  res.end(payload);
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    org: { id: row.org_id, name: row.org_name }
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function requireText(value, label, min, max) {
  const text = String(value || '').trim();
  if (text.length < min || text.length > max) {
    throw httpError(400, `${label} must be ${min}–${max} characters.`);
  }
  return text;
}

function requireEmail(value) {
  const email = normalizeEmail(value);
  if (!EMAIL.test(email) || email.length > 200) throw httpError(400, 'Enter a valid email address.');
  return email;
}

function requirePassword(value) {
  const password = String(value || '');
  if (password.length < 8 || password.length > 200) {
    throw httpError(400, 'Password must be at least 8 characters.');
  }
  return password;
}

async function dummyHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('not-a-real-password');
  return dummyHashPromise;
}

function cleanEvent(data, id) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw httpError(400, 'Sale data must be an object.');
  }
  let copy;
  try { copy = JSON.parse(JSON.stringify(data)); }
  catch { throw httpError(400, 'Sale data is not valid JSON.'); }
  copy.id = id;
  if (typeof copy.name !== 'string' || !copy.name.trim()) copy.name = 'Untitled sale';
  else copy.name = copy.name.trim().slice(0, 200);
  if (!Array.isArray(copy.lots)) copy.lots = [];
  if (!Array.isArray(copy.buyers)) copy.buyers = [];
  if (copy.lots.length > 8000 || copy.buyers.length > 8000) throw httpError(413, 'Sale is too large.');
  let fee = Number(copy.feePct);
  if (!Number.isFinite(fee) || fee < 0) fee = 0;
  if (fee > 100) fee = 100;
  copy.feePct = fee;
  copy.isExample = !!copy.isExample;
  return copy;
}

function saleJson(row) {
  const deletedAt = row.deleted_at ? new Date(row.deleted_at).getTime() : null;
  return {
    id: row.id,
    rev: Number(row.rev),
    updatedAt: new Date(row.updated_at).toISOString(),
    deleted: !!row.deleted,
    deletedAt,
    data: row.deleted ? null : row.data
  };
}

async function currentUser(pool, req) {
  const token = readSignedToken(parseCookies(req).ba_session);
  if (!token) return null;
  const tokenHash = hashToken(token);
  const found = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.org_id, o.name AS org_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN organizations o ON o.id = u.org_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash]
  );
  if (!found.rowCount) return null;
  await pool.query(
    `UPDATE sessions SET expires_at = now() + interval '30 days'
     WHERE token_hash = $1 AND expires_at < now() + interval '15 days'`,
    [tokenHash]
  );
  return publicUser(found.rows[0]);
}

async function startSession(pool, userId) {
  const token = newToken();
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + interval '30 days')`,
    [hashToken(token), userId]
  );
  return cookieHeader(signToken(token), 60 * 60 * 24 * 30);
}

async function userById(pool, userId) {
  const found = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.org_id, o.name AS org_name
     FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.id = $1`,
    [userId]
  );
  return found.rows[0] || null;
}

function requireOwner(user) {
  if (user.role !== 'owner') throw httpError(403, 'Only the organization owner can do that.');
}

async function listSales(pool, orgId) {
  const rows = await pool.query(
    `SELECT id, rev, data, deleted, deleted_at, updated_at
     FROM sales WHERE org_id = $1 ORDER BY updated_at ASC, id ASC`,
    [orgId]
  );
  return rows.rows.map(saleJson);
}

async function applyPush(client, orgId, userId, item) {
  const id = String(item && item.id || '');
  if (!SALE_ID.test(id)) throw httpError(400, 'Invalid sale id.');
  const baseRev = Number(item.baseRev) || 0;
  const deleted = !!item.deleted;
  const existing = await client.query(
    `SELECT id, rev, data, deleted, deleted_at, updated_at FROM sales WHERE org_id = $1 AND id = $2`,
    [orgId, id]
  );
  if (!existing.rowCount) {
    if (baseRev !== 0) {
      const err = httpError(409, 'Sale changed on the server.');
      err.conflict = true;
      err.sale = { id, rev: 0, updatedAt: null, deleted: false, deletedAt: null, data: null };
      throw err;
    }
    const data = deleted ? {} : cleanEvent(item.data, id);
    const deletedAt = deleted ? new Date(Number(item.deletedAt) || Date.now()) : null;
    const inserted = await client.query(
      `INSERT INTO sales (id, org_id, rev, data, deleted, deleted_at, updated_by)
       VALUES ($1, $2, 1, $3::jsonb, $4, $5, $6)
       RETURNING id, rev, data, deleted, deleted_at, updated_at`,
      [id, orgId, JSON.stringify(data), deleted, deletedAt, userId]
    );
    return { ok: true, ...saleJson(inserted.rows[0]) };
  }
  const row = existing.rows[0];
  if (Number(row.rev) !== baseRev) {
    const err = httpError(409, 'Sale changed on the server.');
    err.conflict = true;
    err.sale = saleJson(row);
    throw err;
  }
  const data = deleted ? row.data : cleanEvent(item.data, id);
  const deletedAt = deleted ? new Date(Number(item.deletedAt) || Date.now()) : null;
  const updated = await client.query(
    `UPDATE sales
     SET rev = rev + 1, data = $1::jsonb, deleted = $2, deleted_at = $3, updated_at = now(), updated_by = $4
     WHERE org_id = $5 AND id = $6 AND rev = $7
     RETURNING id, rev, data, deleted, deleted_at, updated_at`,
    [JSON.stringify(data), deleted, deletedAt, userId, orgId, id, baseRev]
  );
  if (!updated.rowCount) {
    const again = await client.query(
      `SELECT id, rev, data, deleted, deleted_at, updated_at FROM sales WHERE org_id = $1 AND id = $2`,
      [orgId, id]
    );
    const err = httpError(409, 'Sale changed on the server.');
    err.conflict = true;
    err.sale = again.rowCount ? saleJson(again.rows[0]) : null;
    throw err;
  }
  return { ok: true, ...saleJson(updated.rows[0]) };
}

async function syncSales(pool, user, body) {
  const push = Array.isArray(body.push) ? body.push.slice(0, 200) : [];
  const known = Array.isArray(body.known) ? body.known : [];
  const client = await pool.connect();
  const results = [];
  try {
    await client.query('BEGIN');
    for (const item of push) {
      const id = String(item && item.id || '');
      await client.query('SAVEPOINT sale_sp');
      try {
        results.push(await applyPush(client, user.org.id, user.id, item));
        await client.query('RELEASE SAVEPOINT sale_sp');
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT sale_sp');
        if (err.conflict) {
          results.push({ id, ok: false, conflict: true, sale: err.sale || null });
        } else if (err.status && err.status < 500) {
          results.push({ id, ok: false, error: err.message });
        } else {
          throw err;
        }
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const knownMap = new Map();
  known.forEach((entry) => {
    if (entry && entry.id) knownMap.set(String(entry.id), Number(entry.rev) || 0);
  });
  const written = new Set(results.filter((r) => r.ok).map((r) => `${r.id}:${r.rev}`));
  const all = await listSales(pool, user.org.id);
  const changes = all.filter((sale) => {
    if (written.has(`${sale.id}:${sale.rev}`)) return false;
    if (!knownMap.has(sale.id)) return true;
    return knownMap.get(sale.id) !== sale.rev;
  });
  return { results, changes };
}

async function handleApi(req, res, pool, pathname) {
  const method = req.method || 'GET';
  if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
    if (req.headers['x-barnyard'] !== '1') throw httpError(403, 'Missing request header.');
  }

  if (method === 'POST' && pathname === '/api/auth/signup') {
    rateLimit(`auth:${clientIp(req)}`, authLimit(), 10 * 60 * 1000);
    const body = await readBody(req);
    const name = requireText(body.name, 'Name', 1, 80);
    const email = requireEmail(body.email);
    const password = requirePassword(body.password);
    const orgName = requireText(body.orgName, 'Organization name', 1, 120);
    const passwordHash = await hashPassword(password);
    const client = await pool.connect();
    let row;
    try {
      await client.query('BEGIN');
      const org = await client.query(
        'INSERT INTO organizations (name) VALUES ($1) RETURNING id, name',
        [orgName]
      );
      const user = await client.query(
        `INSERT INTO users (org_id, email, name, password_hash, role)
         VALUES ($1, $2, $3, $4, 'owner')
         RETURNING id`,
        [org.rows[0].id, email, name, passwordHash]
      );
      await client.query('COMMIT');
      row = await userById(pool, user.rows[0].id);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') throw httpError(409, 'That email already has an account.');
      throw err;
    } finally {
      client.release();
    }
    const cookie = await startSession(pool, row.id);
    send(res, 201, { user: publicUser(row) }, { 'Set-Cookie': cookie });
    return;
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    rateLimit(`auth:${clientIp(req)}`, authLimit(), 10 * 60 * 1000);
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const found = await pool.query(
      `SELECT u.id, u.password_hash FROM users u WHERE u.email = $1`,
      [email]
    );
    const hash = found.rowCount ? found.rows[0].password_hash : await dummyHash();
    const match = await verifyPassword(password, hash);
    if (!found.rowCount || !match) throw httpError(401, 'Email or password is incorrect.');
    const row = await userById(pool, found.rows[0].id);
    const cookie = await startSession(pool, row.id);
    send(res, 200, { user: publicUser(row) }, { 'Set-Cookie': cookie });
    return;
  }

  if (method === 'POST' && pathname === '/api/auth/logout') {
    const token = readSignedToken(parseCookies(req).ba_session);
    if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0) });
    return;
  }

  if (method === 'POST' && pathname === '/api/auth/accept-invite') {
    rateLimit(`auth:${clientIp(req)}`, authLimit(), 10 * 60 * 1000);
    const body = await readBody(req);
    const token = String(body.token || '');
    const name = requireText(body.name, 'Name', 1, 80);
    const password = requirePassword(body.password);
    const invite = await pool.query(
      `SELECT id, org_id, email, role FROM invites
       WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()`,
      [hashToken(token)]
    );
    if (!invite.rowCount) throw httpError(400, 'This invite is invalid or expired.');
    const passwordHash = await hashPassword(password);
    const client = await pool.connect();
    let userId;
    try {
      await client.query('BEGIN');
      const user = await client.query(
        `INSERT INTO users (org_id, email, name, password_hash, role)
         VALUES ($1, $2, $3, $4, 'clerk') RETURNING id`,
        [invite.rows[0].org_id, invite.rows[0].email, name, passwordHash]
      );
      userId = user.rows[0].id;
      await client.query('UPDATE invites SET accepted_at = now() WHERE id = $1', [invite.rows[0].id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') throw httpError(409, 'That email already has an account.');
      throw err;
    } finally {
      client.release();
    }
    const row = await userById(pool, userId);
    const cookie = await startSession(pool, userId);
    send(res, 201, { user: publicUser(row) }, { 'Set-Cookie': cookie });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/invites/')) {
    const token = decodeURIComponent(pathname.slice('/api/invites/'.length));
    const invite = await pool.query(
      `SELECT i.email, i.role, o.name AS org_name
       FROM invites i JOIN organizations o ON o.id = i.org_id
       WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.expires_at > now()`,
      [hashToken(token)]
    );
    if (!invite.rowCount) throw httpError(404, 'This invite is invalid or expired.');
    send(res, 200, {
      email: invite.rows[0].email,
      orgName: invite.rows[0].org_name,
      role: invite.rows[0].role
    });
    return;
  }

  const user = await currentUser(pool, req);
  if (!user) throw httpError(401, 'Sign in required.');

  if (method === 'GET' && pathname === '/api/auth/me') {
    send(res, 200, { user });
    return;
  }

  if (method === 'GET' && pathname === '/api/org/members') {
    const rows = await pool.query(
      `SELECT id, email, name, role, created_at FROM users WHERE org_id = $1 ORDER BY created_at ASC`,
      [user.org.id]
    );
    send(res, 200, {
      members: rows.rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        createdAt: row.created_at
      }))
    });
    return;
  }

  if (method === 'PATCH' && pathname === '/api/org') {
    requireOwner(user);
    const body = await readBody(req);
    const name = requireText(body.name, 'Organization name', 1, 120);
    const updated = await pool.query(
      'UPDATE organizations SET name = $1 WHERE id = $2 RETURNING id, name',
      [name, user.org.id]
    );
    send(res, 200, { org: updated.rows[0] });
    return;
  }

  if (method === 'DELETE' && pathname === '/api/org') {
    requireOwner(user);
    const body = await readBody(req);
    const confirmName = requireText(body.confirmName, 'Organization name', 1, 120);
    const org = await pool.query('SELECT id, name FROM organizations WHERE id = $1', [user.org.id]);
    if (!org.rowCount) throw httpError(404, 'Organization not found.');
    if (org.rows[0].name !== confirmName) {
      throw httpError(400, 'Organization name does not match. Type it exactly to confirm deletion.');
    }
    await pool.query('DELETE FROM organizations WHERE id = $1', [user.org.id]);
    send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0) });
    return;
  }

  if (method === 'POST' && pathname === '/api/org/clerks') {
    requireOwner(user);
    const body = await readBody(req);
    const name = requireText(body.name, 'Name', 1, 80);
    const email = requireEmail(body.email);
    const password = requirePassword(body.password);
    const passwordHash = await hashPassword(password);
    try {
      const inserted = await pool.query(
        `INSERT INTO users (org_id, email, name, password_hash, role)
         VALUES ($1, $2, $3, $4, 'clerk')
         RETURNING id, email, name, role`,
        [user.org.id, email, name, passwordHash]
      );
      const row = inserted.rows[0];
      send(res, 201, { user: { id: row.id, email: row.email, name: row.name, role: row.role } });
    } catch (err) {
      if (err.code === '23505') throw httpError(409, 'That email already has an account.');
      throw err;
    }
    return;
  }

  if (method === 'DELETE' && pathname.startsWith('/api/org/members/')) {
    requireOwner(user);
    const memberId = pathname.slice('/api/org/members/'.length);
    if (!UUID.test(memberId)) throw httpError(400, 'Unknown member.');
    if (memberId === user.id) throw httpError(400, 'You cannot remove yourself.');
    const target = await pool.query(
      'SELECT id, role, org_id FROM users WHERE id = $1',
      [memberId]
    );
    if (!target.rowCount || target.rows[0].org_id !== user.org.id) throw httpError(404, 'Member not found.');
    if (target.rows[0].role === 'owner') throw httpError(403, 'The owner cannot be removed.');
    await pool.query('DELETE FROM users WHERE id = $1', [memberId]);
    send(res, 200, { ok: true });
    return;
  }

  if (method === 'POST' && pathname === '/api/org/invites') {
    requireOwner(user);
    const body = await readBody(req);
    const email = requireEmail(body.email);
    const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rowCount) throw httpError(409, 'That email already has an account.');
    const token = newToken();
    const saved = await pool.query(
      `INSERT INTO invites (org_id, email, role, token_hash, created_by, expires_at)
       VALUES ($1, $2, 'clerk', $3, $4, now() + interval '14 days')
       RETURNING expires_at`,
      [user.org.id, email, hashToken(token), user.id]
    );
    send(res, 201, {
      email,
      expiresAt: saved.rows[0].expires_at,
      path: `/?invite=${encodeURIComponent(token)}`
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/sales') {
    send(res, 200, { sales: await listSales(pool, user.org.id) });
    return;
  }

  if (method === 'POST' && pathname === '/api/sync') {
    const body = await readBody(req);
    send(res, 200, await syncSales(pool, user, body));
    return;
  }

  throw httpError(404, 'Not found.');
}

function sendFile(res, filePath, contentType) {
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY'
  });
  res.end(body);
}

export function createHandler(pool) {
  return async function handle(req, res) {
    const started = Date.now();
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;
    try {
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/health') {
        await pool.query('SELECT 1');
        send(res, 200, { ok: true });
        return;
      }
      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
        sendFile(res, indexPath, 'text/html; charset=utf-8');
        return;
      }
      if (req.method === 'GET' && pathname === '/merge.js') {
        sendFile(res, mergePath, 'text/javascript; charset=utf-8');
        return;
      }
      if (pathname.startsWith('/api/')) {
        await handleApi(req, res, pool, pathname);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error(err);
      if (!res.headersSent) {
        send(res, status, { error: status >= 500 ? 'Something went wrong.' : err.message });
      } else {
        res.end();
      }
    } finally {
      if (pathname !== '/health') {
        res.on('finish', () => {
          console.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
        });
      }
    }
  };
}

export async function createApp(options = {}) {
  sessionSecret();
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. On Railway, add Postgres and set DATABASE_URL=${{Postgres.DATABASE_URL}}.');
  }
  const pool = await connectWithRetry(databaseUrl, options.connectAttempts ?? 30);
  await migrate(pool);
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
  const server = http.createServer(createHandler(pool));
  const host = options.host || '0.0.0.0';
  const port = options.port ?? (Number(process.env.PORT) || 8080);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  return {
    server,
    pool,
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    }
  };
}

export { resetData };

function isMainModule() {
  const arg = process.argv[1];
  if (!arg) return false;
  return import.meta.url === pathToFileURL(arg).href;
}

if (isMainModule()) {
  createApp().then((app) => {
    console.log(`Barnyard Auction listening on ${app.port}`);
  }).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
