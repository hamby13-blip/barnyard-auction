import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;

let devSecretWarned = false;

export function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    throw new Error('SESSION_SECRET must be set to a long random string (at least 16 characters).');
  }
  if (!devSecretWarned) {
    devSecretWarned = true;
    console.warn('SESSION_SECRET is unset; using a development-only secret.');
  }
  return 'dev-only-session-secret-not-for-production';
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nRaw, rRaw, pRaw, saltHex, hashHex] = parts;
  let expected;
  let actual;
  try {
    expected = Buffer.from(hashHex, 'hex');
    actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: Number(nRaw),
      r: Number(rRaw),
      p: Number(pRaw)
    });
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function newToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function signToken(token) {
  const mac = createHmac('sha256', sessionSecret()).update(String(token)).digest('base64url');
  return `${token}.${mac}`;
}

export function readSignedToken(cookieValue) {
  if (!cookieValue || !cookieValue.includes('.')) return null;
  const i = cookieValue.lastIndexOf('.');
  const token = cookieValue.slice(0, i);
  const mac = cookieValue.slice(i + 1);
  const expected = createHmac('sha256', sessionSecret()).update(token).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return token;
}

export function cookieHeader(value, maxAgeSeconds) {
  const parts = [
    `ba_session=${encodeURIComponent(value)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) parts.push('Secure');
  return parts.join('; ');
}
