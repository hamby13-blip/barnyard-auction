const buckets = new Map();

export function resetRateLimits() {
  buckets.clear();
}

export function clientIp(req) {
  if (process.env.RAILWAY_ENVIRONMENT || process.env.TRUST_PROXY === '1') {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim().slice(0, 80);
  }
  return req.socket.remoteAddress || 'local';
}

export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now > bucket.reset) {
    bucket = { count: 0, reset: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const err = new Error('Too many attempts. Wait a few minutes and try again.');
    err.status = 429;
    throw err;
  }
}

export function authRateLimit() {
  return process.env.NODE_ENV === 'test' ? 10000 : 20;
}

export function writeRateLimit() {
  return process.env.NODE_ENV === 'test' ? 10000 : 180;
}

export function invitePreviewRateLimit() {
  return process.env.NODE_ENV === 'test' ? 10000 : 60;
}

const AUTH_WINDOW_MS = 10 * 60 * 1000;
const WRITE_WINDOW_MS = 60 * 1000;
const INVITE_WINDOW_MS = 10 * 60 * 1000;

export function rateLimitAuth(req) {
  rateLimit(`auth:${clientIp(req)}`, authRateLimit(), AUTH_WINDOW_MS);
}

export function rateLimitWrite(req) {
  rateLimit(`write:${clientIp(req)}`, writeRateLimit(), WRITE_WINDOW_MS);
}

export function rateLimitInvitePreview(req) {
  rateLimit(`invite:${clientIp(req)}`, invitePreviewRateLimit(), INVITE_WINDOW_MS);
}

function normalizeHost(host) {
  if (!host) return '';
  const h = String(host).trim().toLowerCase();
  const i = h.indexOf(':');
  return i === -1 ? h : h.slice(0, i);
}

function configuredAppHosts() {
  const hosts = new Set();
  const raw = process.env.PUBLIC_APP_URL || process.env.APP_URL || '';
  if (raw) {
    try {
      hosts.add(normalizeHost(new URL(raw).host));
    } catch { /* ignore bad env */ }
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    hosts.add(normalizeHost(process.env.RAILWAY_PUBLIC_DOMAIN));
  }
  return hosts;
}

function requestOriginHost(req) {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.length) {
    try {
      return normalizeHost(new URL(origin).host);
    } catch {
      return null;
    }
  }
  const referer = req.headers.referer;
  if (typeof referer === 'string' && referer.length) {
    try {
      return normalizeHost(new URL(referer).host);
    } catch {
      return null;
    }
  }
  return null;
}

function allowedHosts(req) {
  const hosts = configuredAppHosts();
  const reqHost = normalizeHost(req.headers.host || '');
  if (reqHost) hosts.add(reqHost);
  const forwarded = req.headers['x-forwarded-host'];
  if (typeof forwarded === 'string' && forwarded.length) {
    hosts.add(normalizeHost(forwarded.split(',')[0].trim()));
  }
  if (process.env.NODE_ENV === 'test') {
    hosts.add('127.0.0.1');
    hosts.add('localhost');
  }
  return hosts;
}

/** Blocks cross-site form posts; browser API calls must include matching Origin or Referer. */
export function requireSameOrigin(req) {
  const originHost = requestOriginHost(req);
  const allowed = allowedHosts(req);
  if (originHost) {
    if (!allowed.has(originHost)) {
      const err = new Error('Cross-origin request blocked.');
      err.status = 403;
      throw err;
    }
    return;
  }
  const sec = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (sec === 'same-origin' || sec === 'same-site') return;
  if (process.env.NODE_ENV === 'test' && req.headers['x-test-origin'] === '1') return;
  const err = new Error('Missing origin.');
  err.status = 403;
  throw err;
}

export function requireMutatingRequest(req) {
  if (req.headers['x-barnyard'] !== '1') {
    const err = new Error('Missing request header.');
    err.status = 403;
    throw err;
  }
  requireSameOrigin(req);
}

const HTML_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self'",
  "img-src 'self' data:"
].join('; ');

export function baseSecurityHeaders() {
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }
  return headers;
}

export function htmlSecurityHeaders() {
  return {
    ...baseSecurityHeaders(),
    'Content-Security-Policy': HTML_CSP
  };
}

export function logServerError(req, pathname, err) {
  const method = req.method || 'GET';
  const code = err && err.code ? String(err.code) : '';
  const msg = err && err.message ? String(err.message).slice(0, 200) : 'unknown';
  console.error(`${method} ${pathname} failed status=${err.status || 500} code=${code} msg=${msg}`);
}