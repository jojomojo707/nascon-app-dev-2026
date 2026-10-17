'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSportConfig, effectiveTieBreak } = require('../backend/src/domain/sports/config');
const { SPORTS } = require('../backend/src/domain/seed/baseline');

const kabaddi = () => ({
  sport_id: 'kabaddi', name: 'Kabaddi', scoring_model: 'event',
  periods: { count: 2, duration_minutes: 20 },
  scoring_events: { raid_point: { points: 1 }, tackle_point: { points: 1 }, all_out: { points: 2 } },
  draw_allowed: false, overtime: { policy: 'golden_score', duration_minutes: 5 },
  tie_break_order: ['h2h_points', 'h2h_diff', 'overall_diff', 'scored', 'fair_play', 'draw_lots'],
  roster: { min_squad_size: 7, max_squad_size: 12, required_positions: { raider: 2, defender: 3 } },
});

const fieldsOf = (body) => {
  try { validateSportConfig(body); return null; } catch (e) { assert.equal(e.status, 400); return e.details.fields; }
};

test('mystery sport (event model) is accepted and echoed', () => {
  const c = validateSportConfig(kabaddi());
  assert.equal(c.sport_id, 'kabaddi');
  assert.deepEqual(c.scoring_events.all_out, { points: 2 });
});

test('seeded sports pass the same validator (sports are data)', () => {
  for (const s of SPORTS) assert.equal(validateSportConfig(s).sport_id, s.sport_id);
});

test('innings and round models validate their own fields', () => {
  const inn = { ...kabaddi(), sport_id: 'cric10', scoring_model: 'innings',
    periods: { innings_per_team: 1, overs_per_innings: 10, balls_per_over: 6, wickets_per_innings: 10 },
    scoring_events: { super_six: { runs: 6, legal_ball: true, wicket: false }, out: { runs: 0, legal_ball: true, wicket: true } } };
  assert.equal(validateSportConfig(inn).scoring_model, 'innings');
  const rnd = { ...kabaddi(), sport_id: 'valo', scoring_model: 'round', periods: { best_of: 5 }, scoring_events: { map_win: { rounds: 1 } } };
  assert.equal(validateSportConfig(rnd).scoring_model, 'round');
  assert.deepEqual(fieldsOf({ ...rnd, periods: { best_of: 4 } }), ['periods.best_of']);
  assert.deepEqual(fieldsOf({ ...inn, scoring_events: { x: { runs: -1, legal_ball: true, wicket: false } } }), ['scoring_events.x']);
});

test('SQL-injection sport id and bad fields give VALIDATION_ERROR with field list', () => {
  assert.deepEqual(fieldsOf({ ...kabaddi(), sport_id: "x'; DROP TABLE sports;--" }), ['sport_id']);
  const f = fieldsOf({ ...kabaddi(), name: '', draw_allowed: 'no', overtime: { policy: 'sudden' },
    tie_break_order: ['scored', 'scored'], roster: { min_squad_size: 9, max_squad_size: 3, required_positions: [] } });
  assert.deepEqual(f.sort(), ['draw_allowed', 'name', 'overtime', 'roster.max_squad_size', 'roster.min_squad_size',
    'roster.required_positions', 'tie_break_order'].sort());
  assert.deepEqual(fieldsOf({ ...kabaddi(), scoring_events: {} }), ['scoring_events']);
  assert.deepEqual(fieldsOf({ ...kabaddi(), scoring_events: { 'Bad-Key': { points: 1 } } }), ['scoring_events.Bad-Key']);
  assert.deepEqual(fieldsOf({ ...kabaddi(), scoring_model: 'laps' }), ['scoring_model']);
  assert.deepEqual(fieldsOf('nope'), ['body']);
  assert.deepEqual(fieldsOf({ ...kabaddi(), periods: null }), ['periods']);
  assert.deepEqual(fieldsOf({ ...kabaddi(), overtime: { policy: 'none', duration_minutes: -1 } }), ['overtime.duration_minutes']);
  assert.deepEqual(fieldsOf({ ...kabaddi(), roster: null }), ['roster']);
});

test('tie_break_order defaults to the full list; draw_lots always last', () => {
  const c = validateSportConfig({ ...kabaddi(), tie_break_order: undefined });
  assert.equal(c.tie_break_order.length, 6);
  assert.deepEqual(effectiveTieBreak(['draw_lots', 'scored']), ['scored', 'draw_lots']);
  assert.deepEqual(effectiveTieBreak(undefined).at(-1), 'draw_lots');
});
