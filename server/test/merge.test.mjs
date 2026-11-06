import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const code = fs.readFileSync(new URL('../../public/merge.js', import.meta.url), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const { mergeEvents } = sandbox.BarnyardMerge;

test('merge keeps lots edited on different devices', () => {
  const local = {
    id: 'e1', name: 'Fair', feePct: 5, metaTouchedAt: 10, orderTouchedAt: 10,
    lots: [
      { id: 'a', n: 1, ex: 'Sam', price: 120, touchedAt: 50 },
      { id: 'b', n: 2, ex: 'Casey', price: null, touchedAt: 10 }
    ],
    buyers: [{ id: 'buy1', num: 10, name: 'Acme', touchedAt: 10 }]
  };
  const remote = {
    id: 'e1', name: 'Fair', feePct: 0, metaTouchedAt: 5, orderTouchedAt: 5,
    lots: [
      { id: 'a', n: 1, ex: 'Sam', price: null, touchedAt: 10 },
      { id: 'b', n: 2, ex: 'Casey', price: 95, touchedAt: 40 }
    ],
    buyers: [
      { id: 'buy1', num: 10, name: 'Acme', touchedAt: 10 },
      { id: 'buy2', num: 22, name: 'Jordan', touchedAt: 30 }
    ]
  };
  const merged = mergeEvents(local, remote);
  assert.equal(merged.feePct, 5);
  assert.equal(merged.lots.find((l) => l.id === 'a').price, 120);
  assert.equal(merged.lots.find((l) => l.id === 'b').price, 95);
  assert.equal(merged.buyers.length, 2);
  assert.equal(merged.lots.map((l) => l.id).join(','), 'a,b');
});

test('newer tombstone removes a lot and a newer edit restores it', () => {
  const kept = mergeEvents(
    { id: 'e', lots: [{ id: 'a', n: 1, touchedAt: 10 }], lotTombstones: [] },
    { id: 'e', lots: [], lotTombstones: [{ id: 'a', deletedAt: 20 }] }
  );
  assert.equal(kept.lots.length, 0);
  assert.equal(kept.lotTombstones[0].deletedAt, 20);

  const restored = mergeEvents(
    { id: 'e', lots: [{ id: 'a', n: 1, price: 40, touchedAt: 30 }] },
    { id: 'e', lots: [], lotTombstones: [{ id: 'a', deletedAt: 20 }] }
  );
  assert.equal(restored.lots.length, 1);
  assert.equal(restored.lots[0].price, 40);
});

test('lot order follows the newer reorder and appends lots the other side added', () => {
  const merged = mergeEvents(
    {
      id: 'e', orderTouchedAt: 50,
      lots: [
        { id: 'b', n: 2, touchedAt: 10 },
        { id: 'a', n: 1, touchedAt: 10 }
      ]
    },
    {
      id: 'e', orderTouchedAt: 20,
      lots: [
        { id: 'a', n: 1, touchedAt: 10 },
        { id: 'b', n: 2, touchedAt: 10 },
        { id: 'c', n: 3, touchedAt: 40 }
      ]
    }
  );
  assert.equal(merged.lots.map((l) => l.id).join(','), 'b,a,c');
});
