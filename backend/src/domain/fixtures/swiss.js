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

// Exact minimum total |score difference| rematch-free perfect matching (branch and bound).
// `list` is sorted by score descending; returns array of [a, b] pairs or null when impossible.
// Works on indices: s[i] = score, ok[i*n+j] = 1 when i and j have not met.
// Lower bound = max of two admissible bounds: (1) the unconstrained optimum on a line pairs sorted
// neighbours; (2) every team pays at least half of its cheapest allowed partner. A team with no
// allowed partner left makes the subset infeasible. A transposition table skips subsets already
// reached at an equal or lower cost.
function minCostPairing(list, score, played, deadline = Date.now() + SEARCH_BUDGET_MS) {
  const n = list.length;
  const s = list.map((t) => score.get(t));
  const ok = new Uint8Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) ok[i * n + j] = i !== j && !played.has(pairKey(list[i], list[j])) ? 1 : 0;

  function lowerBound(rest) {
    let line = 0;
    for (let i = 0; i + 1 < rest.length; i += 2) line += Math.abs(s[rest[i]] - s[rest[i + 1]]);
    let cheapest = 0;
    for (const a of rest) {
      let m = Infinity;
      for (const b of rest) if (ok[a * n + b]) { const d = Math.abs(s[a] - s[b]); if (d < m) m = d; }
      if (m === Infinity) return Infinity;
      cheapest += m;
    }
    return Math.max(line, Math.ceil(cheapest / 2));
  }

  let best = Infinity;
  let bestPairs = null;
  let nodes = 0;
  let outOfTime = false;
  const dead = new Set();
  const reached = new Map();
  const pairs = [];
  function search(rest, cost) {
    if (rest.length === 0) {
      if (cost >= best) return { found: false, pruned: true };
      best = cost;
      bestPairs = pairs.slice();
      return { found: true, pruned: false };
    }
    if ((++nodes & 1023) === 0 && Date.now() > deadline) outOfTime = true;
    if (outOfTime) return { found: false, pruned: true };
    const key = rest.join(',');
    if (dead.has(key)) return { found: false, pruned: false };
    const lb = lowerBound(rest);
    if (lb === Infinity) { dead.add(key); return { found: false, pruned: false }; }
    const seen = reached.get(key);
    if (seen !== undefined && seen <= cost) return { found: false, pruned: true };
    reached.set(key, cost);
    if (cost + lb >= best) return { found: false, pruned: true };
    let found = false;
    let pruned = false;
    const a = rest[0];
    for (let j = 1; j < rest.length; j++) {
      const b = rest[j];
      if (!ok[a * n + b]) continue;
      pairs.push([a, b]);
      const r = search(rest.filter((_, k) => k !== 0 && k !== j), cost + Math.abs(s[a] - s[b]));
      pairs.pop();
      found = found || r.found;
      pruned = pruned || r.pruned;
    }
    if (!found && !pruned) dead.add(key);
    return { found, pruned };
  }
  search(list.map((_, i) => i), 0);
  return bestPairs && bestPairs.map(([a, b]) => [list[a], list[b]]);
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
    // One time budget shared by every bye candidate keeps the request under the 5 s limit.
    const deadline = Date.now() + SEARCH_BUDGET_MS;
    for (const cand of candidates) {
      const list = st.order.filter((t) => t !== cand);
      const found = minCostPairing(list, st.score, st.played, deadline);
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
