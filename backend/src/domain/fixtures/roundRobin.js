'use strict';
// Round-robin via the circle method (spec 09 §A). Custom implementation; no fixture libraries.
//
// One slot is fixed (index 0) and the others rotate one position per round. For odd n the fixed
// slot is the empty "bye" slot, so a team's bye is the round it sits opposite it. Home/away for a
// non-fixed pair depends on position parity, so each team alternates as it walks the circle; the
// fixed slot's pair alternates by round parity. This keeps |home - away| <= 1 per team per leg.
const { validation } = require('../../lib/errors');
const { isObject, isInt } = require('../../lib/validate');

function parseParams(teams, params) {
  const p = params ?? {};
  if (!isObject(p)) throw validation(['params']);
  const legs = p.legs ?? 1;
  if (legs !== 1 && legs !== 2) throw validation(['params.legs']);
  const policy = p.withdrawal_policy ?? 'forfeit_remaining';
  if (!['void_all', 'forfeit_remaining'].includes(policy)) throw validation(['params.withdrawal_policy']);
  const withdrawals = p.withdrawals ?? [];
  if (!Array.isArray(withdrawals)) throw validation(['params.withdrawals']);
  const n = teams.length;
  const roundCount = legs * (n % 2 === 0 ? n - 1 : n);
  const afterRound = new Map();
  for (const w of withdrawals) {
    if (!isObject(w) || !teams.includes(w.team_id) || afterRound.has(w.team_id)) throw validation(['params.withdrawals']);
    if (!isInt(w.after_round, 0, roundCount)) throw validation(['params.withdrawals']);
    afterRound.set(w.team_id, w.after_round);
  }
  return { legs, policy, afterRound, roundCount };
}

// Rounds of one leg as arrays of [home, away] pairs plus the bye team (or null).
function circleRounds(teams) {
  const odd = teams.length % 2 === 1;
  const fixed = odd ? null : teams[0];
  const rest = odd ? teams.slice() : teams.slice(1);
  const m = rest.length + 1;
  const rounds = [];
  for (let r = 0; r < m - 1; r++) {
    const pos = [fixed];
    for (let p = 1; p < m; p++) pos.push(rest[(((p - 1 - r) % (m - 1)) + (m - 1)) % (m - 1)]);
    const pairs = [];
    let bye = null;
    for (let i = 0; i < m / 2; i++) {
      const a = pos[i];
      const b = pos[m - 1 - i];
      if (a === null) { bye = b; continue; }
      if (i === 0) pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
      else pairs.push(i % 2 === 1 ? [a, b] : [b, a]);
    }
    rounds.push({ pairs, bye });
  }
  return rounds;
}

function fixtureStatus(home, away, round, policy, afterRound) {
  const affected = (t) => afterRound.has(t) && (policy === 'void_all' || round > afterRound.get(t));
  const h = affected(home);
  const a = affected(away);
  if (h && a) return { status: 'voided', awarded_to: null };
  if (h || a) {
    if (policy === 'void_all') return { status: 'voided', awarded_to: null };
    return { status: 'forfeit', awarded_to: h ? away : home };
  }
  return { status: 'scheduled', awarded_to: null };
}

function roundRobin(teams, params) {
  const { legs, policy, afterRound, roundCount } = parseParams(teams, params);
  const leg = circleRounds(teams);
  const rounds = [];
  const summary = { total: 0, scheduled: 0, forfeit: 0, voided: 0 };
  for (let l = 1; l <= legs; l++) {
    leg.forEach((lr, idx) => {
      const round = (l - 1) * leg.length + idx + 1;
      const matches = lr.pairs.map(([h, a], i) => {
        const [home, away] = l === 1 ? [h, a] : [a, h];
        const st = fixtureStatus(home, away, round, policy, afterRound);
        summary.total++;
        summary[st.status]++;
        return { match_id: `RR-L${l}-R${round}-M${i + 1}`, leg: l, home, away, status: st.status, awarded_to: st.awarded_to };
      });
      rounds.push({ round, matches, byes: lr.bye === null ? [] : [lr.bye] });
    });
  }
  return { format: 'round_robin', legs, team_count: teams.length, round_count: roundCount, rounds, summary };
}

module.exports = { roundRobin, circleRounds };
