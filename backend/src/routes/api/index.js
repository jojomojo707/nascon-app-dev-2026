'use strict';
// Mobile app routes (/api/v1/*): rate limited, JWT-authenticated thin wrappers over the same domain
// services as /audit/v1 (PROPOSED shapes in mobile/architecture/07-networking-and-api.md).
const express = require('express');
const { createLimiter } = require('../../middleware/rateLimit');
const { pool } = require('../../db/pool');
const { AppError, notFound } = require('../../lib/errors');
const rbac = require('../../domain/rbac/service');
const scoring = require('../../domain/scoring/service');
const { project } = require('../../domain/scoring/engine');
const { getStandings } = require('../../domain/standings/service');
const { getSport } = require('../../domain/sports/service');
const roster = require('../../domain/roster/service');
const { stateOn } = require('../../domain/roster/rules');
const store = require('../../domain/store/service');
const { offlineSync } = require('../../domain/sync/service');
const { demoSeed } = require('../../domain/demo/seed');
const { today } = require('../../lib/time');

const router = express.Router();
router.use(createLimiter().middleware);

router.get('/ping', (req, res) => res.status(200).json({ pong: true }));
router.post('/auth/login', async (req, res) => res.status(200).json(await rbac.login(req.body)));

// Everything below requires a valid JWT.
router.use((req, res, next) => { req.principal = rbac.principalFrom(req); next(); });
const P = (req) => req.principal;

async function allowed(req, action, kind, id) {
  rbac.assertAllowed(P(req), action, await rbac.target(kind, id));
}

async function teamNames() {
  const r = await pool.query('SELECT club_id, name FROM clubs');
  return Object.fromEntries(r.rows.map((c) => [c.club_id, c.name]));
}

router.get('/me', (req, res) => res.json(P(req)));

router.get('/leagues', async (req, res) => {
  const p = P(req);
  const r = await pool.query('SELECT league_id, name, sport_id, tenant_id, season FROM scenario_leagues WHERE $1::text IS NULL OR tenant_id = $1 ORDER BY league_id',
    [p.role === 'super_admin' ? null : p.tenant_id]);
  res.json(r.rows);
});

router.get('/leagues/:league_id/fixtures', async (req, res) => {
  await allowed(req, 'tenant.read', 'league', req.params.league_id);
  const l = await pool.query('SELECT config FROM leagues WHERE league_id = $1', [req.params.league_id]);
  if (!l.rowCount) return res.json([]);
  const sport = await getSport(l.rows[0].config.sport_id);
  const names = await teamNames();
  const m = await pool.query('SELECT * FROM matches WHERE league_id = $1 ORDER BY created_seq', [req.params.league_id]);
  const out = [];
  for (const match of m.rows) {
    const events = await scoring.loadEvents(pool, match.match_id);
    const pr = project(sport, match, events);
    out.push({
      match_id: match.match_id, sport_id: match.sport_id, league_id: match.league_id,
      home: { team_id: match.home, name: names[match.home] ?? match.home, score: pr.home.score },
      away: { team_id: match.away, name: names[match.away] ?? match.away, score: pr.away.score },
      scheduled_at: match.info.scheduled_at ?? null, venue: match.info.venue ?? null, status: pr.status, version: events.length,
    });
  }
  res.json(out);
});

router.get('/standings/:league_id', async (req, res) => {
  await allowed(req, 'tenant.read', 'league', req.params.league_id);
  const exists = await pool.query('SELECT 1 FROM leagues WHERE league_id = $1', [req.params.league_id]);
  const names = await teamNames();
  if (!exists.rowCount) {
    const s = await pool.query('SELECT sport_id FROM scenario_leagues WHERE league_id = $1', [req.params.league_id]);
    return res.json({ league_id: req.params.league_id, sport_id: s.rows[0]?.sport_id ?? null, qualification_spots: 0, table: [], h2h: {}, team_names: names });
  }
  res.json({ ...(await getStandings(req.params.league_id)), team_names: names });
});

router.get('/sports/:sport_id', async (req, res) => res.json(await getSport(req.params.sport_id)));

async function matchLeague(matchId) {
  const m = await pool.query('SELECT league_id FROM matches WHERE match_id = $1', [matchId]);
  if (!m.rowCount) throw notFound('MATCH_NOT_FOUND', `Match ${matchId} does not exist.`, { match_id: matchId });
  return m.rows[0].league_id;
}

router.get('/matches/:match_id/score', async (req, res) => {
  await allowed(req, 'tenant.read', 'league', await matchLeague(req.params.match_id));
  res.json({ ...(await scoring.getScore(req.params.match_id)), team_names: await teamNames() });
});

router.get('/matches/:match_id/pinned-products', async (req, res) => {
  await allowed(req, 'tenant.read', 'league', await matchLeague(req.params.match_id));
  const m = await pool.query('SELECT info FROM matches WHERE match_id = $1', [req.params.match_id]);
  const ids = m.rows[0].info.pinned_products ?? [];
  const r = await pool.query(
    `SELECT p.product_id, p.name, p.info->>'image_url' AS image_url, min(v.price_minor)::int AS price_minor
       FROM products p JOIN variants v ON v.product_id = p.product_id WHERE p.product_id = ANY($1) GROUP BY p.product_id`, [ids]);
  res.json(r.rows);
});

router.post('/events', async (req, res) => {
  const matchId = req.body && typeof req.body.match_id === 'string' ? req.body.match_id : null;
  const m = matchId ? await pool.query('SELECT league_id FROM matches WHERE match_id = $1', [matchId]) : { rowCount: 0 };
  await allowed(req, 'league.scoring.write', 'league', m.rowCount ? m.rows[0].league_id : null);
  const r = await scoring.appendEvent(req.body);
  res.status(r.status).json(r.body);
});

router.get('/clubs', async (req, res) => {
  const p = P(req);
  const r = await pool.query("SELECT club_id, name, profile->>'logo_url' AS logo_url, tenant_id FROM clubs WHERE $1::text IS NULL OR tenant_id = $1 ORDER BY club_id",
    [p.role === 'super_admin' ? null : p.tenant_id]);
  res.json(r.rows);
});

router.get('/clubs/:club_id', async (req, res) => {
  await allowed(req, 'club.read', 'club', req.params.club_id);
  const c = (await pool.query('SELECT * FROM clubs WHERE club_id = $1', [req.params.club_id])).rows[0];
  if (!c) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to do this.', {});
  const squads = (await pool.query('SELECT squad_id, league_id FROM squads WHERE club_id = $1', [c.club_id])).rows;
  const rosterRows = [];
  for (const s of squads) {
    const pl = await pool.query('SELECT * FROM players WHERE league_id = $1 ORDER BY player_id', [s.league_id]);
    for (const p of pl.rows) {
      const regs = (await pool.query('SELECT data FROM registrations WHERE player_id = $1 ORDER BY reg_seq', [p.player_id])).rows.map((r) => r.data);
      const st = stateOn(regs, today());
      if (st.squad_id === s.squad_id) {
        rosterRows.push({ player_id: p.player_id, name: p.name, position: p.position, role: st.role, squad_id: s.squad_id,
          league_id: s.league_id, on_loan: st.onLoan, parent_squad_id: st.parent_squad_id });
      }
    }
  }
  const prof = c.profile || {};
  res.json({ club_id: c.club_id, name: c.name, tenant_id: c.tenant_id, logo_url: prof.logo_url ?? null,
    home_venue: prof.home_venue ?? null, socials: prof.socials ?? {}, staff: prof.staff ?? [], roster: rosterRows,
    season_stats: prof.season_stats ?? [] });
});

router.get('/leagues/:league_id/squads', async (req, res) => {
  await allowed(req, 'tenant.read', 'league', req.params.league_id);
  const r = await pool.query('SELECT squad_id, club_id, name FROM squads WHERE league_id = $1 ORDER BY squad_id', [req.params.league_id]);
  const out = [];
  for (const s of r.rows) {
    const pl = await pool.query('SELECT player_id FROM players WHERE league_id = $1', [req.params.league_id]);
    let size = 0;
    for (const p of pl.rows) {
      const regs = (await pool.query('SELECT data FROM registrations WHERE player_id = $1 ORDER BY reg_seq', [p.player_id])).rows.map((x) => x.data);
      if (stateOn(regs, today()).squad_id === s.squad_id) size++;
    }
    out.push({ ...s, size });
  }
  res.json(out);
});

router.post('/roster/transfer', async (req, res) => {
  const from = req.body && typeof req.body.from_squad_id === 'string'
    ? (await pool.query('SELECT club_id FROM squads WHERE squad_id = $1', [req.body.from_squad_id])).rows[0] : null;
  await allowed(req, 'club.roster.write', 'club', from ? from.club_id : null);
  const r = await roster.transfer(req.body);
  res.status(r.status).json(r.body);
});

router.get('/roster/history/:player_id', async (req, res) => res.json(await roster.history(req.params.player_id, req.query.as_of)));

router.get('/products', async (req, res) => {
  const p = P(req);
  const r = await pool.query(
    `SELECT p.product_id, p.name, p.tenant_id, p.info->>'description' AS description, p.info->>'image_url' AS image_url,
            json_agg(json_build_object('variant_id', v.variant_id, 'label', v.label, 'price_minor', v.price_minor, 'stock', v.stock) ORDER BY v.variant_id) AS variants
       FROM products p JOIN variants v ON v.product_id = p.product_id
      WHERE $1::text IS NULL OR p.tenant_id = $1 GROUP BY p.product_id ORDER BY p.product_id`,
    [p.role === 'super_admin' ? null : p.tenant_id]);
  res.json(r.rows);
});

router.get('/inventory/:variant_id', async (req, res) => res.json(await store.inventory(req.params.variant_id)));

router.post('/checkout', async (req, res) => {
  rbac.assertAllowed(P(req), 'store.purchase', { exists: true });
  const r = await store.checkout(req.body);
  res.status(r.status).json(r.body);
});

router.get('/orders/:order_id/receipt.pdf', async (req, res) => {
  const pdf = await store.receiptPdfFor(req.params.order_id);
  if (!pdf) throw new AppError(404, 'VALIDATION_ERROR', 'Receipt not found.', { fields: ['order_id'] });
  res.type('application/pdf').send(pdf);
});

// Same code path as /audit/v1/offline-sync.
router.post('/offline-sync', async (req, res) => res.status(200).json(await offlineSync(req.body)));

router.post('/demo/seed', async (req, res) => {
  rbac.assertAllowed(P(req), 'demo.seed', { exists: true });
  res.status(200).json(await demoSeed());
});

module.exports = router;
