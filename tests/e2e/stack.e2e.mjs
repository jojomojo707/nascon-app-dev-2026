// End-to-end checks against a running stack (docker compose up). Run with: scripts/e2e.sh
// Not part of run_tests.sh / COVERAGE.json (needs Postgres).
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:8080';
async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON */ }
  return { status: res.status, json, headers: res.headers };
}
const post = (p, b, h) => call('POST', p, b, h);
const get = (p, h) => call('GET', p, undefined, h);

test('health and reset are repeatable', async () => {
  assert.equal((await get('/health')).status, 200);
  const a = await post('/audit/v1/reset', {});
  await post('/audit/v1/sports', { sport_id: 'kabaddi', name: 'Kabaddi', scoring_model: 'event', periods: { count: 2, duration_minutes: 20 },
    scoring_events: { raid_point: { points: 1 } }, draw_allowed: false, overtime: { policy: 'none' },
    roster: { min_squad_size: 7, max_squad_size: 12, required_positions: {} } });
  const b = await post('/audit/v1/reset', {});
  assert.deepEqual(a.json, b.json);
  assert.deepEqual(b.json.sports, ['football', 'basketball', 'cricket', 'esports']);
  const again = await post('/audit/v1/sports', { sport_id: 'kabaddi', name: 'Kabaddi', scoring_model: 'event', periods: { count: 2, duration_minutes: 20 },
    scoring_events: { raid_point: { points: 1 } }, draw_allowed: false, overtime: { policy: 'none' },
    roster: { min_squad_size: 7, max_squad_size: 12, required_positions: {} } });
  assert.equal(again.status, 201, 'reset removes custom sports');
  assert.deepEqual((await get('/audit/v1/inventory/var-jersey-001-M')).json, { variant_id: 'var-jersey-001-M', stock: 1, reserved: 0 });
});

test('20 simultaneous buyers of the last unit: exactly one succeeds', async () => {
  await post('/audit/v1/reset', { stock: { 'var-jersey-001-M': 1 } });
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => post('/audit/v1/checkout', {
    order_id: `burst-${i}`, customer_id: `c${i}`, items: [{ variant_id: 'var-jersey-001-M', quantity: 1 }], discount_code: null, payment: { token: 'tok_success' } })));
  const codes = results.map((r) => r.status).sort();
  assert.equal(codes.filter((c) => c === 201).length, 1);
  assert.equal(codes.filter((c) => c === 409).length, 19);
  for (const r of results.filter((x) => x.status === 409)) assert.equal(r.json.error.code, 'OUT_OF_STOCK');
  assert.deepEqual((await get('/audit/v1/inventory/var-jersey-001-M')).json, { variant_id: 'var-jersey-001-M', stock: 0, reserved: 0 });
});

test('mystery sport is immediately usable for events, score and standings', async () => {
  await post('/audit/v1/reset', {});
  assert.equal((await post('/audit/v1/sports', { sport_id: 'valo', name: 'Valo', scoring_model: 'round', periods: { best_of: 3 },
    scoring_events: { map_win: { rounds: 1 } }, draw_allowed: false, overtime: { policy: 'none' },
    roster: { min_squad_size: 5, max_squad_size: 8, required_positions: {} } })).status, 201);
  assert.equal((await post('/audit/v1/leagues', { league_id: 'lg-v', sport_id: 'valo', teams: ['a', 'b'],
    fixtures: [{ match_id: 'v1', home: 'a', away: 'b' }], qualification: { spots: 1 } })).status, 201);
  const ev = (id, type, payload = {}) => post('/audit/v1/events', { event_id: id, match_id: 'v1', type, payload });
  assert.equal((await ev('v-1', 'match_start')).status, 201);
  assert.equal((await ev('v-2', 'score', { team_id: 'a', event_type: 'map_win' })).status, 201);
  assert.equal((await ev('v-3', 'score', { team_id: 'a', event_type: 'map_win' })).status, 201);
  assert.equal((await ev('v-4', 'score', { team_id: 'b', event_type: 'map_win' })).json.error.code, 'SERIES_ALREADY_DECIDED');
  assert.equal((await ev('v-5', 'match_end')).status, 201);
  const s = (await get('/audit/v1/standings/lg-v')).json;
  assert.deepEqual(s.table.map((r) => [r.team_id, r.points, r.diff, r.status]), [['a', 3, 2, 'clinched'], ['b', 0, -2, 'eliminated']]);
});

test('RBAC probes, bad tokens, 413 and rate limiting', async () => {
  await post('/audit/v1/reset', {});
  const m = (await post('/audit/v1/rbac-matrix')).json;
  const auth = (t) => ({ Authorization: `Bearer ${t}` });
  assert.equal((await post('/audit/v1/rbac/tenants', {}, auth(m.tokens.super_admin))).status, 200);
  assert.equal((await post('/audit/v1/rbac/tenants', {}, auth(m.tokens.viewer))).json.error.code, 'FORBIDDEN');
  assert.equal((await get(`/audit/v1/rbac/clubs/${m.context.foreign_club_id}`, auth(m.tokens.player))).status, 403);
  assert.equal((await call('PATCH', `/audit/v1/rbac/players/${m.context.own_player_id}`, {}, auth(m.tokens.club_manager))).status, 200);
  assert.equal((await get('/audit/v1/rbac/platform/config')).status, 401);
  const [h, b] = m.tokens.super_admin.split('.');
  assert.equal((await get('/audit/v1/rbac/platform/config', auth(`${h}.${b}.AAAA`))).status, 401);
  const none = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url');
  assert.equal((await get('/audit/v1/rbac/platform/config', auth(`${none}.${b}.`))).status, 401);
  const big = await post('/audit/v1/sports', JSON.stringify({ sport_id: 'x'.repeat(1100000) }));
  assert.equal(big.status, 413);
  assert.equal(big.json.error.code, 'PAYLOAD_TOO_LARGE');
  const inj = await post('/audit/v1/sports', { sport_id: "x'; DROP TABLE sports;--" });
  assert.equal(inj.status, 400);
  const pings = await Promise.all(Array.from({ length: 150 }, () => get('/api/v1/ping')));
  const limited = pings.filter((r) => r.status === 429);
  assert.ok(limited.length >= 40);
  assert.ok(limited[0].headers.get('retry-after'));
  const audits = await Promise.all(Array.from({ length: 200 }, () => get('/audit/v1/inventory/var-jersey-001-L')));
  assert.ok(audits.every((r) => r.status === 200));
});

test('offline sync re-send returns duplicates only', async () => {
  await post('/audit/v1/reset', {});
  await post('/audit/v1/leagues', { league_id: 'lg-1', sport_id: 'football', teams: ['t1', 't2'],
    fixtures: [{ match_id: 'm1', home: 't1', away: 't2' }], qualification: { spots: 1 } });
  await post('/audit/v1/events', { event_id: 'e1', match_id: 'm1', type: 'match_start', payload: {} });
  const body = { device_id: 'dev-1', actions: [{ action_id: 'a1', type: 'score_event', queued_at: '2026-10-17T11:00:00Z', base_version: 0,
    payload: { event_id: 'evt-9', match_id: 'm1', type: 'score', payload: { team_id: 't1', event_type: 'goal' } } }] };
  const first = (await post('/audit/v1/offline-sync', body)).json;
  assert.equal(first.results[0].status, 'applied');
  assert.equal(first.results[0].resolution, 'rebased_append');
  assert.equal(first.results[0].server_version, 2);
  assert.match(first.results[0].signature, /^[0-9a-f]{64}$/);
  const second = (await post('/audit/v1/offline-sync', body)).json;
  assert.deepEqual(second.summary, { applied: 0, rejected: 0, duplicate: 1 });
});
