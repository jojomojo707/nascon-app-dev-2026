'use strict';
// Standings engine (spec 12). Recomputed from scratch from the match event logs on every call.
const { project } = require('../scoring/engine');
const { lotsKey } = require('../../lib/signature');
const { effectiveTieBreak } = require('../sports/config');

const round3 = (x) => { const r = Math.round(x * 1000) / 1000; return Object.is(r, -0) ? 0 : r; };

// One completed, decided match reduced to the numbers standings need.
function matchResult(sport, fx, events) {
  const p = project(sport, fx, events);
  if (p.status !== 'completed' || p.outcome === 'undecided') return null;
  const per = sport.periods;
  const oversFaced = (side) => {
    if (sport.scoring_model !== 'innings') return 0;
    if (side.wickets >= per.innings_per_team * per.wickets_per_innings) return per.innings_per_team * per.overs_per_innings;
    return side.balls / per.balls_per_over;
  };
  const sides = [p.home, p.away];
  return {
    home: fx.home, away: fx.away, winner: p.winner,
    stats: Object.fromEntries(sides.map((s, i) => {
      const o = sides[1 - i];
      return [s.team_id, { scored: s.score, conceded: o.score, oversFaced: oversFaced(s), oversBowled: oversFaced(o), fairPlay: s.fair_play }];
    })),
  };
}

function pointsFor(result, team, pts) {
  if (!result.winner) return pts.draw;
  return result.winner === team ? pts.win : pts.loss;
}

// Differential over a list of results for one team: goal/point/map diff, or net run rate (innings).
function differential(sport, team, results) {
  let scored = 0; let conceded = 0; let of = 0; let ob = 0;
  for (const r of results) {
    const s = r.stats[team];
    scored += s.scored; conceded += s.conceded; of += s.oversFaced; ob += s.oversBowled;
  }
  if (sport.scoring_model !== 'innings') return scored - conceded;
  return round3((of ? scored / of : 0) - (ob ? conceded / ob : 0));
}

function computeStandings(league, sport, fixtures) {
  const pts = league.points;
  const results = [];
  const remaining = new Map(league.teams.map((t) => [t, 0]));
  for (const fx of fixtures) {
    const r = matchResult(sport, fx, fx.events);
    if (r) results.push(r);
    else { remaining.set(fx.home, remaining.get(fx.home) + 1); remaining.set(fx.away, remaining.get(fx.away) + 1); }
  }

  const rows = new Map(league.teams.map((t) => [t, {
    team_id: t, played: 0, won: 0, drawn: 0, lost: 0, scored: 0, conceded: 0, diff: 0, points: 0, fair_play: 0,
  }]));
  const teamResults = new Map(league.teams.map((t) => [t, []]));
  const h2h = {};
  for (const a of league.teams) {
    h2h[a] = {};
    for (const b of league.teams) if (a !== b) h2h[a][b] = { played: 0, points: 0, scored: 0, conceded: 0 };
  }
  for (const r of results) {
    for (const t of [r.home, r.away]) {
      const row = rows.get(t);
      if (!row) continue;
      const s = r.stats[t];
      const opp = t === r.home ? r.away : r.home;
      row.played++;
      if (!r.winner) row.drawn++; else if (r.winner === t) row.won++; else row.lost++;
      row.scored += s.scored; row.conceded += s.conceded; row.fair_play += s.fairPlay;
      row.points += pointsFor(r, t, pts);
      teamResults.get(t).push(r);
      if (h2h[t] && h2h[t][opp]) {
        const h = h2h[t][opp];
        h.played++; h.points += pointsFor(r, t, pts); h.scored += s.scored; h.conceded += s.conceded;
      }
    }
  }
  for (const [t, row] of rows) row.diff = differential(sport, t, teamResults.get(t));

  const criteria = effectiveTieBreak(league.tie_break_order);
  const value = (c, team, group) => {
    const among = () => teamResults.get(team).filter((r) => group.includes(r.home) && group.includes(r.away));
    switch (c) {
      case 'h2h_points': return among().reduce((s, r) => s + pointsFor(r, team, pts), 0);
      case 'h2h_diff': return differential(sport, team, among());
      case 'overall_diff': return rows.get(team).diff;
      case 'scored': return rows.get(team).scored;
      case 'fair_play': return rows.get(team).fair_play;
      default: return lotsKey(league.lots_seed, league.league_id, team);
    }
  };

  // resolve(group): split by the first criterion that differs, recurse on each sub-group from the first criterion.
  function resolve(group) {
    if (group.length === 1) return [{ team: group[0], by: null }];
    for (const c of criteria) {
      const vals = new Map(group.map((t) => [t, value(c, t, group)]));
      const distinct = [...new Set(vals.values())];
      if (distinct.length === 1) continue;
      distinct.sort((x, y) => (c === 'draw_lots' ? (x < y ? -1 : 1) : y - x));
      const out = [];
      distinct.forEach((v, k) => {
        const sub = resolve(group.filter((t) => vals.get(t) === v));
        if (k < distinct.length - 1) sub[sub.length - 1].by = c;
        out.push(...sub);
      });
      return out;
    }
    return group.map((t) => ({ team: t, by: null }));
  }

  const byPoints = [...new Set(league.teams.map((t) => rows.get(t).points))].sort((a, b) => b - a);
  const ordered = byPoints.flatMap((p) => resolve(league.teams.filter((t) => rows.get(t).points === p)));

  const k = league.qualification.spots;
  const maxPts = (t) => rows.get(t).points + pts.win * remaining.get(t);
  const table = ordered.map(({ team, by }, i) => {
    const row = rows.get(team);
    const others = league.teams.filter((x) => x !== team);
    let status = 'still_possible';
    if (others.filter((x) => maxPts(x) >= row.points).length < k) status = 'clinched';
    else if (others.filter((x) => rows.get(x).points > maxPts(team)).length >= k) status = 'eliminated';
    return { rank: i + 1, ...row, status, resolved_by: by };
  });

  return { league_id: league.league_id, sport_id: league.sport_id, qualification_spots: k, table, h2h };
}

module.exports = { computeStandings, matchResult, round3 };
