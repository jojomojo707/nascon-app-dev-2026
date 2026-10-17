'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeStandings } = require('../backend/src/domain/standings/engine');
const { SPORTS } = require('../backend/src/domain/seed/baseline');

const football = SPORTS.find((s) => s.sport_id === 'football');
const cricket = { ...SPORTS.find((s) => s.sport_id === 'cricket'),
  periods: { innings_per_team: 1, overs_per_innings: 2, balls_per_over: 6, wickets_per_innings: 2 } };

let n = 0;
const e = (type, payload = {}) => ({ sequence: ++n, event_id: `x${n}`, type, payload, signature: 's' });
// A finished event-model match with the given goals, plus optional extra events before match_end.
function played(id, home, away, hg, ag, extra = []) {
  const events = [e('match_start')];
  for (let i = 0; i < hg; i++) events.push(e('score', { team_id: home, event_type: 'goal' }));
  for (let i = 0; i < ag; i++) events.push(e('score', { team_id: away, event_type: 'goal' }));
  events.push(...extra.map((x) => e(x.type, x.payload)));
  events.push(e('match_end'));
  return { match_id: id, home, away, events };
}
const league = (teams, spots = 2, extra = {}) => ({ league_id: 'lg-1', sport_id: 'football', teams,
  points: { win: 3, draw: 1, loss: 0 }, tie_break_order: null, qualification: { spots }, lots_seed: 42, ...extra });
const order = (s) => s.table.map((r) => r.team_id);

test('three-way tie resolved by the head-to-head mini-league, restarting on each sub-group', () => {
  const fx = [
    played('a', 't1', 't2', 1, 0), played('b', 't1', 't3', 1, 0), played('c', 't2', 't3', 0, 0),
    played('d', 't1', 't4', 0, 0), played('e', 't2', 't4', 3, 0), played('f', 't3', 't4', 1, 0),
    played('g', 't2', 't5', 1, 0), played('h', 't3', 't5', 1, 0),
  ];
  const s = computeStandings(league(['t1', 't2', 't3', 't4', 't5']), football, fx);
  assert.deepEqual(order(s).slice(0, 3), ['t1', 't2', 't3']);
  assert.deepEqual(s.table.slice(0, 3).map((r) => r.points), [7, 7, 7]);
  assert.deepEqual(s.table.slice(0, 3).map((r) => r.resolved_by), ['h2h_points', 'overall_diff', null]);
  assert.deepEqual(s.h2h.t1.t2, { played: 1, points: 3, scored: 1, conceded: 0 });
  assert.deepEqual(s.h2h.t4.t5, { played: 0, points: 0, scored: 0, conceded: 0 });
  assert.equal(Object.keys(s.h2h).length, 5);
  assert.equal(Object.keys(s.h2h.t1).length, 4);
});

test('draw_lots orders by SHA256(seed|league|team) ascending (appendix A vector 2)', () => {
  const fx = [played('a', 't1', 't2', 0, 0), played('b', 't2', 't3', 0, 0), played('c', 't3', 't1', 0, 0)];
  const s = computeStandings(league(['t1', 't2', 't3']), football, fx);
  assert.deepEqual(order(s), ['t1', 't3', 't2']);
  assert.deepEqual(s.table.map((r) => r.resolved_by), ['draw_lots', 'draw_lots', null]);
});

test('fair play and scored criteria follow the configured order', () => {
  const fx = [played('a', 't1', 't3', 2, 0, [{ type: 'discipline', payload: { team_id: 't1', points: -3 } }]),
    played('b', 't2', 't4', 2, 0)];
  const s = computeStandings(league(['t1', 't2', 't3', 't4'], 2, { tie_break_order: ['fair_play'] }), football, fx);
  assert.deepEqual(order(s).slice(0, 2), ['t2', 't1']);
  assert.equal(s.table[0].resolved_by, 'fair_play');
  assert.equal(s.table[1].fair_play, -3);
});

test('qualification status: clinched, eliminated, still possible', () => {
  const lg = league(['t1', 't2', 't3'], 1);
  const fx = [played('m1', 't1', 't2', 1, 0), played('m2', 't1', 't3', 1, 0), { match_id: 'm3', home: 't2', away: 't3', events: [] }];
  const s = computeStandings(lg, football, fx);
  assert.deepEqual(s.table.map((r) => [r.team_id, r.status]), [['t1', 'clinched'], ['t3', 'eliminated'], ['t2', 'eliminated']]);
  const early = computeStandings(lg, football, [played('m1', 't1', 't2', 1, 0),
    { match_id: 'm2', home: 't1', away: 't3', events: [] }, { match_id: 'm3', home: 't2', away: 't3', events: [] }]);
  assert.ok(early.table.every((r) => r.status === 'still_possible'));
  assert.equal(early.table[0].played, 1);
});

test('compensation after qualification re-ranks from scratch (edge case 5)', () => {
  const m1 = played('m1', 't1', 't2', 1, 0);
  const goal = m1.events.find((x) => x.type === 'score');
  const before = computeStandings(league(['t1', 't2'], 1), football, [m1]);
  assert.equal(before.table[0].status, 'clinched');
  m1.events.push(e('compensation', { compensates: goal.event_id, reason: 'offside' }));
  const after = computeStandings(league(['t1', 't2'], 1), football, [m1]);
  assert.deepEqual(after.table.map((r) => [r.points, r.drawn]), [[1, 1], [1, 1]]);
  assert.equal(after.h2h.t1.t2.points, 1);
});

test('innings model: net run rate with an all-out innings counted as full overs', () => {
  const ev = [e('match_start')];
  for (let i = 0; i < 6; i++) ev.push(e('score', { team_id: 't1', event_type: i < 2 ? 'four' : 'single' }));
  ev.push(e('score', { team_id: 't2', event_type: 'six' }), e('score', { team_id: 't2', event_type: 'wicket' }), e('score', { team_id: 't2', event_type: 'wicket' }));
  ev.push(e('match_end'));
  const s = computeStandings({ ...league(['t1', 't2'], 1), sport_id: 'cricket' }, cricket, [{ match_id: 'c1', home: 't1', away: 't2', events: ev }]);
  // t1: 12 runs off 1.0 over; t2: 6 runs, all out after 3 balls -> counts as 2 overs.
  const t1 = s.table.find((r) => r.team_id === 't1');
  const t2 = s.table.find((r) => r.team_id === 't2');
  assert.equal(t1.diff, 9);
  assert.equal(t2.diff, -9);
  assert.equal(t1.won, 1);
  const undecided = computeStandings(league(['t1', 't2'], 1), { ...football, draw_allowed: false }, [played('u', 't1', 't2', 0, 0)]);
  assert.equal(undecided.table[0].played, 0);
});
