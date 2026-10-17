'use strict';
// Persistence for leagues, match streams and the append-only event log.
const { pool, tx } = require('../../db/pool');
const { notFound, conflict } = require('../../lib/errors');
const { sign, bodyHash } = require('../../lib/signature');
const { getSport } = require('../sports/service');
const { validateEventBody, scoreView, checkAppend } = require('./engine');
const { validateLeagueBody } = require('./league');
const { lastSeed } = require('../seed/reset');
const queue = require('../../lib/queue');
const realtime = require('../../lib/realtime');

const eventKey = (b) => ({ event_id: b.event_id, match_id: b.match_id, type: b.type, payload: b.payload });

async function createLeague(body) {
  const cfg = validateLeagueBody(body);
  const sport = await getSport(cfg.sport_id);
  if (!cfg.tie_break_order) cfg.tie_break_order = sport.tie_break_order;
  if (cfg.lots_seed === null) cfg.lots_seed = await lastSeed();
  return tx(async (c) => {
    const l = await c.query('INSERT INTO leagues VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [cfg.league_id, cfg.sport_id, cfg]);
    if (!l.rowCount) throw conflict('LEAGUE_EXISTS', `League ${cfg.league_id} already exists.`, { league_id: cfg.league_id });
    for (const f of cfg.fixtures) {
      const m = await c.query('INSERT INTO matches (match_id, sport_id, league_id, home, away) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
        [f.match_id, cfg.sport_id, cfg.league_id, f.home, f.away]);
      if (!m.rowCount) throw conflict('MATCH_EXISTS', `Match ${f.match_id} already exists.`, { match_id: f.match_id });
    }
    return { league_id: cfg.league_id, status: 'created', team_count: cfg.teams.length, fixture_count: cfg.fixtures.length };
  });
}

async function loadEvents(c, matchId) {
  const r = await c.query('SELECT sequence, event_id, type, payload, signature FROM events WHERE match_id = $1 ORDER BY sequence', [matchId]);
  return r.rows;
}

// Appends one event. Returns {status: 201|200, body}. Used by /audit/v1/events, /api/v1/events and offline-sync.
async function appendEvent(body) {
  validateEventBody(body);
  const hash = bodyHash(eventKey(body));

  const replay = await findReplay(body, hash);
  if (replay) return replay;

  try {
    return await tx(async (c) => {
      let match;
      if (body.type === 'match_init') {
        await getSport(body.payload.sport_id, c);
        const ins = await c.query(
          'INSERT INTO matches (match_id, sport_id, league_id, home, away) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING *',
          [body.match_id, body.payload.sport_id, body.payload.league_id ?? null, body.payload.home_team_id, body.payload.away_team_id]);
        if (!ins.rowCount) throw conflict('MATCH_EXISTS', `Match ${body.match_id} already exists.`, { match_id: body.match_id });
        match = ins.rows[0];
        await assertEventIdFree(c, body.event_id);
        return insertEvent(c, match, [], body, hash);
      }
      const m = await c.query('SELECT * FROM matches WHERE match_id = $1 FOR UPDATE', [body.match_id]);
      if (!m.rowCount) throw notFound('MATCH_NOT_FOUND', `Match ${body.match_id} does not exist.`, { match_id: body.match_id });
      match = m.rows[0];
      const sport = await getSport(match.sport_id, c);
      const events = await loadEvents(c, match.match_id);
      let target = null;
      if (body.type === 'compensation') {
        const t = await c.query('SELECT match_id, event_id, type FROM events WHERE event_id = $1', [body.payload.compensates]);
        target = t.rows[0] ?? null;
      }
      // Same id, different body: checked once semantic 400s/404s are ruled out by the engine order below.
      const dup = await c.query('SELECT 1 FROM events WHERE event_id = $1', [body.event_id]);
      checkSemantics(sport, match, events, body, target);
      if (dup.rowCount) throw duplicate(body.event_id);
      checkAppend(sport, match, events, body, target);
      return insertEvent(c, match, events, body, hash);
    });
  } catch (err) {
    if (err && err.code === '23505') {
      const again = await findReplay(body, hash);
      if (again) return again;
      throw duplicate(body.event_id);
    }
    throw err;
  }
}

// Runs only the 400/404 part of the rules so DUPLICATE_EVENT_ID (409) comes after them.
function checkSemantics(sport, match, events, body, target) {
  try {
    checkAppend(sport, match, events, body, target);
  } catch (e) {
    if (e.status === 400 || e.status === 404) throw e;
  }
}

const duplicate = (id) => conflict('DUPLICATE_EVENT_ID', `Event id ${id} was already used with a different body.`, { event_id: id });

async function findReplay(body, hash) {
  const r = await pool.query('SELECT body_hash, response FROM events WHERE event_id = $1', [body.event_id]);
  if (r.rowCount && r.rows[0].body_hash === hash) return { status: 200, body: r.rows[0].response };
  return null;
}

async function assertEventIdFree(c, eventId) {
  const r = await c.query('SELECT 1 FROM events WHERE event_id = $1', [eventId]);
  if (r.rowCount) throw duplicate(eventId);
}

async function insertEvent(c, match, events, body, hash) {
  const sequence = events.length + 1;
  const signature = sign(body.event_id, body.payload);
  const response = { event_id: body.event_id, match_id: match.match_id, type: body.type, sequence, match_version: sequence, signature };
  await c.query(
    'INSERT INTO events (match_id, sequence, event_id, type, payload, body_hash, signature, response) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [match.match_id, sequence, body.event_id, body.type, JSON.stringify(body.payload), hash, signature, response]);
  queue.publish('match.event_appended', { match_id: match.match_id, type: body.type, version: sequence });
  setImmediate(() => realtime.matchEvent(match.match_id, body.type, sequence));
  return { status: 201, body: response };
}

async function getScore(matchId) {
  const m = await pool.query('SELECT * FROM matches WHERE match_id = $1', [matchId]);
  if (!m.rowCount) throw notFound('MATCH_NOT_FOUND', `Match ${matchId} does not exist.`, { match_id: matchId });
  const sport = await getSport(m.rows[0].sport_id);
  return scoreView(sport, m.rows[0], await loadEvents(pool, matchId));
}

async function matchVersion(c, matchId) {
  const r = await c.query('SELECT count(*)::int AS n FROM events WHERE match_id = $1', [matchId]);
  return r.rows[0].n;
}

module.exports = { createLeague, appendEvent, getScore, loadEvents, matchVersion, eventKey };
