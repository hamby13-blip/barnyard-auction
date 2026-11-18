import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashPassword } from './auth.mjs';
import { cleanEvent } from './sale-data.mjs';

/** Fixed UUIDs so the demo org is recognizable and tests stay deterministic. */
export const DEMO_ORG_ID = 'a0000000-0000-4000-8000-000000000001';
export const DEMO_USER_ID = 'a0000000-0000-4000-8000-000000000002';
export const DEMO_SALE_ID = 'eDemoWilkes';
const DEMO_EMAIL = 'demo-clerk@barnyard.invalid';
const DEMO_NAME = 'Demo Clerk';
const DEMO_ORG_NAME = 'Barnyard Demo (testers)';

export function demoAccessEnabled() {
  const code = process.env.DEMO_ACCESS_CODE;
  return typeof code === 'string' && code.length >= 8;
}

function codeBuffer(code) {
  return createHash('sha256').update(String(code || ''), 'utf8').digest();
}

export function verifyDemoAccessCode(code) {
  if (!demoAccessEnabled()) return false;
  const expected = codeBuffer(process.env.DEMO_ACCESS_CODE);
  const provided = codeBuffer(code);
  return timingSafeEqual(expected, provided);
}

function demoSeedEvent() {
  const t = Date.now();
  const saleDate = new Date(t - 20 * 86400000).toISOString().slice(0, 10);
  return cleanEvent({
    id: DEMO_SALE_ID,
    name: 'Demo — Wilkes County Youth Livestock Sale',
    feePct: 5,
    isExample: true,
    saleDate,
    payoutDeadlineDays: 14,
    metaTouchedAt: t,
    orderTouchedAt: t,
    lotTombstones: [],
    buyerTombstones: [],
    buyers: [
      { id: 'buy-demo-3', num: 3, name: 'Hayes Feed & Seed', business: 'Hayes Feed & Seed', phone: '', paid: true, paidAt: saleDate, touchedAt: t },
      { id: 'buy-demo-7', num: 7, name: 'Pat Lawson', business: '', phone: '', paid: false, paidAt: '', touchedAt: t }
    ],
    lots: [
      { id: 'lot-demo-1', n: 1, ex: 'Maddie R.', sp: 'Rabbit', de: 'Pair of Mini Rex', club: 'North Wilkes 4-H', weight: null,
        buyer: 'Hayes Feed & Seed', buyerId: 'buy-demo-3', price: 85, addOns: [], touchedAt: t },
      { id: 'lot-demo-2', n: 2, ex: 'Tyler B.', sp: 'Goat', de: 'Nubian wether', club: 'West Wilkes FFA', weight: 62,
        buyer: 'Pat Lawson', buyerId: 'buy-demo-7', price: 420, addOns: [], touchedAt: t }
    ],
    payouts: [
      { id: 'pay-demo-1', ex: 'Maddie R.', status: 'picked_up', pickupDate: saleDate, pickupDetail: 'Mom', note: '', touchedAt: t }
    ]
  }, DEMO_SALE_ID);
}

/** Ensure shared demo org, clerk user, and sample sale exist. */
export async function ensureDemoOrg(pool) {
  const passwordHash = await hashPassword(randomBytes(24).toString('hex'));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO organizations (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [DEMO_ORG_ID, DEMO_ORG_NAME]
    );
    await client.query(
      `INSERT INTO users (id, org_id, email, name, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, 'clerk')
       ON CONFLICT (email) DO UPDATE SET org_id = EXCLUDED.org_id, name = EXCLUDED.name`,
      [DEMO_USER_ID, DEMO_ORG_ID, DEMO_EMAIL, DEMO_NAME, passwordHash]
    );
    const existing = await client.query(
      'SELECT id FROM sales WHERE org_id = $1 AND id = $2 AND deleted = false',
      [DEMO_ORG_ID, DEMO_SALE_ID]
    );
    if (!existing.rowCount) {
      const data = demoSeedEvent();
      await client.query(
        `INSERT INTO sales (id, org_id, rev, data, deleted, updated_by)
         VALUES ($1, $2, 1, $3::jsonb, false, $4)`,
        [DEMO_SALE_ID, DEMO_ORG_ID, JSON.stringify(data), DEMO_USER_ID]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return {
    id: DEMO_USER_ID,
    email: DEMO_EMAIL,
    name: DEMO_NAME,
    role: 'clerk',
    org: { id: DEMO_ORG_ID, name: DEMO_ORG_NAME }
  };
}