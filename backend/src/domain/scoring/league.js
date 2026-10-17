'use strict';
// POST /audit/v1/leagues body validation (spec 11). Returns the normalised league config.
const { validation } = require('../../lib/errors');
const { isObject, isId, isInt } = require('../../lib/validate');
const { validTieBreakOrder } = require('../sports/config');

function validateLeagueBody(body) {
  if (!isObject(body)) throw validation(['body']);
  const f = [];
  if (!isId(body.league_id)) f.push('league_id');
  if (!isId(body.sport_id)) f.push('sport_id');
  const teams = body.teams;
  const teamsOk = Array.isArray(teams) && teams.length >= 2 && teams.length <= 40 && teams.every(isId) &&
    new Set(teams).size === teams.length;
  if (!teamsOk) f.push('teams');
  if (!Array.isArray(body.fixtures)) f.push('fixtures');
  else {
    const ids = new Set();
    for (const fx of body.fixtures) {
      if (!isObject(fx) || !isId(fx.match_id) || ids.has(fx.match_id) || fx.home === fx.away ||
        (teamsOk && (!teams.includes(fx.home) || !teams.includes(fx.away))) || !isId(fx.home) || !isId(fx.away)) {
        f.push('fixtures');
        break;
      }
      ids.add(fx.match_id);
    }
  }
  const points = body.points ?? {};
  if (!isObject(points)) f.push('points');
  else for (const k of ['win', 'draw', 'loss']) if (points[k] !== undefined && !isInt(points[k])) f.push('points.' + k);
  if (body.tie_break_order !== undefined && body.tie_break_order !== null && !validTieBreakOrder(body.tie_break_order)) {
    f.push('tie_break_order');
  }
  const spots = isObject(body.qualification) ? body.qualification.spots : undefined;
  if (!isInt(spots, 1, teamsOk ? teams.length : 40)) f.push('qualification.spots');
  if (body.lots_seed !== undefined && body.lots_seed !== null && !isInt(body.lots_seed)) f.push('lots_seed');
  if (f.length) throw validation(f);
  return {
    league_id: body.league_id, sport_id: body.sport_id, teams, fixtures: body.fixtures.map((x) => ({ match_id: x.match_id, home: x.home, away: x.away })),
    points: { win: points.win ?? 3, draw: points.draw ?? 1, loss: points.loss ?? 0 },
    tie_break_order: body.tie_break_order ?? null,
    qualification: { spots },
    lots_seed: body.lots_seed ?? null,
  };
}

module.exports = { validateLeagueBody };
