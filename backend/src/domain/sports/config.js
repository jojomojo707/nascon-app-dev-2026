'use strict';
// Sport configuration validation (spec 08). Sports are pure data; the scoring_model value selects
// which per-model rules apply. No sport or event name is ever referenced here.
const { validation } = require('../../lib/errors');
const { isObject, isInt, isBool, isString } = require('../../lib/validate');

const SPORT_ID_RE = /^[a-z0-9_-]{2,40}$/;
const EVENT_KEY_RE = /^[a-z0-9_]{1,40}$/;
const MODELS = ['event', 'innings', 'round'];
const OVERTIME_POLICIES = ['none', 'extra_time', 'shootout', 'golden_score', 'super_over'];
const TIE_BREAK_TOKENS = ['h2h_points', 'h2h_diff', 'overall_diff', 'scored', 'fair_play', 'draw_lots'];

// Per-model shape of `periods` and of each scoring event value.
const MODEL_RULES = {
  event: {
    periods: { count: 1, duration_minutes: 1 },
    event: (v) => isObject(v) && isInt(v.points, 1),
  },
  innings: {
    periods: { innings_per_team: 1, overs_per_innings: 1, balls_per_over: 1, wickets_per_innings: 1 },
    event: (v) => isObject(v) && isInt(v.runs, 0) && isBool(v.legal_ball) && isBool(v.wicket),
  },
  round: {
    periods: { best_of: 1 },
    event: (v) => isObject(v) && isInt(v.rounds, 1),
  },
};

function validTieBreakOrder(v) {
  return Array.isArray(v) && v.every((t) => TIE_BREAK_TOKENS.includes(t)) && new Set(v).size === v.length;
}

// Final tie-break order with draw_lots always applied last.
function effectiveTieBreak(order) {
  const list = (order || TIE_BREAK_TOKENS).filter((t) => t !== 'draw_lots');
  return [...list, 'draw_lots'];
}

// Returns the normalised config to store, or throws VALIDATION_ERROR listing every bad field.
function validateSportConfig(body) {
  if (!isObject(body)) throw validation(['body']);
  const f = [];
  if (typeof body.sport_id !== 'string' || !SPORT_ID_RE.test(body.sport_id)) f.push('sport_id');
  if (!isString(body.name, 1, 80)) f.push('name');
  const model = MODELS.includes(body.scoring_model) ? body.scoring_model : null;
  if (!model) f.push('scoring_model');

  if (!isObject(body.periods)) f.push('periods');
  else if (model) {
    for (const [k, min] of Object.entries(MODEL_RULES[model].periods)) {
      if (!isInt(body.periods[k], min)) f.push('periods.' + k);
    }
    if (model === 'round' && isInt(body.periods.best_of, 1) && body.periods.best_of % 2 === 0) f.push('periods.best_of');
  }

  if (!isObject(body.scoring_events) || Object.keys(body.scoring_events).length === 0) f.push('scoring_events');
  else {
    for (const [k, v] of Object.entries(body.scoring_events)) {
      if (!EVENT_KEY_RE.test(k) || (model && !MODEL_RULES[model].event(v))) f.push('scoring_events.' + k);
    }
  }

  if (!isBool(body.draw_allowed)) f.push('draw_allowed');
  if (!isObject(body.overtime) || !OVERTIME_POLICIES.includes(body.overtime.policy)) f.push('overtime');
  else if (body.overtime.duration_minutes !== undefined && body.overtime.duration_minutes !== null &&
    !isInt(body.overtime.duration_minutes, 0)) f.push('overtime.duration_minutes');

  if (body.tie_break_order !== undefined && body.tie_break_order !== null && !validTieBreakOrder(body.tie_break_order)) {
    f.push('tie_break_order');
  }

  const r = body.roster;
  if (!isObject(r)) f.push('roster');
  else {
    if (!isInt(r.min_squad_size, 1)) f.push('roster.min_squad_size');
    if (!isInt(r.max_squad_size, 1)) f.push('roster.max_squad_size');
    if (isInt(r.min_squad_size, 1) && isInt(r.max_squad_size, 1) && r.min_squad_size > r.max_squad_size) {
      f.push('roster.min_squad_size', 'roster.max_squad_size');
    }
    if (!isObject(r.required_positions) ||
      !Object.entries(r.required_positions).every(([k, v]) => isString(k, 1, 64) && isInt(v, 0))) {
      f.push('roster.required_positions');
    }
  }
  if (f.length) throw validation(f);

  return {
    sport_id: body.sport_id,
    name: body.name,
    scoring_model: model,
    periods: body.periods,
    scoring_events: body.scoring_events,
    draw_allowed: body.draw_allowed,
    overtime: body.overtime,
    tie_break_order: body.tie_break_order ?? [...TIE_BREAK_TOKENS],
    roster: body.roster,
  };
}

module.exports = { validateSportConfig, validTieBreakOrder, effectiveTieBreak, TIE_BREAK_TOKENS, MODELS };
