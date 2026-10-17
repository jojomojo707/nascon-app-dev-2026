'use strict';
// Shared bracket engine for single and double elimination (spec 10).
// Each match slot has a source: a seed, or the winner/loser of another match. A fixpoint loop fills
// slots, auto-advances byes (a slot whose source can never produce a team is EMPTY), and applies
// the caller's results once both participants are known.
const { validation } = require('../../lib/errors');
const { isObject } = require('../../lib/validate');

const EMPTY = Symbol('empty');

// order(2) = [1,2]; order(2k) = for s in order(k): [s, 2k+1-s]  (spec 10, exact)
function seedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const k2 = order.length * 2;
    order = order.flatMap((s) => [s, k2 + 1 - s]);
  }
  return size === 1 ? [1] : order;
}

const nextPow2 = (n) => { let b = 1; while (b < n) b *= 2; return b; };

function newMatch(matchId, bracket, round, index) {
  return {
    match_id: matchId, bracket, round, index, home: null, away: null, home_seed: null, away_seed: null,
    bye: false, winner: null, loser: null, winner_to: null, loser_to: null,
    _src: { home: null, away: null }, _state: { home: null, away: null }, _dead: false,
  };
}

// Connects `from`'s winner or loser to slot `slot` of `to`.
function link(from, kind, to, slot) {
  from[kind === 'winner' ? 'winner_to' : 'loser_to'] = { match_id: to.match_id, slot };
  to._src[slot] = { kind, match_id: from.match_id };
}

function parseResults(params) {
  const results = params.results ?? [];
  if (!Array.isArray(results)) throw validation(['params.results']);
  for (const r of results) {
    if (!isObject(r) || typeof r.match_id !== 'string' || typeof r.winner !== 'string') throw validation(['params.results']);
  }
  return results;
}

// Runs the fixpoint over all matches (array in a stable order) with the given results.
function resolve(matches, teams, results) {
  const byId = new Map(matches.map((m) => [m.match_id, m]));
  const seedOf = new Map(teams.map((t, i) => [t, i + 1]));
  const pending = new Map();
  for (const r of results) {
    if (!byId.has(r.match_id)) throw validation(['params.results'], `Unknown match ${r.match_id}.`);
    pending.set(r.match_id, r.winner);
  }

  const slotValue = (src) => {
    if (src.kind === 'seed') return src.seed <= teams.length ? teams[src.seed - 1] : EMPTY;
    const m = byId.get(src.match_id);
    if (src.kind === 'winner') return m.winner ? m.winner : m._dead ? EMPTY : null;
    return m.loser ? m.loser : (m.bye || m._dead) ? EMPTY : null;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const m of matches) {
      if (m.winner || m._dead) continue;
      for (const slot of ['home', 'away']) {
        if (m._state[slot] === null && m._src[slot]) {
          const v = slotValue(m._src[slot]);
          if (v !== null) { m._state[slot] = v; changed = true; }
        }
      }
      const h = m._state.home;
      const a = m._state.away;
      if (h === EMPTY && a === EMPTY) { m._dead = true; changed = true; continue; }
      if ((h === EMPTY && typeof a === 'string') || (a === EMPTY && typeof h === 'string')) {
        m.bye = true;
        m.winner = typeof h === 'string' ? h : a;
        changed = true;
        continue;
      }
      if (typeof h === 'string' && typeof a === 'string' && pending.has(m.match_id)) {
        const w = pending.get(m.match_id);
        if (w !== h && w !== a) throw validation(['params.results'], `${w} is not a participant of ${m.match_id}.`);
        m.winner = w;
        m.loser = w === h ? a : h;
        pending.delete(m.match_id);
        changed = true;
      }
    }
  }
  for (const [id, w] of pending) {
    const m = byId.get(id);
    if (m.winner !== w) throw validation(['params.results'], `${w} is not a participant of ${id}.`);
  }

  for (const m of matches) {
    m.home = typeof m._state.home === 'string' ? m._state.home : null;
    m.away = typeof m._state.away === 'string' ? m._state.away : null;
    m.home_seed = m.home ? seedOf.get(m.home) : null;
    m.away_seed = m.away ? seedOf.get(m.away) : null;
  }
}

// Strips internal fields for the response.
function publicMatch(m) {
  const out = {};
  for (const [k, v] of Object.entries(m)) if (!k.startsWith('_')) out[k] = v;
  return out;
}

// Builds the first-round seeded matches (shared by single elim and the winners bracket).
function firstRound(size, idPrefix, bracket) {
  const order = seedOrder(size);
  const ms = [];
  for (let i = 1; i <= size / 2; i++) {
    const m = newMatch(`${idPrefix}1M${i}`, bracket, 1, i);
    const s1 = order[2 * i - 2];
    const s2 = order[2 * i - 1];
    m._src.home = { kind: 'seed', seed: Math.min(s1, s2) };
    m._src.away = { kind: 'seed', seed: Math.max(s1, s2) };
    ms.push(m);
  }
  return ms;
}

module.exports = { EMPTY, seedOrder, nextPow2, newMatch, link, resolve, publicMatch, firstRound, parseResults };
