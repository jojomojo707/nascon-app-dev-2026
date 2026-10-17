'use strict';
// POST /audit/v1/reset: wipe all state and recreate the exact baseline (spec 07).
const { tx, pool } = require('../../db/pool');
const { validation, notFound } = require('../../lib/errors');
const { isObject, isInt } = require('../../lib/validate');
const B = require('./baseline');

const ALL_TABLES = [
  'sync_actions', 'orders', 'discount_codes', 'variants', 'products', 'roster_requests', 'audit_entries',
  'registrations', 'players', 'squads', 'roster_leagues', 'events', 'matches', 'leagues', 'sports', 'users',
  'scenario_players', 'scenario_leagues', 'clubs', 'tenants', 'settings',
];

// Validates the optional reset body; returns {seed, stock}.
function parseResetBody(body) {
  if (body === undefined || body === null) body = {};
  if (!isObject(body)) throw validation(['body']);
  const fields = [];
  const seed = body.seed === undefined || body.seed === null ? 42 : body.seed;
  if (!isInt(seed)) fields.push('seed');
  let stockIn = body.stock === undefined || body.stock === null ? {} : body.stock;
  if (!isObject(stockIn)) { fields.push('stock'); stockIn = {}; }
  for (const [k, v] of Object.entries(stockIn)) if (!isInt(v, 0)) fields.push('stock.' + k);
  if (fields.length) throw validation(fields);
  for (const k of Object.keys(stockIn)) {
    if (!(k in B.DEFAULT_STOCK)) throw notFound('VARIANT_NOT_FOUND', `Variant ${k} does not exist.`, { variant_id: k });
  }
  return { seed, stock: { ...B.DEFAULT_STOCK, ...stockIn } };
}

async function seedBaseline(c, { seed, stock }) {
  await c.query(`TRUNCATE ${ALL_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
  await c.query('ALTER SEQUENCE payment_seq RESTART WITH 1');
  for (const t of B.TENANTS) {
    await c.query('INSERT INTO tenants VALUES ($1,$2,$3,$4,$5)',
      [t.tenant_id, t.name, t.logo_url, t.primary_color, t.secondary_color]);
  }
  for (const cl of B.CLUBS) {
    await c.query('INSERT INTO clubs (club_id, tenant_id, name) VALUES ($1,$2,$3)', [cl.club_id, cl.tenant_id, cl.name]);
  }
  for (const s of B.SPORTS) {
    await c.query('INSERT INTO sports (sport_id, config, seeded) VALUES ($1,$2,true)', [s.sport_id, s]);
  }
  for (const l of B.SCENARIO_LEAGUES) {
    await c.query('INSERT INTO scenario_leagues VALUES ($1,$2,$3,$4,$5)', [l.league_id, l.tenant_id, l.name, l.sport_id, l.season]);
  }
  for (const p of B.SCENARIO_PLAYERS) {
    await c.query('INSERT INTO scenario_players VALUES ($1,$2,$3,$4)', [p.player_id, p.club_id, p.tenant_id, p.name]);
  }
  const hashes = B.userHashes();
  for (const u of B.USERS) {
    await c.query('INSERT INTO users VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [u.user_id, u.email, hashes[u.email], u.display_name, u.role, u.tenant_id, JSON.stringify(u.league_ids), u.club_id, u.player_id]);
  }
  for (const p of B.PRODUCTS) {
    await c.query('INSERT INTO products VALUES ($1,$2,$3,$4)', [p.product_id, p.tenant_id, p.name, p.info]);
  }
  for (const v of B.VARIANTS) {
    await c.query('INSERT INTO variants VALUES ($1,$2,$3,$4,$5,0)', [v.variant_id, v.product_id, v.label, v.price_minor, stock[v.variant_id]]);
  }
  for (const d of B.DISCOUNT_CODES) await c.query('INSERT INTO discount_codes VALUES ($1,$2)', [d.code, d.percent]);
  await c.query("INSERT INTO settings VALUES ('seed', $1), ('seeded', 'true')", [JSON.stringify(seed)]);
}

async function reset(body) {
  const params = parseResetBody(body);
  await tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(42001)');
    await seedBaseline(c, params);
  });
  return {
    status: 'reset_complete', seed: params.seed,
    sports: B.SPORTS.map((s) => s.sport_id),
    tenants: B.TENANTS.map((t) => t.tenant_id),
    stock: params.stock,
  };
}

async function isSeeded() {
  const r = await pool.query("SELECT value FROM settings WHERE key = 'seeded'");
  if (!r.rowCount) return false;
  const u = await pool.query('SELECT count(*)::int AS n FROM users');
  return u.rows[0].n >= B.USERS.length;
}

async function lastSeed() {
  const r = await pool.query("SELECT value FROM settings WHERE key = 'seed'");
  return r.rowCount ? Number(r.rows[0].value) : 42;
}

module.exports = { reset, parseResetBody, isSeeded, lastSeed };
