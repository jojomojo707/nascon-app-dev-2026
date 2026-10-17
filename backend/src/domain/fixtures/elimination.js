'use strict';
// Single elimination (spec 10 §C) and double elimination (spec 10 §D).
const { validation } = require('../../lib/errors');
const { isObject, isBool } = require('../../lib/validate');
const B = require('./bracket');

function boolParam(p, key) {
  const v = p[key] ?? false;
  if (!isBool(v)) throw validation(['params.' + key]);
  return v;
}

function singleElim(teams, params) {
  const p = params ?? {};
  if (!isObject(p)) throw validation(['params']);
  const thirdPlace = boolParam(p, 'third_place_match');
  const results = B.parseResults(p);
  const size = B.nextPow2(teams.length);
  const roundsCount = Math.log2(size);

  const rounds = [B.firstRound(size, 'R', 'main')];
  for (let r = 2; r <= roundsCount; r++) {
    const ms = [];
    for (let i = 1; i <= size / 2 ** r; i++) ms.push(B.newMatch(`R${r}M${i}`, 'main', r, i));
    rounds.push(ms);
  }
  for (let r = 0; r < rounds.length - 1; r++) {
    rounds[r].forEach((m, k) => B.link(m, 'winner', rounds[r + 1][Math.floor(k / 2)], k % 2 === 0 ? 'home' : 'away'));
  }
  const all = rounds.flat();
  if (thirdPlace && roundsCount >= 2) {
    const semis = rounds[roundsCount - 2];
    const tp = B.newMatch('TP', 'third_place', roundsCount, 1);
    B.link(semis[0], 'loser', tp, 'home');
    B.link(semis[1], 'loser', tp, 'away');
    rounds[roundsCount - 1].push(tp);
    all.push(tp);
  }
  B.resolve(all, teams, results);
  return {
    format: 'single_elim', bracket_size: size,
    rounds: rounds.map((ms, i) => ({ round: i + 1, matches: ms.map(B.publicMatch) })),
  };
}

function doubleElim(teams, params) {
  const p = params ?? {};
  if (!isObject(p)) throw validation(['params']);
  const bracketReset = boolParam(p, 'bracket_reset');
  const results = B.parseResults(p);
  const size = B.nextPow2(teams.length);
  const k = Math.log2(size);

  // Winners bracket: WR{r}M{i}, B / 2^r matches per round.
  const wr = [B.firstRound(size, 'WR', 'winners')];
  for (let r = 2; r <= k; r++) {
    const ms = [];
    for (let i = 1; i <= size / 2 ** r; i++) ms.push(B.newMatch(`WR${r}M${i}`, 'winners', r, i));
    wr.push(ms);
  }
  for (let r = 0; r < k - 1; r++) {
    wr[r].forEach((m, j) => B.link(m, 'winner', wr[r + 1][Math.floor(j / 2)], j % 2 === 0 ? 'home' : 'away'));
  }

  // Losers bracket: rounds 2j-1 and 2j each have B / 2^(j+1) matches (j = 1..k-1); total B - 2.
  const lr = [];
  for (let j = 1; j <= k - 1; j++) {
    for (const r of [2 * j - 1, 2 * j]) {
      const ms = [];
      for (let i = 1; i <= size / 2 ** (j + 1); i++) ms.push(B.newMatch(`LR${r}M${i}`, 'losers', r, i));
      lr.push(ms);
    }
  }
  // WR1 losers meet each other in LR1.
  wr[0].forEach((m, j) => B.link(m, 'loser', lr[0][Math.floor(j / 2)], j % 2 === 0 ? 'home' : 'away'));
  for (let j = 1; j <= k - 1; j++) {
    const odd = lr[2 * j - 2];
    const even = lr[2 * j - 1];
    // LR(2j-1) winner -> LR(2j) home; WR(j+1) loser drops into LR(2j) away.
    odd.forEach((m, i) => B.link(m, 'winner', even[i], 'home'));
    wr[j].forEach((m, i) => B.link(m, 'loser', even[i], 'away'));
    // LR(2j) winners pair up in LR(2j+1).
    if (j < k - 1) even.forEach((m, i) => B.link(m, 'winner', lr[2 * j][Math.floor(i / 2)], i % 2 === 0 ? 'home' : 'away'));
  }

  const gf1 = B.newMatch('GF1', 'grand_final', 1, 1);
  B.link(wr[k - 1][0], 'winner', gf1, 'home');
  B.link(lr[lr.length - 1][0], 'winner', gf1, 'away');
  const grandFinal = [gf1];
  let gf2 = null;
  if (bracketReset) {
    gf2 = B.newMatch('GF2', 'grand_final', 2, 1);
    B.link(gf1, 'winner', gf2, 'home');
    B.link(gf1, 'loser', gf2, 'away');
    grandFinal.push(gf2);
  }

  B.resolve([...wr.flat(), ...lr.flat(), ...grandFinal], teams, results);

  gf1.conditional = false;
  gf1.required = true;
  if (gf2) {
    gf2.conditional = true;
    if (gf1.winner) {
      gf2.required = gf1.winner === gf1.away;
    } else {
      gf2.required = null;
      // Until GF1 is played, GF2 shows the same two teams as GF1.
      gf2.home = gf1.home; gf2.away = gf1.away; gf2.home_seed = gf1.home_seed; gf2.away_seed = gf1.away_seed;
    }
  }

  const toRounds = (arr) => arr.map((ms, i) => ({ round: i + 1, matches: ms.map(B.publicMatch) }));
  return {
    format: 'double_elim', bracket_size: size, bracket_reset: bracketReset,
    winners: toRounds(wr), losers: toRounds(lr), grand_final: grandFinal.map(B.publicMatch),
  };
}

module.exports = { singleElim, doubleElim };
