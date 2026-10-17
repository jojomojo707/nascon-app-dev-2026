'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowed } = require('../backend/src/domain/rbac/policy');
const { signJwt, verifyJwt, bearer } = require('../backend/src/domain/rbac/jwt');
const { USERS } = require('../backend/src/domain/seed/baseline');
const { claimsOf } = require('../backend/src/domain/rbac/service');
const { createLimiter } = require('../backend/src/middleware/rateLimit');

// Targets exactly as seeded (spec 07 RBAC scenario).
const leagues = { own: { exists: true, league_id: 'league-alpha-1', tenant_id: 'tenant-alpha' },
  other: { exists: true, league_id: 'league-alpha-2', tenant_id: 'tenant-alpha' },
  foreign: { exists: true, league_id: 'league-beta-1', tenant_id: 'tenant-beta' } };
const clubs = { own: { exists: true, club_id: 'club-alpha-1', tenant_id: 'tenant-alpha' },
  other: { exists: true, club_id: 'club-alpha-2', tenant_id: 'tenant-alpha' },
  foreign: { exists: true, club_id: 'club-beta-1', tenant_id: 'tenant-beta' } };
const players = { own: { exists: true, player_id: 'player-alpha-1', club_id: 'club-alpha-1', tenant_id: 'tenant-alpha' },
  other: { exists: true, player_id: 'player-alpha-2', club_id: 'club-alpha-2', tenant_id: 'tenant-alpha' },
  foreign: { exists: true, player_id: 'player-beta-1', club_id: 'club-beta-1', tenant_id: 'tenant-beta' } };
const P = Object.fromEntries(USERS.map((u) => [u.role, claimsOf(u)]));
const ROLES = ['super_admin', 'league_organizer', 'club_manager', 'player', 'viewer'];

// Spec 15 expected matrix: A/D per role in ROLES order.
const MATRIX = [
  ['P1', 'tenant.create', { exists: true }, 'ADDDD'],
  ['P2 own', 'league.fixtures.write', leagues.own, 'AADDD'],
  ['P2 other', 'league.fixtures.write', leagues.other, 'ADDDD'],
  ['P2 foreign', 'league.fixtures.write', leagues.foreign, 'ADDDD'],
  ['P3 own', 'club.roster.write', clubs.own, 'ADADD'],
  ['P3 other', 'club.roster.write', clubs.other, 'ADDDD'],
  ['P3 foreign', 'club.roster.write', clubs.foreign, 'ADDDD'],
  ['P4 own', 'club.products.write', clubs.own, 'ADADD'],
  ['P4 other', 'club.products.write', clubs.other, 'ADDDD'],
  ['P4 foreign', 'club.products.write', clubs.foreign, 'ADDDD'],
  ['P5 own', 'player.update', players.own, 'ADAAD'],
  ['P5 other', 'player.update', players.other, 'ADDDD'],
  ['P5 foreign', 'player.update', players.foreign, 'ADDDD'],
  ['P6 own', 'club.read', clubs.own, 'AAAAA'],
  ['P6 other', 'club.read', clubs.other, 'AAAAA'],
  ['P6 foreign', 'club.read', clubs.foreign, 'ADDDD'],
  ['P7', 'platform.config.read', { exists: true }, 'ADDDD'],
];

for (const [name, action, target, expected] of MATRIX) {
  test(`RBAC matrix ${name}: ${expected}`, () => {
    const got = ROLES.map((r) => (isAllowed(P[r], action, target) ? 'A' : 'D')).join('');
    assert.equal(got, expected);
  });
}

test('unknown targets, unknown roles and unknown actions are denied for non-super-admins', () => {
  assert.equal(isAllowed(P.league_organizer, 'league.fixtures.write', { exists: false, league_id: 'league-alpha-1' }), false);
  assert.equal(isAllowed(P.super_admin, 'club.read', { exists: false }), true);
  assert.equal(isAllowed({ ...P.viewer, role: 'hacker' }, 'club.read', clubs.own), false);
  assert.equal(isAllowed(P.super_admin, 'nope', clubs.own), false);
  assert.equal(isAllowed(null, 'club.read', clubs.own), false);
});

test('JWT: valid token round-trips, lasts at least an hour', () => {
  const t = signJwt({ sub: 'u', role: 'viewer' }, { key: 'k' });
  const c = verifyJwt(t, { key: 'k' });
  assert.equal(c.role, 'viewer');
  assert.ok(c.exp - c.iat >= 3600);
  assert.equal(verifyJwt(t, { key: 'k', now: Date.now() + 3500 * 1000 }).sub, 'u');
});

test('JWT: alg none, tampered, wrong key, expired and malformed tokens are 401', () => {
  const t = signJwt({ sub: 'u', role: 'super_admin' }, { key: 'k' });
  const [h, b, s] = t.split('.');
  const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + b + '.';
  const tampered = h + '.' + Buffer.from(JSON.stringify({ sub: 'u', role: 'super_admin', exp: 9999999999 })).toString('base64url') + '.' + s;
  const flipped = h + '.' + b + '.' + (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
  const expired = signJwt({ sub: 'u' }, { key: 'k', ttlSeconds: 60, now: Date.now() - 3600 * 1000 });
  for (const bad of [none, tampered, flipped, expired, 'a.b', 'x.y.z', 42]) {
    assert.throws(() => verifyJwt(bad, { key: 'k' }), (e) => e.status === 401 && e.code === 'UNAUTHENTICATED');
  }
  assert.throws(() => verifyJwt(t, { key: 'other' }), (e) => e.status === 401);
  assert.equal(bearer('Bearer abc'), 'abc');
  assert.throws(() => bearer(undefined), (e) => e.status === 401);
  assert.throws(() => bearer('Basic abc'), (e) => e.status === 401);
});

test('rate limiter: 100 per rolling 10 s, Retry-After, recovery after the window', () => {
  let now = 1_000_000;
  const l = createLimiter({ now: () => now });
  let denied = 0;
  for (let i = 0; i < 150; i++) { if (!l.check('1.2.3.4').allowed) denied++; now += 30; }
  assert.equal(denied, 50);
  const r = l.check('1.2.3.4');
  assert.equal(r.allowed, false);
  assert.ok(r.retryAfter >= 1 && r.retryAfter <= 10);
  assert.equal(l.check('5.6.7.8').allowed, true);
  now += 11000;
  assert.equal(l.check('1.2.3.4').allowed, true);
});
