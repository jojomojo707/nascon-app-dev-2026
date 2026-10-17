'use strict';
// Event-sourced scoring engine (spec 11). Pure functions: the projection is always rebuilt from the
// append-only log, and every limit comes from the sport config (scoring_model selects the rules).
const { AppError, validation, conflict, notFound } = require('../../lib/errors');
const { isObject, isId, isInt } = require('../../lib/validate');

const EVENT_TYPES = ['match_init', 'match_start', 'score', 'discipline', 'tiebreak_winner', 'match_end', 'compensation'];
const COMPENSATABLE = ['score', 'discipline', 'tiebreak_winner'];
const IN_PROGRESS_ONLY = ['score', 'discipline', 'tiebreak_winner'];

// Step 1 (400): request shape only.
function validateEventBody(body) {
  if (!isObject(body)) throw validation(['body']);
  // match_start / match_end carry an empty payload; a missing one is treated as {}.
  if ((body.type === 'match_start' || body.type === 'match_end') && (body.payload === undefined || body.payload === null)) body.payload = {};
  const f = [];
  if (!isId(body.event_id)) f.push('event_id');
  if (!isId(body.match_id)) f.push('match_id');
  if (!EVENT_TYPES.includes(body.type)) f.push('type');
  const p = body.payload;
  if (!isObject(p)) f.push('payload');
  else if (EVENT_TYPES.includes(body.type)) {
    switch (body.type) {
      case 'match_init':
        if (!isId(p.sport_id)) f.push('payload.sport_id');
        if (!isId(p.home_team_id)) f.push('payload.home_team_id');
        if (!isId(p.away_team_id) || p.away_team_id === p.home_team_id) f.push('payload.away_team_id');
        if (p.league_id !== undefined && p.league_id !== null && !isId(p.league_id)) f.push('payload.league_id');
        break;
      case 'score':
        if (typeof p.team_id !== 'string') f.push('payload.team_id');
        if (typeof p.event_type !== 'string') f.push('payload.event_type');
        break;
      case 'discipline':
        if (typeof p.team_id !== 'string') f.push('payload.team_id');
        if (!isInt(p.points)) f.push('payload.points');
        break;
      case 'tiebreak_winner':
        if (typeof p.team_id !== 'string') f.push('payload.team_id');
        break;
      case 'compensation':
        if (!isId(p.compensates)) f.push('payload.compensates');
        if (p.reason !== undefined && p.reason !== null && typeof p.reason !== 'string') f.push('payload.reason');
        break;
      default:
        break;
    }
  }
  if (f.length) throw validation(f);
}

const oversString = (balls, bpo) => `${Math.floor(balls / bpo)}.${balls % bpo}`;

// Rebuilds the match state from its event log (events sorted by sequence).
function project(sport, match, events) {
  const compensatedBy = new Map();
  for (const e of events) if (e.type === 'compensation') compensatedBy.set(e.payload.compensates, e.event_id);
  const isActive = (e) => !compensatedBy.has(e.event_id) && e.type !== 'compensation';

  const model = sport.scoring_model;
  const side = (teamId) => ({ team_id: teamId, score: 0, wickets: 0, balls: 0, fair_play: 0 });
  const teams = { [match.home]: side(match.home), [match.away]: side(match.away) };
  let status = 'upcoming';
  let tiebreakWinner = null;

  for (const e of events) {
    if (e.type === 'match_start') status = 'in_progress';
    else if (e.type === 'match_end') status = 'completed';
    if (!isActive(e)) continue;
    const t = teams[e.payload.team_id];
    if (e.type === 'score' && t) {
      const def = sport.scoring_events[e.payload.event_type];
      if (!def) continue;
      if (model === 'event') t.score += def.points;
      else if (model === 'round') t.score += def.rounds;
      else {
        t.score += def.runs;
        if (def.legal_ball) t.balls += 1;
        if (def.wicket) t.wickets += 1;
      }
    } else if (e.type === 'discipline' && t) {
      t.fair_play += e.payload.points;
    } else if (e.type === 'tiebreak_winner' && t) {
      tiebreakWinner = e.payload.team_id;
    }
  }

  const h = teams[match.home];
  const a = teams[match.away];
  let winner = null;
  if (h.score > a.score) winner = h.team_id;
  else if (a.score > h.score) winner = a.team_id;
  else if (tiebreakWinner) winner = tiebreakWinner;

  let outcome = 'pending';
  if (status === 'completed') {
    if (winner) outcome = winner === h.team_id ? 'home_win' : 'away_win';
    else outcome = sport.draw_allowed ? 'draw' : 'undecided';
  }
  return { status, outcome, winner, tiebreakWinner, home: h, away: a, compensatedBy, version: events.length };
}

function sideView(sport, t) {
  const innings = sport.scoring_model === 'innings';
  return {
    team_id: t.team_id, score: t.score,
    wickets: innings ? t.wickets : null,
    balls: innings ? t.balls : null,
    overs: innings ? oversString(t.balls, sport.periods.balls_per_over) : null,
    fair_play: t.fair_play,
  };
}

// GET /audit/v1/score/{match_id} response.
function scoreView(sport, match, events) {
  const p = project(sport, match, events);
  return {
    match_id: match.match_id, sport_id: match.sport_id, league_id: match.league_id ?? null,
    status: p.status, outcome: p.outcome,
    winner_team_id: p.status === 'completed' ? p.winner : p.winner,
    tiebreak_winner_team_id: p.tiebreakWinner,
    home: sideView(sport, p.home), away: sideView(sport, p.away),
    version: p.version,
    events: events.map((e) => ({
      sequence: e.sequence, event_id: e.event_id, type: e.type, payload: e.payload, signature: e.signature,
      compensated: p.compensatedBy.has(e.event_id), compensated_by: p.compensatedBy.get(e.event_id) ?? null,
    })),
  };
}

// Business rules for appending `body` to an existing match (steps after 404 of the match).
// `target` is the event referenced by a compensation (looked up across all matches) or null.
function checkAppend(sport, match, events, body, target) {
  const p = body.payload;
  const proj = project(sport, match, events);
  const isTeam = (id) => id === match.home || id === match.away;

  // Semantic 400s first.
  if (['score', 'discipline', 'tiebreak_winner'].includes(body.type) && !isTeam(p.team_id)) {
    throw validation(['payload.team_id'], `Team ${p.team_id} is not playing in match ${match.match_id}.`);
  }
  if (body.type === 'score' && !Object.prototype.hasOwnProperty.call(sport.scoring_events, p.event_type)) {
    throw new AppError(400, 'UNKNOWN_EVENT_TYPE', `Event type ${p.event_type} is not defined for sport ${sport.sport_id}.`,
      { event_type: p.event_type, sport_id: sport.sport_id });
  }
  // 404 for compensation targets.
  if (body.type === 'compensation' && !target) {
    throw notFound('EVENT_NOT_FOUND', `Event ${p.compensates} does not exist.`, { event_id: p.compensates });
  }

  // 409 state rules.
  if (body.type === 'match_init') throw conflict('MATCH_EXISTS', `Match ${match.match_id} already exists.`, { match_id: match.match_id });
  if (body.type === 'match_start' && proj.status !== 'upcoming') {
    throw conflict('ILLEGAL_TRANSITION', `Cannot start a match that is ${proj.status}.`, { status: proj.status, type: body.type });
  }
  if (body.type === 'match_end') {
    if (proj.status !== 'in_progress') {
      throw conflict('ILLEGAL_TRANSITION', `Cannot end a match that is ${proj.status}.`, { status: proj.status, type: body.type });
    }
    if (proj.home.score === proj.away.score && !sport.draw_allowed && !proj.tiebreakWinner) {
      throw conflict('TIE_NOT_ALLOWED', 'Scores are level, draws are not allowed and no tie-break winner was declared.', { match_id: match.match_id });
    }
  }
  if (IN_PROGRESS_ONLY.includes(body.type) && proj.status !== 'in_progress') {
    throw conflict('MATCH_NOT_IN_PROGRESS', `Match ${match.match_id} is ${proj.status}.`, { status: proj.status });
  }
  if (body.type === 'score') {
    if (sport.scoring_model === 'innings') {
      const per = sport.periods;
      const t = p.team_id === match.home ? proj.home : proj.away;
      if (t.balls >= per.innings_per_team * per.overs_per_innings * per.balls_per_over ||
        t.wickets >= per.innings_per_team * per.wickets_per_innings) {
        throw conflict('INNINGS_COMPLETE', `The innings of ${p.team_id} is complete.`, { team_id: p.team_id });
      }
    } else if (sport.scoring_model === 'round') {
      const need = (sport.periods.best_of + 1) / 2;
      if (proj.home.score >= need || proj.away.score >= need) {
        throw conflict('SERIES_ALREADY_DECIDED', 'The series is already decided.', { match_id: match.match_id });
      }
    }
  }
  if (body.type === 'compensation') {
    if (target.match_id !== match.match_id || !COMPENSATABLE.includes(target.type) || proj.compensatedBy.has(target.event_id)) {
      throw conflict('INVALID_COMPENSATION', `Event ${target.event_id} cannot be compensated.`, { event_id: target.event_id });
    }
  }
}

module.exports = { EVENT_TYPES, validateEventBody, project, scoreView, checkAppend, oversString };
