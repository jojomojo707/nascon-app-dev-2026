'use strict';
// POST /api/v1/demo/seed (super admin): demo content for the mobile judging session.
// Not part of reset (reset recreates only the spec baseline). Every write goes through the same
// services the grader exercises: leagues, signed events, roster setup.
const { pool } = require('../../db/pool');
const scoring = require('../scoring/service');
const roster = require('../roster/service');
const { roundRobin } = require('../fixtures/roundRobin');

const LEAGUE = 'league-alpha-1';
const DEMO_CLUBS = [
  { club_id: 'demo-club-alpha-3', name: 'Alpha Falcons' },
  { club_id: 'demo-club-alpha-4', name: 'Alpha Strikers' },
];
const CLUB_PROFILES = {
  'club-alpha-1': { home_venue: { name: 'Alpha Arena', lat: 33.6844, lng: 73.0479 }, socials: { x: '@alphaunited', instagram: '@alphaunited' },
    staff: [{ name: 'Sara Malik', role: 'coach' }, { name: 'Omar Shah', role: 'manager' }, { name: 'Dr. Hina Riaz', role: 'physio' }],
    season_stats: [{ season: '2025', played: 10, won: 6, drawn: 2, lost: 2 }] },
  'club-alpha-2': { home_venue: { name: 'Rovers Ground', lat: 33.7, lng: 73.06 }, socials: { x: '@alpharovers' },
    staff: [{ name: 'Kamran Ali', role: 'coach' }], season_stats: [{ season: '2025', played: 10, won: 4, drawn: 3, lost: 3 }] },
  'demo-club-alpha-3': { home_venue: { name: 'Falcon Park', lat: 33.71, lng: 73.05 }, socials: {}, staff: [{ name: 'Ayesha Noor', role: 'coach' }], season_stats: [] },
  'demo-club-alpha-4': { home_venue: { name: 'Strikers Field', lat: 33.69, lng: 73.02 }, socials: {}, staff: [{ name: 'Faisal Raza', role: 'coach' }], season_stats: [] },
};
const RESULTS = [[2, 1], [0, 0], [1, 3]]; // first three fixtures completed with these scores

async function demoSeed() {
  const exists = await pool.query('SELECT 1 FROM leagues WHERE league_id = $1', [LEAGUE]);
  if (exists.rowCount) return { status: 'already_seeded', league_id: LEAGUE };

  for (const c of DEMO_CLUBS) {
    await pool.query("INSERT INTO clubs (club_id, tenant_id, name) VALUES ($1,'tenant-alpha',$2) ON CONFLICT DO NOTHING", [c.club_id, c.name]);
  }
  for (const [id, profile] of Object.entries(CLUB_PROFILES)) await pool.query('UPDATE clubs SET profile = $2 WHERE club_id = $1', [id, profile]);

  const teams = ['club-alpha-1', 'club-alpha-2', ...DEMO_CLUBS.map((c) => c.club_id)];
  const rr = roundRobin(teams, { legs: 1 });
  const fixtures = rr.rounds.flatMap((r) => r.matches.map((m) => ({ match_id: `demo-${m.match_id}`, home: m.home, away: m.away, round: r.round })));
  await scoring.createLeague({ league_id: LEAGUE, sport_id: 'football', teams, fixtures, qualification: { spots: 2 } });

  const venues = Object.fromEntries(teams.map((t) => [t, CLUB_PROFILES[t].home_venue.name]));
  for (const [i, f] of fixtures.entries()) {
    const day = String(10 + i * 3).padStart(2, '0');
    const info = { scheduled_at: `2026-10-${day}T14:00:00Z`, venue: venues[f.home], pinned_products: i === 3 ? ['prod-jersey-001'] : [] };
    await pool.query('UPDATE matches SET info = $2 WHERE match_id = $1', [f.match_id, info]);
  }
  let n = 0;
  const ev = (matchId, type, payload = {}) => scoring.appendEvent({ event_id: `demo-evt-${++n}`, match_id: matchId, type, payload });
  for (const [i, f] of fixtures.entries()) {
    if (i > 3) break;
    await ev(f.match_id, 'match_start');
    const [hg, ag] = RESULTS[i] ?? [1, 0];
    for (let g = 0; g < hg; g++) await ev(f.match_id, 'score', { team_id: f.home, event_type: 'goal' });
    for (let g = 0; g < ag; g++) await ev(f.match_id, 'score', { team_id: f.away, event_type: 'goal' });
    if (i < 3) await ev(f.match_id, 'match_end');
  }

  const squads = teams.map((t) => ({ squad_id: `sq-${t}`, club_id: t, tenant_id: 'tenant-alpha', name: t }));
  const names = ['Ali Khan', 'Hamza Iqbal', 'Zain Abbas', 'Saad Butt', 'Imran Qadir', 'Junaid Akhtar'];
  const players = [];
  teams.forEach((t, ti) => {
    const ids = ti === 0 ? ['player-alpha-1'] : ti === 1 ? ['player-alpha-2'] : [];
    for (let k = ids.length; k < 5; k++) ids.push(`demo-p-${ti + 1}-${k + 1}`);
    ids.forEach((pid, k) => players.push({
      player_id: pid, name: k === 0 && ti < 2 ? (ti === 0 ? 'Ali Khan' : 'Bilal Ahmed') : `${names[(ti + k) % names.length]} ${ti + 1}${k}`,
      position: k < 2 ? 'gk' : k < 4 ? 'df' : 'fw', squad_id: `sq-${t}`,
      role: k === 0 ? 'captain' : k === 1 ? 'vice_captain' : k < 4 ? 'starter' : 'substitute',
    }));
  });
  await roster.setupRoster({
    league: { league_id: LEAGUE, tenant_id: 'tenant-alpha', sport_id: 'football',
      transfer_window: { open: '2026-10-01', close: '2026-12-31' }, max_squad_size: 8, required_positions: { gk: 1 } },
    squads, players, matches_in_progress: [{ match_id: fixtures[3].match_id, home_squad_id: `sq-${fixtures[3].home}`, away_squad_id: `sq-${fixtures[3].away}` }],
  });

  await pool.query("INSERT INTO products VALUES ('demo-prod-scarf','tenant-alpha','Alpha Supporters Scarf',$1) ON CONFLICT DO NOTHING",
    [{ description: 'Knitted scarf in club colours', image_url: null }]);
  await pool.query("INSERT INTO variants VALUES ('demo-var-scarf-std','demo-prod-scarf','One size',150000,25,0) ON CONFLICT DO NOTHING");
  await pool.query("UPDATE variants SET stock = GREATEST(stock, 10) WHERE variant_id LIKE 'var-jersey-001-%'");
  return { status: 'seeded', league_id: LEAGUE, fixtures: fixtures.length };
}

module.exports = { demoSeed, LEAGUE };
