'use strict';
// Rolling-window rate limiter for /api/v1/* (spec 15): 100 accepted requests per 10 s per client IP.
// Only accepted requests enter the window, so a client recovers 10 s after its oldest accepted request.
const { AppError } = require('../lib/errors');

function createLimiter({ limit = 100, windowMs = 10000, now = () => Date.now() } = {}) {
  const hits = new Map(); // ip -> array of timestamps (ascending)

  function check(key) {
    const t = now();
    const list = (hits.get(key) || []).filter((ts) => ts > t - windowMs);
    if (list.length >= limit) {
      hits.set(key, list);
      const retryAfter = Math.max(1, Math.ceil((list[0] + windowMs - t) / 1000));
      return { allowed: false, retryAfter };
    }
    list.push(t);
    hits.set(key, list);
    return { allowed: true, retryAfter: 0 };
  }

  function middleware(req, res, next) {
    const ip = req.socket.remoteAddress || 'unknown';
    const r = check(ip);
    if (r.allowed) return next();
    res.set('Retry-After', String(r.retryAfter));
    const e = new AppError(429, 'RATE_LIMITED', 'Too many requests. Please wait and try again.', { retry_after_seconds: r.retryAfter });
    res.status(429).json(e.toBody());
  }

  return { check, middleware };
}

module.exports = { createLimiter };
