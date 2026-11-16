import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

test('index includes WCAG-oriented structure and styles', () => {
  assert.match(html, /skip-link/);
  assert.match(html, /<main[^>]+id="main-content"/);
  assert.match(html, /--ink:#3E4A5A/);
  assert.match(html, /--muted:#4A5562/);
  assert.match(html, /--board:#0F3F8C/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /id="syncState"[^>]+aria-live="polite"/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /scope="col"/);
  assert.doesNotMatch(html, /#9CC7EE/i);
});

test('key inputs use visible labels', () => {
  assert.match(html, /id="fEx"/);
  assert.match(html, /id="bNum"/);
  assert.match(html, /for="jsonFile"/);
  assert.match(html, /data-i18n="lot.exhibitor"/);
});