'use strict';
// Minimal HS256 JWT (custom JWT is on the approved list). Verification rejects alg:none, any other
// algorithm, a tampered signature, malformed tokens and expired tokens.
const crypto = require('node:crypto');
const { AppError } = require('../../lib/errors');

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const unauthenticated = (msg) => new AppError(401, 'UNAUTHENTICATED', msg, {});

let fallbackSecret = null;
function secret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (!fallbackSecret) fallbackSecret = crypto.randomBytes(32).toString('hex');
  return fallbackSecret;
}

function signJwt(claims, { ttlSeconds = 24 * 3600, now = Date.now(), key = secret() } = {}) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const iat = Math.floor(now / 1000);
  const body = b64url(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds }));
  const sig = crypto.createHmac('sha256', key).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token, { now = Date.now(), key = secret() } = {}) {
  if (typeof token !== 'string') throw unauthenticated('Missing token.');
  const parts = token.split('.');
  if (parts.length !== 3) throw unauthenticated('Malformed token.');
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw unauthenticated('Malformed token.');
  }
  if (!header || header.alg !== 'HS256') throw unauthenticated('Unsupported token algorithm.');
  const expected = crypto.createHmac('sha256', key).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) throw unauthenticated('Invalid token signature.');
  if (!claims || typeof claims !== 'object' || !Number.isInteger(claims.exp) || claims.exp <= Math.floor(now / 1000)) {
    throw unauthenticated('Token expired.');
  }
  return claims;
}

function bearer(header) {
  if (typeof header !== 'string') throw unauthenticated('Missing Authorization header.');
  const m = header.match(/^Bearer\s+(\S+)$/i);
  if (!m) throw unauthenticated('Authorization header must be "Bearer <token>".');
  return m[1];
}

module.exports = { signJwt, verifyJwt, bearer };
