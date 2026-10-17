'use strict';
// Swiss-system pairing for one round (spec 09 §B). Scores are kept in integer half-points
// (win 2, draw 1, loss 0, bye 2) so comparisons are exact; they are divided by 2 on output.
const { validation, conflict } = require('../../lib/errors');
const { isObject, isInt } = require('../../lib/validate');

const SEARCH_BUDGET_MS = 3000;

function parseParams(teams, params) {
  const p = params ?? {};
  if (!isObject(p)) throw validation(['params']);
  const n = teams.length;
  const totalRounds = p.total_rounds ?? Math.ceil(Math.log2(n));
  if (!isInt(totalRounds, 1, n - 1)) throw validation(['params.total_rounds']);
  const round = p.round ?? 1;
  if (!isInt(round, 1, totalRounds)) throw validation(['params.round']);
  const history = p.history ?? [];
  if (!Array.isArray(history) || history.length !== round - 1) throw validation(['params.history']);
  const seen = new Set();
  for (const h of history) {
    if (!isObject(h) || !isInt(h.round, 1, round - 1) || seen.has(h.round)) throw validation(['params.history']);
    seen.add(h.round);
    if (h.bye !== undefined && h.bye !== null && !teams.includes(h.bye)) throw validation(['params.history']);
    if (!Array.isArray(h.matches)) throw validation(['params.history']);
    for (const m of h.matches) {
      if (!isObject(m) || !teams.includes(m.home) || !teams.includes(m.away) || m.home === m.away ||
        !['home', 'away', 'draw'].includes(m.result)) throw validation(['params.history']);
    }
  }
  return { totalRounds, round, history };
}

// Scores, opponents, byes and Buchholz from history; standings sorted score, buchholz, seed.
function computeStandings(teams, history) {
  const idx = new Map(teams.map((t, i) => [t, i]));
  const score = new Map(teams.map((t) => [t, 0]));
  const opponents = new Map(teams.map((t) => [t, []]));
  const hadBye = new Set();
  const played = new Set();
  for (const h of history) {
    if (h.bye) { hadBye.add(h.bye); score.set(h.bye, score.get(h.bye) + 2); }
    for (const m of h.matches) {
      opponents.get(m.home).push(m.away);
      opponents.get(m.away).push(m.home);
      played.add(pairKey(m.home, m.away));
      const [hs, as] = m.result === 'home' ? [2, 0] : m.result === 'away' ? [0, 2] : [1, 1];
      score.set(m.home, score.get(m.home) + hs);
      score.set(m.away, score.get(m.away) + as);
    }
  }
  const buchholz = new Map(teams.map((t) => [t, opponents.get(t).reduce((s, o) => s + score.get(o), 0)]));
  const order = teams.slice().sort((a, b) =>
    score.get(b) - score.get(a) || buchholz.get(b) - buchholz.get(a) || idx.get(a) - idx.get(b));
  return { idx, score, buchholz, hadBye, played, order };
}

const pairKey = (a, b) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

// Lower bound: optimal unconstrained matching of values sorted on a line pairs neighbours.
function lowerBound(list, score) {
  let s = 0;
  for (let i = 0; i + 1 < list.length; i += 2) s += Math.abs(score.get(list[i]) - score.get(list[i + 1]));
  return s;
}

// Exact minimum total |score difference| rematch-free perfect matching (branch and bound).
// `list` is sorted by score descending; returns array of [a, b] pairs or null when impossible.
function minCostPairing(list, score, played, deadline = Date.now() + SEARCH_BUDGET_MS) {
  let best = Infinity;
  let bestPairs = null;
  const dead = new Set();
  const pairs = [];
  function search(rest, cost) {
    if (rest.length === 0) {
      if (cost >= best) return { found: false, pruned: true };
      best = cost;
      bestPairs = pairs.slice();
      return { found: true, pruned: false };
    }
    const key = rest.join('\u0001');
    if (dead.has(key)) return { found: false, pruned: false };
    if (cost + lowerBound(rest, score) >= best || Date.now() > deadline) return { found: false, pruned: true };
    let found = false;
    let pruned = false;
    const a = rest[0];
    for (let j = 1; j < rest.length; j++) {
      const b = rest[j];
      if (played.has(pairKey(a, b))) continue;
      pairs.push([a, b]);
      const r = search(rest.filter((_, k) => k !== 0 && k !== j), cost + Math.abs(score.get(a) - score.get(b)));
      pairs.pop();
      found = found || r.found;
      pruned = pruned || r.pruned;
    }
    if (!found && !pruned) dead.add(key);
    return { found, pruned };
  }
  search(list, 0);
  return bestPairs;
}

function swiss(teams, params) {
  const { totalRounds, round, history } = parseParams(teams, params);
  const n = teams.length;
  const st = computeStandings(teams, history);
  let pairs;
  let bye = null;

  if (round === 1) {
    const m = Math.floor(n / 2);
    if (n % 2 === 1) bye = teams[n - 1];
    pairs = [];
    for (let i = 0; i < m; i++) pairs.push([teams[i], teams[i + m]]);
  } else {
    let candidates = [null];
    if (n % 2 === 1) {
      const noBye = teams.filter((t) => !st.hadBye.has(t));
      const pool = noBye.length ? noBye : teams.slice();
      candidates = pool.sort((a, b) => st.score.get(a) - st.score.get(b) || st.idx.get(b) - st.idx.get(a));
    }
    for (const cand of candidates) {
      const list = st.order.filter((t) => t !== cand);
      const found = minCostPairing(list, st.score, st.played);
      if (found) { pairs = found; bye = cand; break; }
    }
    if (!pairs) throw conflict('NO_VALID_PAIRING', `No rematch-free pairing exists for round ${round}.`, { round });
  }

  return {
    format: 'swiss', round, total_rounds: totalRounds,
    pairings: pairs.map(([home, away], i) => ({ match_id: `SW-R${round}-M${i + 1}`, home, away })),
    bye,
    standings: st.order.map((t, i) => ({
      rank: i + 1, team_id: t, score: st.score.get(t) / 2, buchholz: st.buchholz.get(t) / 2,
    })),
  };
}

module.exports = { swiss, minCostPairing, computeStandings };
