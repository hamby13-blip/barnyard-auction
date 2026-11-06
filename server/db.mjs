import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

export function normalizeDatabaseUrl(databaseUrl) {
  const q = databaseUrl.indexOf('?');
  if (q === -1) return { connectionString: databaseUrl, ssl: false };
  const params = new URLSearchParams(databaseUrl.slice(q + 1));
  const mode = (params.get('sslmode') || '').toLowerCase();
  const ssl = mode === 'require' || mode === 'verify-ca' || mode === 'verify-full' || mode === 'no-verify';
  if (!ssl) return { connectionString: databaseUrl, ssl: false };
  params.delete('sslmode');
  const rest = params.toString();
  return {
    connectionString: rest ? `${databaseUrl.slice(0, q)}?${rest}` : databaseUrl.slice(0, q),
    ssl: true
  };
}

export function createPool(databaseUrl) {
  const { connectionString, ssl } = normalizeDatabaseUrl(databaseUrl);
  const config = { connectionString, max: 10 };
  if (ssl) config.ssl = { rejectUnauthorized: false };
  return new Pool(config);
}

export async function connectWithRetry(databaseUrl, attempts = 30) {
  let last;
  for (let i = 0; i < attempts; i++) {
    const pool = createPool(databaseUrl);
    try {
      await pool.query('SELECT 1');
      return pool;
    } catch (err) {
      last = err;
      await pool.end().catch(() => {});
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const message = last && last.message ? last.message : 'unknown error';
  throw new Error(`Could not connect to Postgres (${message}). Check DATABASE_URL.`);
}

export async function migrate(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const done = await pool.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file]);
    if (done.rowCount) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export async function resetData(pool) {
  await pool.query('TRUNCATE TABLE sessions, invites, sales, users, organizations RESTART IDENTITY CASCADE');
}
