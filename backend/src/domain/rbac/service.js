'use strict';
// RBAC scenario tokens, target lookups and login.
const { pool } = require('../../db/pool');
const { AppError } = require('../../lib/errors');
const { verifyPassword } = require('../seed/baseline');
const { signJwt, verifyJwt, bearer } = require('./jwt');
const { isAllowed } = require('./policy');

const claimsOf = (u) => ({
  sub: u.user_id, email: u.email, role: u.role, tenant_id: u.tenant_id,
  league_ids: u.league_ids || [], club_id: u.club_id, player_id: u.player_id,
});

async function userByRole(role) {
  const r = await pool.query('SELECT * FROM users WHERE role = $1 ORDER BY user_id LIMIT 1', [role]);
  return r.rows[0];
}

async function rbacMatrix() {
  const tokens = {};
  for (const role of ['super_admin', 'league_organizer', 'club_manager', 'player', 'viewer']) {
    tokens[role === 'super_admin' ? 'super_admin' : role] = signJwt(claimsOf(await userByRole(role)));
  }
  return {
    tokens,
    context: {
      tenant_id: 'tenant-alpha', foreign_tenant_id: 'tenant-beta',
      own_league_id: 'league-alpha-1', other_league_id: 'league-alpha-2', foreign_league_id: 'league-beta-1',
      own_club_id: 'club-alpha-1', other_club_id: 'club-alpha-2', foreign_club_id: 'club-beta-1',
      own_player_id: 'player-alpha-1', other_player_id: 'player-alpha-2', foreign_player_id: 'player-beta-1',
    },
  };
}

// Resolves a probe target to {exists, tenant_id, league_id|club_id|player_id}.
async function target(kind, id) {
  if (kind === 'league') {
    const r = await pool.query(
      `SELECT league_id, tenant_id FROM scenario_leagues WHERE league_id = $1
       UNION ALL SELECT league_id, config->>'tenant_id' FROM roster_leagues WHERE league_id = $1 LIMIT 1`, [id]);
    return r.rowCount ? { exists: true, ...r.rows[0] } : { exists: false, league_id: id };
  }
  if (kind === 'club') {
    const r = await pool.query('SELECT club_id, tenant_id FROM clubs WHERE club_id = $1', [id]);
    return r.rowCount ? { exists: true, ...r.rows[0] } : { exists: false, club_id: id };
  }
  if (kind === 'player') {
    const r = await pool.query('SELECT player_id, club_id, tenant_id FROM scenario_players WHERE player_id = $1', [id]);
    return r.rowCount ? { exists: true, ...r.rows[0] } : { exists: false, player_id: id };
  }
  return { exists: true };
}

function principalFrom(req) {
  return verifyJwt(bearer(req.headers.authorization));
}

function assertAllowed(principal, action, tgt) {
  if (!isAllowed(principal, action, tgt)) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to do this.', { action });
}

async function login(body) {
  const email = body && typeof body.email === 'string' ? body.email.trim().toLowerCase() : null;
  const password = body && typeof body.password === 'string' ? body.password : null;
  if (!email || !password) throw new AppError(400, 'VALIDATION_ERROR', 'Email and password are required.', { fields: ['email', 'password'].filter((f) => !body || typeof body[f] !== 'string') });
  const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const u = r.rows[0];
  if (!u || !verifyPassword(password, u.password_hash)) throw new AppError(401, 'UNAUTHENTICATED', 'Wrong email or password.', {});
  const t = u.tenant_id ? (await pool.query('SELECT * FROM tenants WHERE tenant_id = $1', [u.tenant_id])).rows[0] : null;
  const ttl = 24 * 3600;
  return {
    token: signJwt(claimsOf(u), { ttlSeconds: ttl }),
    expires_at: new Date(Date.now() + ttl * 1000).toISOString().slice(0, 19) + 'Z',
    user: { user_id: u.user_id, email: u.email, display_name: u.display_name, role: u.role, tenant_id: u.tenant_id,
      league_ids: u.league_ids || [], club_id: u.club_id, player_id: u.player_id },
    tenant: t ? { tenant_id: t.tenant_id, name: t.name, logo_url: t.logo_url, primary_color: t.primary_color, secondary_color: t.secondary_color } : null,
  };
}

module.exports = { rbacMatrix, target, principalFrom, assertAllowed, login, claimsOf };
