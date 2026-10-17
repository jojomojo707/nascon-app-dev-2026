'use strict';
// HMAC-SHA256 signature (spec 06): hex(HMAC(DAY1_SALT, id + "|" + canonical(payload))).
const crypto = require('node:crypto');
const { canonical } = require('./canonical');

function salt() {
  // Read from the environment only; never hard-coded.
  return process.env.DAY1_SALT ?? '';
}

function sign(id, payload, key = salt()) {
  return crypto.createHmac('sha256', Buffer.from(key, 'utf8'))
    .update(Buffer.from(id + '|' + canonical(payload), 'utf8'))
    .digest('hex');
}

function lotsKey(seed, leagueId, teamId) {
  return crypto.createHash('sha256').update(`${seed}|${leagueId}|${teamId}`, 'utf8').digest('hex');
}

function bodyHash(body) {
  return crypto.createHash('sha256').update(canonical(body), 'utf8').digest('hex');
}

module.exports = { sign, lotsKey, bodyHash };
