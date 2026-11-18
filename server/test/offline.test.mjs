import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../index.mjs';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-0123456789';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://ubuntu:barnyard@127.0.0.1:5432/barnyard_test';

let app;

before(async () => {
  app = await createApp({ host: '127.0.0.1', port: 0, databaseUrl: process.env.DATABASE_URL, connectAttempts: 5 });
});

after(async () => {
  if (app) await app.close();
});

test('PWA manifest and install wiring', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const manifest = fs.readFileSync(path.join(rootDir, 'public', 'manifest.webmanifest'), 'utf8');
  assert.match(html, /rel="manifest"/);
  assert.match(html, /serviceWorker\.register/);
  assert.match(manifest, /"display":\s*"standalone"/);
  assert.match(manifest, /icon-192\.png/);
});

test('service worker follows Safari-safe caching rules', () => {
  const sw = fs.readFileSync(path.join(rootDir, 'public', 'sw.js'), 'utf8');
  assert.match(sw, /request\.method\s*!==\s*'GET'/);
  assert.match(sw, /CACHE_VERSION|barnyard-shell-v/);
  assert.match(sw, /isRedirect/);
  assert.doesNotMatch(sw, /cache\.put\([^)]*redirect/i);
  assert.match(sw, /\/api\//);
});

test('offline assets are served', async () => {
  const head = await fetch(app.url + '/sw.js', { method: 'HEAD' });
  assert.equal(head.status, 200);
  const manifest = await fetch(app.url + '/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  const icon = await fetch(app.url + '/icon-192.png', { method: 'HEAD' });
  assert.equal(icon.status, 200);
  const health = await fetch(app.url + '/health');
  assert.equal(health.status, 200);
});