'use strict';
// Canonical JSON (spec 06): recursively sorted keys (by code point), no whitespace,
// non-ASCII left unescaped, integers without a decimal point, array order preserved.

function canonical(value) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort(compareCodePoints);
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  // JSON.stringify leaves non-ASCII unescaped and prints integers without ".0".
  return JSON.stringify(value);
}

function compareCodePoints(a, b) {
  const ca = Array.from(a);
  const cb = Array.from(b);
  const n = Math.min(ca.length, cb.length);
  for (let i = 0; i < n; i++) {
    const d = ca[i].codePointAt(0) - cb[i].codePointAt(0);
    if (d !== 0) return d;
  }
  return ca.length - cb.length;
}

module.exports = { canonical };
