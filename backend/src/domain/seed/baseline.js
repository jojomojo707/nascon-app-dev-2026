'use strict';
// Exact baseline data recreated by every reset (spec 07). The four sports are plain data,
// stored with the same schema as POST /audit/v1/sports.
const crypto = require('node:crypto');

const DEFAULT_TIE_BREAK = ['h2h_points', 'h2h_diff', 'overall_diff', 'scored', 'fair_play', 'draw_lots'];

const SPORTS = [
  {
    sport_id: 'football', name: 'Football', scoring_model: 'event',
    periods: { count: 2, duration_minutes: 45 },
    scoring_events: { goal: { points: 1 } },
    draw_allowed: true, overtime: { policy: 'none' }, tie_break_order: DEFAULT_TIE_BREAK,
    roster: { min_squad_size: 11, max_squad_size: 25, required_positions: { gk: 1 } },
  },
  {
    sport_id: 'basketball', name: 'Basketball', scoring_model: 'event',
    periods: { count: 4, duration_minutes: 12 },
    scoring_events: { free_throw: { points: 1 }, two_pointer: { points: 2 }, three_pointer: { points: 3 } },
    draw_allowed: false, overtime: { policy: 'extra_time', duration_minutes: 5 }, tie_break_order: DEFAULT_TIE_BREAK,
    roster: { min_squad_size: 5, max_squad_size: 15, required_positions: {} },
  },
  {
    sport_id: 'cricket', name: 'Cricket', scoring_model: 'innings',
    periods: { innings_per_team: 1, overs_per_innings: 20, balls_per_over: 6, wickets_per_innings: 10 },
    scoring_events: {
      dot_ball: { runs: 0, legal_ball: true, wicket: false },
      single: { runs: 1, legal_ball: true, wicket: false },
      two: { runs: 2, legal_ball: true, wicket: false },
      four: { runs: 4, legal_ball: true, wicket: false },
      six: { runs: 6, legal_ball: true, wicket: false },
      wide: { runs: 1, legal_ball: false, wicket: false },
      no_ball: { runs: 1, legal_ball: false, wicket: false },
      wicket: { runs: 0, legal_ball: true, wicket: true },
    },
    draw_allowed: true, overtime: { policy: 'super_over' }, tie_break_order: DEFAULT_TIE_BREAK,
    roster: { min_squad_size: 11, max_squad_size: 18, required_positions: { wicketkeeper: 1 } },
  },
  {
    sport_id: 'esports', name: 'Esports', scoring_model: 'round',
    periods: { best_of: 3 },
    scoring_events: { round_win: { rounds: 1 } },
    draw_allowed: false, overtime: { policy: 'none' }, tie_break_order: DEFAULT_TIE_BREAK,
    roster: { min_squad_size: 5, max_squad_size: 8, required_positions: {} },
  },
];

const TENANTS = [
  { tenant_id: 'tenant-alpha', name: 'Alpha Sports', logo_url: null, primary_color: '#1D4ED8', secondary_color: '#F59E0B' },
  { tenant_id: 'tenant-beta', name: 'Beta Athletics', logo_url: null, primary_color: '#047857', secondary_color: '#DB2777' },
];

const CLUBS = [
  { club_id: 'club-alpha-1', tenant_id: 'tenant-alpha', name: 'Alpha United' },
  { club_id: 'club-alpha-2', tenant_id: 'tenant-alpha', name: 'Alpha Rovers' },
  { club_id: 'club-beta-1', tenant_id: 'tenant-beta', name: 'Beta City' },
];

const SCENARIO_LEAGUES = [
  { league_id: 'league-alpha-1', tenant_id: 'tenant-alpha', name: 'Alpha Premier League', sport_id: 'football', season: '2026' },
  { league_id: 'league-alpha-2', tenant_id: 'tenant-alpha', name: 'Alpha Cup', sport_id: 'basketball', season: '2026' },
  { league_id: 'league-beta-1', tenant_id: 'tenant-beta', name: 'Beta League', sport_id: 'football', season: '2026' },
];

const SCENARIO_PLAYERS = [
  { player_id: 'player-alpha-1', club_id: 'club-alpha-1', tenant_id: 'tenant-alpha', name: 'Ali Khan' },
  { player_id: 'player-alpha-2', club_id: 'club-alpha-2', tenant_id: 'tenant-alpha', name: 'Bilal Ahmed' },
  { player_id: 'player-beta-1', club_id: 'club-beta-1', tenant_id: 'tenant-beta', name: 'Usman Tariq' },
];

const DEMO_PASSWORD = 'Nascon@26';
const USERS = [
  { user_id: 'user-admin', email: 'admin@nascon.test', display_name: 'Platform Admin', role: 'super_admin',
    tenant_id: null, league_ids: [], club_id: null, player_id: null },
  { user_id: 'user-organizer', email: 'organizer@nascon.test', display_name: 'League Organizer', role: 'league_organizer',
    tenant_id: 'tenant-alpha', league_ids: ['league-alpha-1'], club_id: null, player_id: null },
  { user_id: 'user-manager', email: 'manager@nascon.test', display_name: 'Club Manager', role: 'club_manager',
    tenant_id: 'tenant-alpha', league_ids: [], club_id: 'club-alpha-1', player_id: null },
  { user_id: 'user-player', email: 'player@nascon.test', display_name: 'Ali Khan', role: 'player',
    tenant_id: 'tenant-alpha', league_ids: [], club_id: 'club-alpha-1', player_id: 'player-alpha-1' },
  { user_id: 'user-viewer', email: 'viewer@nascon.test', display_name: 'General Viewer', role: 'viewer',
    tenant_id: 'tenant-alpha', league_ids: [], club_id: null, player_id: null },
];

const PRODUCTS = [{ product_id: 'prod-jersey-001', tenant_id: 'tenant-alpha', name: 'Alpha Home Jersey',
  info: { description: 'Official home jersey', image_url: null } }];
const VARIANTS = [
  { variant_id: 'var-jersey-001-M', product_id: 'prod-jersey-001', label: 'Size M', price_minor: 450000 },
  { variant_id: 'var-jersey-001-L', product_id: 'prod-jersey-001', label: 'Size L', price_minor: 450000 },
];
const DEFAULT_STOCK = { 'var-jersey-001-M': 1, 'var-jersey-001-L': 5 };
const DISCOUNT_CODES = [{ code: 'WELCOME10', percent: 10 }];

// Deterministic per-user salt so two resets produce byte-identical rows.
function hashPassword(password, saltText) {
  const salt = crypto.createHash('sha256').update('nascon-user|' + saltText).digest('hex').slice(0, 32);
  return 'scrypt$' + salt + '$' + crypto.scryptSync(password, salt, 32).toString('hex');
}

function verifyPassword(password, stored) {
  const [scheme, salt, hex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const got = crypto.scryptSync(password, salt, 32);
  const want = Buffer.from(hex, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

let cachedHashes = null;
function userHashes() {
  if (!cachedHashes) cachedHashes = Object.fromEntries(USERS.map((u) => [u.email, hashPassword(DEMO_PASSWORD, u.email)]));
  return cachedHashes;
}

module.exports = {
  DEFAULT_TIE_BREAK, SPORTS, TENANTS, CLUBS, SCENARIO_LEAGUES, SCENARIO_PLAYERS, USERS, PRODUCTS, VARIANTS,
  DEFAULT_STOCK, DISCOUNT_CODES, hashPassword, verifyPassword, userHashes,
};
