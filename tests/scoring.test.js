'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../backend/src/domain/scoring/engine');
const { validateLeagueBody } = require('../backend/src/domain/scoring/league');
const { SPORTS } = require('../backend/src/domain/seed/baseline');

const sport = (id) => SPORTS.find((s) => s.sport_id === id);
const kabaddi = { sport_id: 'kabaddi', scoring_model: 'event', draw_allowed: false, periods: { count: 2, duration_minutes: 20 },
  scoring_events: { raid_point: { points: 1 }, all_out: { points: 2 } } };
const match = { match_id: 'm1', sport_id: 'x', league_id: 'lg-1', home: 't1', away: 't2' };

let seq = 0;
const ev = (type, payload = {}, id) => ({ sequence: ++seq, event_id: id || `e${seq}`, type, payload, signature: 'sig' });
const err = (fn) => { try { fn(); } catch (e) { return e; } assert.fail('expected error'); };
const append = (sp, events, type, payload, extra = {}) =>
  E.checkAppend(sp, match, events, { event_id: 'new', match_id: 'm1', type, payload }, extra.target ?? null);

test('event body schema validation lists bad fields', () => {
  assert.deepEqual(err(() => E.validateEventBody({ event_id: 'a|b', match_id: 'm1', type: 'nope', payload: [] })).details.fields,
    ['event_id', 'type', 'payload']);
  assert.deepEqual(err(() => E.validateEventBody({ event_id: 'e', match_id: 'm', type: 'discipline', payload: { team_id: 't1', points: 1.5 } })).details.fields,
    ['payload.points']);
  assert.deepEqual(err(() => E.validateEventBody({ event_id: 'e', match_id: 'm', type: 'match_init', payload: { sport_id: 's', home_team_id: 'a', away_team_id: 'a' } })).details.fields,
    ['payload.away_team_id']);
  assert.deepEqual(err(() => E.validateEventBody({ event_id: 'e', match_id: 'm', type: 'compensation', payload: {} })).details.fields,
    ['payload.compensates']);
  assert.deepEqual(err(() => E.validateEventBody({ event_id: 'e', match_id: 'm', type: 'score', payload: {} })).details.fields,
    ['payload.team_id', 'payload.event_type']);
  assert.deepEqual(err(() => E.validateEventBody('x')).details.fields, ['body']);
  E.validateEventBody({ event_id: 'e', match_id: 'm', type: 'tiebreak_winner', payload: { team_id: 't1' } });
});

test('event model: mystery sport points, compensation neutralises, outcome', () => {
  seq = 0;
  const log = [ev('match_start'), ev('score', { team_id: 't1', event_type: 'all_out' }), ev('score', { team_id: 't2', event_type: 'raid_point' })];
  log.push(ev('compensation', { compensates: 'e2', reason: 'video review' }));
  log.push(ev('discipline', { team_id: 't2', points: -2 }));
  log.push(ev('match_end'));
  const v = E.scoreView(kabaddi, match, log);
  assert.equal(v.status, 'completed');
  assert.equal(v.home.score, 0);
  assert.equal(v.away.score, 1);
  assert.equal(v.outcome, 'away_win');
  assert.equal(v.winner_team_id, 't2');
  assert.equal(v.away.fair_play, -2);
  assert.equal(v.events[1].compensated, true);
  assert.equal(v.events[1].compensated_by, 'e4');
  assert.equal(v.version, 6);
  assert.equal(v.home.wickets, null);
  assert.equal(v.home.overs, null);
});

test('rules: order of 400 / 404 / 409 and state machine', () => {
  seq = 0;
  const up = [];
  assert.equal(err(() => append(kabaddi, up, 'score', { team_id: 't9', event_type: 'raid_point' })).code, 'VALIDATION_ERROR');
  assert.equal(err(() => append(kabaddi, up, 'score', { team_id: 't1', event_type: 'goal' })).code, 'UNKNOWN_EVENT_TYPE');
  assert.equal(err(() => append(kabaddi, up, 'score', { team_id: 't1', event_type: 'raid_point' })).code, 'MATCH_NOT_IN_PROGRESS');
  assert.equal(err(() => append(kabaddi, up, 'match_end', {})).code, 'ILLEGAL_TRANSITION');
  assert.equal(err(() => append(kabaddi, up, 'compensation', { compensates: 'zz' })).code, 'EVENT_NOT_FOUND');
  assert.equal(err(() => append(kabaddi, up, 'match_init', {})).code, 'MATCH_EXISTS');
  append(kabaddi, up, 'match_start', {});
  const live = [ev('match_start')];
  assert.equal(err(() => append(kabaddi, live, 'match_start', {})).code, 'ILLEGAL_TRANSITION');
  assert.equal(err(() => append(kabaddi, live, 'match_end', {})).code, 'TIE_NOT_ALLOWED');
  live.push(ev('tiebreak_winner', { team_id: 't2' }, 'tb'));
  append(kabaddi, live, 'match_end', {});
  const v = E.scoreView(kabaddi, match, [...live, ev('match_end')]);
  assert.equal(v.outcome, 'away_win');
  assert.equal(v.tiebreak_winner_team_id, 't2');
  const withComp = [...live, ev('match_end'), ev('compensation', { compensates: 'tb' })];
  assert.equal(E.scoreView(kabaddi, match, withComp).outcome, 'undecided');
  const target = { match_id: 'm1', event_id: 'tb', type: 'tiebreak_winner' };
  assert.equal(err(() => append(kabaddi, withComp, 'compensation', { compensates: 'tb' }, { target })).code, 'INVALID_COMPENSATION');
  assert.equal(err(() => append(kabaddi, live, 'compensation', { compensates: 'x' }, { target: { ...target, match_id: 'm2' } })).code, 'INVALID_COMPENSATION');
  assert.equal(err(() => append(kabaddi, live, 'compensation', { compensates: 'x' }, { target: { ...target, type: 'match_start' } })).code, 'INVALID_COMPENSATION');
  append(kabaddi, live, 'compensation', { compensates: 'tb' }, { target });
  append(kabaddi, live, 'discipline', { team_id: 't1', points: -1 });
});

test('draw allowed sport ends level as a draw', () => {
  seq = 0;
  const v = E.scoreView(sport('football'), match, [ev('match_start'), ev('match_end')]);
  assert.equal(v.outcome, 'draw');
  assert.equal(v.winner_team_id, null);
  assert.equal(E.scoreView(sport('football'), match, []).outcome, 'pending');
});

test('innings model: runs, legal balls, overs, wickets and INNINGS_COMPLETE', () => {
  seq = 0;
  const mini = { ...sport('cricket'), periods: { innings_per_team: 1, overs_per_innings: 1, balls_per_over: 6, wickets_per_innings: 2 } };
  const log = [ev('match_start')];
  for (const t of ['four', 'wide', 'single', 'dot_ball', 'six', 'no_ball', 'two']) log.push(ev('score', { team_id: 't1', event_type: t }));
  let v = E.scoreView(mini, match, log);
  assert.equal(v.home.score, 15);
  assert.equal(v.home.balls, 5);
  assert.equal(v.home.overs, '0.5');
  assert.equal(v.home.wickets, 0);
  log.push(ev('score', { team_id: 't1', event_type: 'single' }));
  assert.equal(err(() => append(mini, log, 'score', { team_id: 't1', event_type: 'single' })).code, 'INNINGS_COMPLETE');
  log.push(ev('compensation', { compensates: log.at(-1).event_id }));
  append(mini, log, 'score', { team_id: 't1', event_type: 'single' });
  log.push(ev('score', { team_id: 't2', event_type: 'wicket' }), ev('score', { team_id: 't2', event_type: 'wicket' }));
  v = E.scoreView(mini, match, log);
  assert.equal(v.away.wickets, 2);
  assert.equal(v.away.overs, '0.2');
  assert.equal(err(() => append(mini, log, 'score', { team_id: 't2', event_type: 'single' })).code, 'INNINGS_COMPLETE');
});

test('round model: SERIES_ALREADY_DECIDED once a team has a majority', () => {
  seq = 0;
  const bo3 = sport('esports');
  const log = [ev('match_start'), ev('score', { team_id: 't1', event_type: 'round_win' })];
  append(bo3, log, 'score', { team_id: 't2', event_type: 'round_win' });
  log.push(ev('score', { team_id: 't1', event_type: 'round_win' }));
  assert.equal(err(() => append(bo3, log, 'score', { team_id: 't2', event_type: 'round_win' })).code, 'SERIES_ALREADY_DECIDED');
  assert.equal(E.scoreView(bo3, match, log).home.score, 2);
});

test('league body validation and defaults', () => {
  const ok = validateLeagueBody({ league_id: 'lg-1', sport_id: 'football', teams: ['t1', 't2'],
    fixtures: [{ match_id: 'm1', home: 't1', away: 't2' }], qualification: { spots: 1 } });
  assert.deepEqual(ok.points, { win: 3, draw: 1, loss: 0 });
  assert.equal(ok.lots_seed, null);
  const f = err(() => validateLeagueBody({ league_id: 'lg-1', sport_id: 'football', teams: ['t1', 't1'],
    fixtures: [{ match_id: 'm1', home: 't1', away: 't1' }], qualification: { spots: 0 }, points: { win: 'x' }, tie_break_order: ['bogus'], lots_seed: 1.5 })).details.fields;
  assert.deepEqual(f, ['teams', 'fixtures', 'points.win', 'tie_break_order', 'qualification.spots', 'lots_seed']);
  assert.deepEqual(err(() => validateLeagueBody(null)).details.fields, ['body']);
  assert.deepEqual(err(() => validateLeagueBody({ league_id: 'l', sport_id: 's', teams: ['a', 'b'], fixtures: [{ match_id: 'm', home: 'a', away: 'zz' }], qualification: { spots: 1 } })).details.fields, ['fixtures']);
});
