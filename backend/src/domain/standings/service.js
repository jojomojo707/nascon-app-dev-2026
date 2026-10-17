'use strict';
const { pool } = require('../../db/pool');
const { notFound } = require('../../lib/errors');
const { getSport } = require('../sports/service');
const { computeStandings } = require('./engine');

async function getStandings(leagueId) {
  const l = await pool.query('SELECT config FROM leagues WHERE league_id = $1', [leagueId]);
  if (!l.rowCount) throw notFound('LEAGUE_NOT_FOUND', `League ${leagueId} does not exist.`, { league_id: leagueId });
  const league = l.rows[0].config;
  const sport = await getSport(league.sport_id);
  const ev = await pool.query(
    `SELECT e.match_id, e.sequence, e.event_id, e.type, e.payload, e.signature
       FROM events e JOIN matches m ON m.match_id = e.match_id
      WHERE m.league_id = $1 ORDER BY e.match_id, e.sequence`, [leagueId]);
  const byMatch = new Map();
  for (const e of ev.rows) {
    if (!byMatch.has(e.match_id)) byMatch.set(e.match_id, []);
    byMatch.get(e.match_id).push(e);
  }
  const fixtures = league.fixtures.map((f) => ({ ...f, events: byMatch.get(f.match_id) || [] }));
  return computeStandings(league, sport, fixtures);
}

module.exports = { getStandings };
