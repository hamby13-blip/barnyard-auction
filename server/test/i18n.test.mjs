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

test('locale bundle and home page wiring', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const i18n = fs.readFileSync(path.join(rootDir, 'public', 'i18n.js'), 'utf8');
  assert.match(html, /src="\/i18n.js"/);
  assert.match(html, /data-lang-set="es"/);
  assert.match(i18n, /BarnyardI18n/);
  assert.match(i18n, /'auth.signIn'/);
  assert.match(i18n, /'auth.signIn': 'Iniciar sesión'/);
  assert.match(i18n, /translateApiError/);
  assert.match(i18n, /'dlg\.newEvent\.title'/);
  assert.match(html, /function localizeErr/);
  assert.match(html, /t\('dlg\.newEvent\.title'\)/);
  assert.match(html, /t\('empty\.noLots'\)/);
});

test('spanish legal pages are public', async () => {
  const privacy = await fetch(app.url + '/privacidad');
  assert.equal(privacy.status, 200);
  const body = await privacy.text();
  assert.match(body, /lang="es"/);
  assert.match(body, /Política de privacidad/);

  const terms = await fetch(app.url + '/terminos');
  assert.equal(terms.status, 200);
  const termsBody = await terms.text();
  assert.match(termsBody, /Términos de servicio/);

  const js = await fetch(app.url + '/i18n.js');
  assert.equal(js.status, 200);
});