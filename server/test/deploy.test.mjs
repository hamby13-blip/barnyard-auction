import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Root-level HTML and public assets the server must read at runtime (including Docker). */
const REQUIRED_STATIC_FILES = [
  'index.html',
  'access.html',
  'privacy.html',
  'terms.html',
  'public/merge.js',
  'public/legal.css',
  'public/i18n.js',
  'public/sw.js',
  'public/manifest.webmanifest',
  'public/icon-192.png',
  'public/icon-512.png',
  'privacidad.html',
  'terminos.html'
];

test('runtime static asset files exist in the repository tree', () => {
  for (const rel of REQUIRED_STATIC_FILES) {
    const absolute = path.join(rootDir, rel);
    assert.ok(fs.existsSync(absolute), `missing file required at runtime: ${rel}`);
  }
});

test('Dockerfile copies every root HTML page the server serves', () => {
  const dockerfile = fs.readFileSync(path.join(rootDir, 'Dockerfile'), 'utf8');
  for (const rel of REQUIRED_STATIC_FILES) {
    if (!rel.endsWith('.html') || rel.includes('/')) continue;
    assert.match(
      dockerfile,
      new RegExp(rel.replace('.', '\\.')),
      `Dockerfile must COPY ${rel} into the production image`
    );
  }
  assert.match(dockerfile, /COPY public \.\/public/, 'Dockerfile must COPY public/ for merge.js and legal.css');
  assert.match(dockerfile, /privacidad\.html/, 'Dockerfile must COPY privacidad.html');
  assert.match(dockerfile, /terminos\.html/, 'Dockerfile must COPY terminos.html');
});