'use strict';
// Persistence for roster scenarios, transfers and the immutable audit trail (spec 13).
const { pool, tx } = require('../../db/pool');
const { notFound, validation } = require('../../lib/errors');
const { isDate } = require('../../lib/validate');
const { bodyHash } = require('../../lib/signature');
const { nowTimestamp, today } = require('../../lib/time');
const { getSport } = require('../sports/service');
const R = require('./rules');

const lockLeague = (c, leagueId) => c.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['roster:' + leagueId]);

async function setupRoster(body) {
  const v = R.validateSetup(body);
  const sport = await getSport(v.league.sport_id);
  const L = v.league;
  const cfg = {
    league_id: L.league_id, tenant_id: L.tenant_id, sport_id: L.sport_id, transfer_window: L.transfer_window,
    max_squad_size: L.max_squad_size ?? sport.roster.max_squad_size,
    required_positions: L.required_positions ?? sport.roster.required_positions,
    matches_in_progress: v.matches_in_progress.map((m) => ({ match_id: m.match_id, home_squad_id: m.home_squad_id ?? null, away_squad_id: m.away_squad_id ?? null })),
  };
  const playerIds = v.players.map((p) => p.player_id);
  const squadIds = v.squads.map((s) => s.squad_id);
  return tx(async (c) => {
    await lockLeague(c, L.league_id);
    await c.query("DELETE FROM audit_entries WHERE entry->>'league_id' = $1 OR player_id = ANY($2)", [L.league_id, playerIds]);
    await c.query('DELETE FROM registrations WHERE league_id = $1 OR player_id = ANY($2)', [L.league_id, playerIds]);
    await c.query('DELETE FROM players WHERE league_id = $1 OR player_id = ANY($2)', [L.league_id, playerIds]);
    await c.query('DELETE FROM squads WHERE league_id = $1 OR squad_id = ANY($2)', [L.league_id, squadIds]);
    await c.query('DELETE FROM roster_requests WHERE league_id = $1', [L.league_id]);
    await c.query('INSERT INTO roster_leagues VALUES ($1,$2) ON CONFLICT (league_id) DO UPDATE SET config = EXCLUDED.config', [L.league_id, cfg]);
    for (const s of v.squads) {
      await c.query('INSERT INTO squads VALUES ($1,$2,$3,$4,$5)', [s.squad_id, L.league_id, s.club_id ?? null, s.tenant_id, s.name ?? null]);
    }
    const counts = Object.fromEntries(v.squads.map((s) => [s.squad_id, 0]));
    for (const p of v.players) {
      await c.query('INSERT INTO players VALUES ($1,$2,$3,$4)', [p.player_id, L.league_id, p.name ?? null, p.position]);
      if (p.squad_id) {
        counts[p.squad_id]++;
        await c.query('INSERT INTO registrations (player_id, league_id, data) VALUES ($1,$2,$3)', [p.player_id, L.league_id, {
          player_id: p.player_id, league_id: L.league_id, squad_id: p.squad_id, parent_squad_id: null,
          registration_type: 'initial', start_date: null, loan_end_date: null, role: p.role ?? 'substitute' }]);
      }
    }
    return { league_id: L.league_id, status: 'configured', squad_counts: counts };
  });
}

async function loadRegs(c, playerIds) {
  const r = await c.query('SELECT player_id, data FROM registrations WHERE player_id = ANY($1) ORDER BY reg_seq', [playerIds]);
  const m = new Map(playerIds.map((id) => [id, []]));
  for (const row of r.rows) m.get(row.player_id).push(row.data);
  return m;
}

async function nextAuditId(c) {
  const r = await c.query("SELECT nextval(pg_get_serial_sequence('audit_entries','audit_seq'))::int AS n");
  return r.rows[0].n;
}

// Writes the single loan_return entry for each loan of `regs` that has ended by `date`.
async function writeLoanReturns(c, playerId, regs, date) {
  for (const loan of R.endedLoans(regs, date)) {
    const exists = await c.query('SELECT 1 FROM audit_entries WHERE loan_ref = $1', [loan.loan_audit_id]);
    if (exists.rowCount) continue;
    const n = await nextAuditId(c);
    await c.query('INSERT INTO audit_entries (audit_seq, player_id, entry, loan_ref) VALUES ($1,$2,$3,$4)',
      [n, playerId, R.loanReturnEntry(R.auditId(n), loan, nowTimestamp()), loan.loan_audit_id]);
  }
}

async function findRequest(body, hash) {
  const r = await pool.query('SELECT body_hash, response FROM roster_requests WHERE request_id = $1', [body.request_id]);
  if (!r.rowCount) return null;
  if (r.rows[0].body_hash === hash) return { status: 200, body: r.rows[0].response };
  throw validation(['request_id'], `request_id ${body.request_id} was already used with a different body.`);
}

// Loads league context and evaluates the rules. Returns {ctx, result} or throws the rule's AppError.
async function evaluate(c, body) {
  const lg = await c.query('SELECT config FROM roster_leagues WHERE league_id = $1', [body.league_id]);
  const league = lg.rows[0]?.config ?? null;
  const pl = await c.query('SELECT * FROM players WHERE player_id = $1', [body.player_id]);
  const player = pl.rows[0] ?? null;
  const sq = await c.query('SELECT * FROM squads WHERE squad_id = ANY($1)', [[body.from_squad_id, body.to_squad_id].filter(Boolean)]);
  const squads = new Map(sq.rows.map((s) => [s.squad_id, s]));
  const inLeague = league ? (await c.query('SELECT * FROM players WHERE league_id = $1', [body.league_id])).rows : [];
  const ids = [...new Set([...inLeague.map((p) => p.player_id), ...(player ? [player.player_id] : [])])];
  const regsByPlayer = await loadRegs(c, ids);
  const ctx = { league, squads, player, regsByPlayer, playersInLeague: inLeague };
  return { ctx, result: R.evaluateTransfer(ctx, body) };
}

async function transfer(body) {
  R.validateTransfer(body);
  const hash = bodyHash(body);
  const replay = await findRequest(body, hash);
  if (replay) return replay;
  try {
    return await tx(async (c) => {
      await lockLeague(c, body.league_id);
      const { ctx, result } = await evaluate(c, body);
      const pid = ctx.player.player_id;
      await writeLoanReturns(c, pid, ctx.regsByPlayer.get(pid), body.effective_date);
      const n = await nextAuditId(c);
      const audit = {
        audit_id: R.auditId(n), action: body.type, player_id: pid, league_id: body.league_id,
        from_squad_id: body.from_squad_id, to_squad_id: body.type === 'release' ? null : body.to_squad_id,
        effective_date: body.effective_date, state: result.state, who: body.requested_by ?? null,
        when: nowTimestamp(), why: body.reason ?? null,
      };
      const regData = result.registration
        ? { ...result.registration, loan_audit_id: body.type === 'loan' ? audit.audit_id : null }
        : { player_id: pid, league_id: body.league_id, squad_id: null, parent_squad_id: null, registration_type: 'release',
          start_date: body.effective_date, loan_end_date: null, role: null };
      await c.query('INSERT INTO registrations (player_id, league_id, data) VALUES ($1,$2,$3)', [pid, body.league_id, regData]);
      await c.query('INSERT INTO audit_entries (audit_seq, player_id, entry) VALUES ($1,$2,$3)', [n, pid, audit]);
      const response = {
        request_id: body.request_id, status: 'accepted', state: result.state, blocking_match_id: result.blocking_match_id,
        registration: result.registration, audit_entry: audit,
      };
      await c.query('INSERT INTO roster_requests VALUES ($1,$2,$3,$4)', [body.request_id, body.league_id, hash, response]);
      return { status: 201, body: response };
    });
  } catch (err) {
    if (err && err.code === '23505') {
      const again = await findRequest(body, hash);
      if (again) return again;
    }
    throw err;
  }
}

async function history(playerId, asOfParam) {
  const asOf = asOfParam ?? today();
  if (!isDate(asOf)) throw validation(['as_of']);
  return tx(async (c) => {
    const pl = await c.query('SELECT * FROM players WHERE player_id = $1', [playerId]);
    if (!pl.rowCount) throw notFound('PLAYER_NOT_FOUND', `Player ${playerId} does not exist.`, { player_id: playerId });
    const player = pl.rows[0];
    await lockLeague(c, player.league_id);
    const regs = (await loadRegs(c, [playerId])).get(playerId);
    await writeLoanReturns(c, playerId, regs, asOf);
    const entries = await c.query('SELECT entry FROM audit_entries WHERE player_id = $1 ORDER BY audit_seq', [playerId]);
    const st = R.stateOn(regs, asOf);
    return {
      player_id: playerId, as_of: asOf, league_id: player.league_id,
      current_squad_id: st.squad_id, parent_squad_id: st.parent_squad_id,
      history: entries.rows.map((r) => r.entry),
    };
  });
}

async function playerVersion(c, playerId) {
  const r = await c.query('SELECT count(*)::int AS n FROM audit_entries WHERE player_id = $1', [playerId]);
  return r.rows[0].n;
}

module.exports = { setupRoster, transfer, history, playerVersion, evaluate, findRequest };
