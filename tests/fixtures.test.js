'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateFixtures } = require('../backend/src/domain/fixtures');
const { seedOrder } = require('../backend/src/domain/fixtures/bracket');
const { minCostPairing } = require('../backend/src/domain/fixtures/swiss');

const teams = (n) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
const err = (fn) => { try { fn(); } catch (e) { return e; } assert.fail('expected error'); };

test('round robin: structure, pairs and home/away balance for n = 2..40, legs 1 and 2', () => {
  for (let n = 2; n <= 40; n++) {
    for (const legs of [1, 2]) {
      const r = generateFixtures({ format: 'round_robin', teams: teams(n), params: { legs } });
      const perLeg = n % 2 === 0 ? n - 1 : n;
      assert.equal(r.round_count, perLeg * legs);
      assert.equal(r.rounds.length, perLeg * legs);
      const pairCount = new Map();
      const ordered = new Set();
      const balance = new Map();
      for (const rd of r.rounds) {
        assert.equal(rd.matches.length, Math.floor(n / 2));
        assert.equal(rd.byes.length, n % 2);
        const seen = new Set(rd.byes);
        for (const m of rd.matches) {
          assert.ok(!seen.has(m.home) && !seen.has(m.away));
          seen.add(m.home); seen.add(m.away);
          const k = [m.home, m.away].sort().join('|');
          pairCount.set(k, (pairCount.get(k) || 0) + 1);
          ordered.add(m.home + '>' + m.away);
          const bk = m.leg + ':';
          balance.set(bk + m.home, (balance.get(bk + m.home) || 0) + 1);
          balance.set(bk + m.away, (balance.get(bk + m.away) || 0) - 1);
          assert.match(m.match_id, new RegExp(`^RR-L${m.leg}-R${rd.round}-M\\d+$`));
        }
        assert.equal(seen.size, n);
      }
      assert.equal(pairCount.size, n * (n - 1) / 2);
      for (const c of pairCount.values()) assert.equal(c, legs);
      if (legs === 2) assert.equal(ordered.size, n * (n - 1));
      for (const v of balance.values()) assert.ok(Math.abs(v) <= 1, `n=${n} imbalance ${v}`);
      assert.equal(r.summary.total, legs * n * (n - 1) / 2);
    }
  }
});

test('round robin: odd teams give one bye per team per leg', () => {
  const r = generateFixtures({ format: 'round_robin', teams: teams(5) });
  const byes = r.rounds.flatMap((x) => x.byes).sort();
  assert.deepEqual(byes, teams(5));
});

test('round robin withdrawals: forfeit_remaining and void_all', () => {
  const r = generateFixtures({ format: 'round_robin', teams: teams(5),
    params: { withdrawals: [{ team_id: 't3', after_round: 2 }] } });
  for (const rd of r.rounds) {
    for (const m of rd.matches) {
      if (m.home !== 't3' && m.away !== 't3') { assert.equal(m.status, 'scheduled'); continue; }
      if (rd.round <= 2) assert.equal(m.status, 'scheduled');
      else { assert.equal(m.status, 'forfeit'); assert.equal(m.awarded_to, m.home === 't3' ? m.away : m.home); }
    }
  }
  assert.equal(r.summary.total, 10);
  assert.equal(r.summary.forfeit + r.summary.scheduled, 10);
  const v = generateFixtures({ format: 'round_robin', teams: teams(4),
    params: { withdrawal_policy: 'void_all', withdrawals: [{ team_id: 't1', after_round: 1 }] } });
  assert.equal(v.summary.voided, 3);
  const both = generateFixtures({ format: 'round_robin', teams: teams(4),
    params: { withdrawals: [{ team_id: 't1', after_round: 0 }, { team_id: 't2', after_round: 0 }] } });
  const m12 = both.rounds.flatMap((x) => x.matches).find((m) => [m.home, m.away].sort().join() === 't1,t2');
  assert.equal(m12.status, 'voided');
  assert.equal(m12.awarded_to, null);
  assert.equal(err(() => generateFixtures({ format: 'round_robin', teams: teams(4),
    params: { withdrawals: [{ team_id: 'zz', after_round: 1 }] } })).status, 400);
  assert.equal(err(() => generateFixtures({ format: 'round_robin', teams: teams(4),
    params: { withdrawals: [{ team_id: 't1', after_round: 4 }] } })).status, 400);
});

test('fixtures validation: team limits, duplicates, unknown format', () => {
  assert.deepEqual(err(() => generateFixtures({ format: 'round_robin', teams: ['a'] })).details.fields, ['teams']);
  assert.deepEqual(err(() => generateFixtures({ format: 'double_elim', teams: ['a', 'b'] })).details.fields, ['teams']);
  assert.deepEqual(err(() => generateFixtures({ format: 'swiss', teams: ['a', 'a'] })).details.fields, ['teams']);
  assert.deepEqual(err(() => generateFixtures({ format: 'ladder', teams: ['a', 'b'] })).details.fields, ['format']);
  assert.equal(err(() => generateFixtures({ format: 'round_robin', teams: teams(4), params: { legs: 3 } })).status, 400);
  assert.equal(err(() => generateFixtures(null)).status, 400);
});

test('swiss round 1 is exact (odd n: last seed bye)', () => {
  const r = generateFixtures({ format: 'swiss', teams: teams(5), params: { total_rounds: 3 } });
  assert.equal(r.bye, 't5');
  assert.deepEqual(r.pairings, [{ match_id: 'SW-R1-M1', home: 't1', away: 't3' }, { match_id: 'SW-R1-M2', home: 't2', away: 't4' }]);
  const e = generateFixtures({ format: 'swiss', teams: teams(8) });
  assert.equal(e.total_rounds, 3);
  assert.equal(e.bye, null);
  assert.deepEqual(e.pairings.map((p) => [p.home, p.away]), [['t1', 't5'], ['t2', 't6'], ['t3', 't7'], ['t4', 't8']]);
});

test('swiss round 2 from the spec example: standings, bye and no rematches', () => {
  const r = generateFixtures({ format: 'swiss', teams: teams(5), params: { total_rounds: 3, round: 2,
    history: [{ round: 1, bye: 't5', matches: [{ home: 't1', away: 't3', result: 'home' }, { home: 't2', away: 't4', result: 'draw' }] }] } });
  assert.deepEqual(r.standings.slice(0, 3), [
    { rank: 1, team_id: 't1', score: 1, buchholz: 0 },
    { rank: 2, team_id: 't5', score: 1, buchholz: 0 },
    { rank: 3, team_id: 't2', score: 0.5, buchholz: 0.5 }]);
  assert.equal(r.bye, 't3');
  const met = new Set(['t1|t3', 't2|t4']);
  for (const p of r.pairings) assert.ok(!met.has([p.home, p.away].sort().join('|')));
  assert.equal(r.pairings.length, 2);
});

test('swiss: minimum total score difference (greedy would get stuck) and NO_VALID_PAIRING', () => {
  // Scores: a=3,b=3,c=2,d=2 with a-b and c-d already played: optimum is a-c, b-d (cost 2).
  const score = new Map([['a', 6], ['b', 6], ['c', 4], ['d', 4]]);
  const played = new Set(['a\u0000b', 'c\u0000d']);
  const pairs = minCostPairing(['a', 'b', 'c', 'd'], score, played);
  assert.equal(pairs.reduce((s, [x, y]) => s + Math.abs(score.get(x) - score.get(y)), 0), 4);
  // 4 teams after 3 rounds of a full round robin: every pair has met.
  const t = teams(4);
  const hist = [1, 2, 3].map((round, i) => ({ round, bye: null,
    matches: [[['t1', 't2'], ['t3', 't4']], [['t1', 't3'], ['t2', 't4']], [['t1', 't4'], ['t2', 't3']]][i]
      .map(([home, away]) => ({ home, away, result: 'home' })) }));
  const r3 = generateFixtures({ format: 'swiss', teams: t, params: { total_rounds: 3, round: 3, history: hist.slice(0, 2) } });
  assert.deepEqual(r3.pairings.map((p) => [p.home, p.away].sort().join()).sort(), ['t1,t4', 't2,t3']);
  const big = teams(6);
  const h6 = [
    { round: 1, bye: null, matches: [{ home: 't1', away: 't2', result: 'home' }, { home: 't3', away: 't4', result: 'home' }, { home: 't5', away: 't6', result: 'home' }] },
    { round: 2, bye: null, matches: [{ home: 't1', away: 't3', result: 'home' }, { home: 't2', away: 't5', result: 'home' }, { home: 't4', away: 't6', result: 'home' }] },
    { round: 3, bye: null, matches: [{ home: 't1', away: 't4', result: 'home' }, { home: 't2', away: 't6', result: 'home' }, { home: 't3', away: 't5', result: 'home' }] },
    { round: 4, bye: null, matches: [{ home: 't1', away: 't5', result: 'home' }, { home: 't2', away: 't4', result: 'home' }, { home: 't3', away: 't6', result: 'home' }] },
  ];
  const ok = generateFixtures({ format: 'swiss', teams: big, params: { total_rounds: 5, round: 5, history: h6 } });
  assert.equal(ok.pairings.length, 3);
  // Make round 5 impossible: t1 must meet t6, so pre-play t1-t6 in round 4 instead.
  const bad = structuredClone(h6);
  bad[3].matches = [{ home: 't1', away: 't6', result: 'home' }, { home: 't2', away: 't4', result: 'home' }, { home: 't3', away: 't5', result: 'draw' }];
  bad[2].matches = [{ home: 't1', away: 't4', result: 'home' }, { home: 't2', away: 't6', result: 'home' }, { home: 't3', away: 't5', result: 'home' }];
  const e2 = err(() => generateFixtures({ format: 'swiss', teams: big, params: { total_rounds: 5, round: 5, history: bad } }));
  assert.equal(e2.status, 409);
  assert.equal(e2.code, 'NO_VALID_PAIRING');
  assert.deepEqual(e2.details, { round: 5 });
  assert.equal(err(() => generateFixtures({ format: 'swiss', teams: t, params: { round: 2, history: [] } })).status, 400);
});

test('single elim: seed order, byes propagated, results, third place', () => {
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  const r = generateFixtures({ format: 'single_elim', teams: teams(6), params: { results: [{ match_id: 'R1M2', winner: 't4' }] } });
  assert.equal(r.bracket_size, 8);
  assert.equal(r.rounds.length, 3);
  const [m1, m2, m3, m4] = r.rounds[0].matches;
  assert.deepEqual([m1.home, m1.away, m1.bye, m1.winner], ['t1', null, true, 't1']);
  assert.deepEqual([m2.home, m2.away, m2.home_seed, m2.away_seed, m2.winner, m2.loser], ['t4', 't5', 4, 5, 't4', 't5']);
  assert.deepEqual(m2.winner_to, { match_id: 'R2M1', slot: 'away' });
  assert.equal(m3.winner, 't2');
  assert.equal(m4.bye, false);
  const r2 = r.rounds[1].matches[0];
  assert.deepEqual([r2.home, r2.away], ['t1', 't4']);
  assert.equal(r.rounds[2].matches[0].winner_to, null);
  const tp = generateFixtures({ format: 'single_elim', teams: teams(4), params: { third_place_match: true,
    results: [{ match_id: 'R1M1', winner: 't4' }, { match_id: 'R1M2', winner: 't2' }] } });
  const tpm = tp.rounds[1].matches.find((m) => m.match_id === 'TP');
  assert.deepEqual([tpm.bracket, tpm.home, tpm.away], ['third_place', 't1', 't3']);
  assert.equal(err(() => generateFixtures({ format: 'single_elim', teams: teams(4), params: { results: [{ match_id: 'R9M1', winner: 't1' }] } })).status, 400);
  assert.equal(err(() => generateFixtures({ format: 'single_elim', teams: teams(4), params: { results: [{ match_id: 'R1M1', winner: 't2' }] } })).status, 400);
});

test('double elim: id/count formulas, routing graph and conditional GF2', () => {
  for (const n of [3, 5, 6, 8, 13, 16, 33]) {
    const r = generateFixtures({ format: 'double_elim', teams: teams(n), params: { bracket_reset: true } });
    const B = r.bracket_size;
    const k = Math.log2(B);
    assert.equal(r.winners.length, k);
    r.winners.forEach((rd, i) => assert.equal(rd.matches.length, B / 2 ** (i + 1)));
    assert.equal(r.losers.length, 2 * (k - 1));
    assert.equal(r.losers.flatMap((x) => x.matches).length, B - 2);
    const all = [...r.winners, ...r.losers].flatMap((x) => x.matches).concat(r.grand_final);
    const fed = new Map();
    for (const m of all) {
      for (const to of [m.winner_to, m.loser_to]) if (to) {
        const key = to.match_id + '.' + to.slot;
        fed.set(key, (fed.get(key) || 0) + 1);
      }
      if (m.bracket === 'winners') assert.ok(m.loser_to);
      if (m.bracket === 'losers') assert.equal(m.loser_to, null);
    }
    for (const m of all) {
      if (m.match_id.startsWith('WR1M')) continue;
      assert.equal(fed.get(m.match_id + '.home'), 1, m.match_id);
      assert.equal(fed.get(m.match_id + '.away'), 1, m.match_id);
    }
    const wf = r.winners[k - 1].matches[0];
    assert.deepEqual(wf.winner_to, { match_id: 'GF1', slot: 'home' });
    assert.deepEqual(wf.loser_to, { match_id: r.losers.at(-1).matches[0].match_id, slot: 'away' });
    assert.deepEqual(r.losers.at(-1).matches[0].winner_to, { match_id: 'GF1', slot: 'away' });
    assert.equal(r.grand_final[1].conditional, true);
    assert.equal(r.grand_final[1].required, null);
  }
  const noReset = generateFixtures({ format: 'double_elim', teams: teams(4), params: { bracket_reset: false } });
  assert.equal(noReset.grand_final.length, 1);
  assert.equal(noReset.grand_final[0].winner_to, null);
});

test('double elim: full 4-team run, bracket reset required only when the LB champion wins GF1', () => {
  const base = [
    { match_id: 'WR1M1', winner: 't1' }, { match_id: 'WR1M2', winner: 't2' },
    { match_id: 'WR2M1', winner: 't1' }, { match_id: 'LR1M1', winner: 't3' }, { match_id: 'LR2M1', winner: 't3' },
  ];
  const lbWins = generateFixtures({ format: 'double_elim', teams: teams(4),
    params: { bracket_reset: true, results: [...base, { match_id: 'GF1', winner: 't3' }] } });
  const [g1, g2] = lbWins.grand_final;
  assert.deepEqual([g1.home, g1.away], ['t1', 't3']);
  assert.equal(g2.required, true);
  assert.deepEqual([g2.home, g2.away].sort(), ['t1', 't3']);
  const wbWins = generateFixtures({ format: 'double_elim', teams: teams(4),
    params: { bracket_reset: true, results: [...base, { match_id: 'GF1', winner: 't1' }] } });
  assert.equal(wbWins.grand_final[1].required, false);
  const byes = generateFixtures({ format: 'double_elim', teams: teams(3), params: {} });
  assert.equal(byes.winners[0].matches[0].bye, true);
  assert.equal(byes.bracket_reset, false);
});
