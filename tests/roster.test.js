'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../backend/src/domain/roster/rules');

const league = {
  league_id: 'lg-r1', tenant_id: 'tenant-alpha', sport_id: 'football',
  transfer_window: { open: '2026-09-01', close: '2026-09-30' }, max_squad_size: 3, required_positions: { gk: 1 },
  matches_in_progress: [{ match_id: 'm-live', home_squad_id: 'sq-a', away_squad_id: 'sq-x' }],
};
const squads = new Map([
  ['sq-a', { squad_id: 'sq-a', tenant_id: 'tenant-alpha' }], ['sq-b', { squad_id: 'sq-b', tenant_id: 'tenant-alpha' }],
  ['sq-c', { squad_id: 'sq-c', tenant_id: 'tenant-alpha' }], ['sq-z', { squad_id: 'sq-z', tenant_id: 'tenant-beta' }],
]);
const players = [
  { player_id: 'p1', league_id: 'lg-r1', position: 'gk' }, { player_id: 'p2', league_id: 'lg-r1', position: 'df' },
  { player_id: 'p3', league_id: 'lg-r1', position: 'df' }, { player_id: 'p4', league_id: 'lg-r1', position: 'df' },
  { player_id: 'p5', league_id: 'lg-r1', position: 'df' },
];
const init = (pid, squad) => ({ player_id: pid, league_id: 'lg-r1', squad_id: squad, parent_squad_id: null,
  registration_type: 'initial', start_date: null, loan_end_date: null, role: 'starter' });
function ctx(extra = {}) {
  const regs = new Map([['p1', [init('p1', 'sq-a')]], ['p2', [init('p2', 'sq-a')]],
    ['p3', [init('p3', 'sq-c')]], ['p4', [init('p4', 'sq-c')]], ['p5', [init('p5', 'sq-c')]]]);
  return { league, squads, player: players[1], regsByPlayer: regs, playersInLeague: players, ...extra };
}
const req = (o = {}) => ({ request_id: 'tr-1', league_id: 'lg-r1', player_id: 'p2', type: 'transfer', from_squad_id: 'sq-a',
  to_squad_id: 'sq-b', effective_date: '2026-09-15', loan_end_date: null, reason: 'Tactical', requested_by: 'user-77', ...o });
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return 'OK'; };

test('check 1: schema and dates', () => {
  assert.equal(code(() => R.validateTransfer(req())), 'OK');
  assert.equal(code(() => R.validateTransfer(req({ type: 'swap' }))), 'VALIDATION_ERROR');
  assert.equal(code(() => R.validateTransfer(req({ type: 'loan', loan_end_date: '2026-09-15' }))), 'VALIDATION_ERROR');
  assert.equal(code(() => R.validateTransfer(req({ effective_date: '2026-02-30' }))), 'VALIDATION_ERROR');
  assert.equal(code(() => R.validateTransfer(req({ to_squad_id: null }))), 'VALIDATION_ERROR');
  assert.equal(code(() => R.validateTransfer(req({ type: 'release', to_squad_id: null }))), 'OK');
  assert.equal(code(() => R.validateTransfer(null)), 'VALIDATION_ERROR');
  assert.equal(code(() => R.validateTransfer(req({ reason: 5 }))), 'VALIDATION_ERROR');
});

test('checks 2-8 in the exact order', () => {
  assert.equal(code(() => R.evaluateTransfer(ctx({ league: null }), req())), 'LEAGUE_NOT_FOUND');
  assert.equal(code(() => R.evaluateTransfer(ctx({ player: null }), req())), 'PLAYER_NOT_FOUND');
  assert.equal(code(() => R.evaluateTransfer(ctx(), req({ from_squad_id: 'nope' }))), 'SQUAD_NOT_FOUND');
  assert.equal(code(() => R.evaluateTransfer(ctx(), req({ to_squad_id: 'nope' }))), 'SQUAD_NOT_FOUND');
  assert.equal(code(() => R.evaluateTransfer(ctx(), req({ to_squad_id: 'sq-z', effective_date: '2026-12-01' }))), 'CROSS_TENANT_TRANSFER');
  assert.equal(code(() => R.evaluateTransfer(ctx(), req({ from_squad_id: 'sq-b', effective_date: '2026-12-01' }))), 'NOT_IN_SQUAD');
  assert.equal(code(() => R.evaluateTransfer(ctx(), req({ effective_date: '2026-10-01' }))), 'TRANSFER_WINDOW_CLOSED');
  assert.equal(code(() => R.evaluateTransfer(ctx(), req({ type: 'release', to_squad_id: null, effective_date: '2026-12-01' }))), 'OK');
  assert.equal(code(() => R.evaluateTransfer(ctx(), req({ to_squad_id: 'sq-c' }))), 'SQUAD_FULL');
  assert.equal(code(() => R.evaluateTransfer(ctx({ player: players[0] }), req({ player_id: 'p1' }))), 'MIN_POSITION_VIOLATION');
  const loaned = ctx();
  loaned.regsByPlayer.get('p2').push({ ...init('p2', 'sq-b'), registration_type: 'loan', parent_squad_id: 'sq-a',
    start_date: '2026-09-05', loan_end_date: '2026-12-31', role: 'substitute' });
  assert.equal(code(() => R.evaluateTransfer(loaned, req({ from_squad_id: 'sq-b', to_squad_id: 'sq-a', effective_date: '2026-09-20' }))), 'PLAYER_ON_LOAN');
  assert.equal(code(() => R.evaluateTransfer(loaned, req({ effective_date: '2026-09-20' }))), 'NOT_IN_SQUAD');
});

test('edge case 6: last window day with an in-progress match is deferred', () => {
  const r = R.evaluateTransfer(ctx(), req({ effective_date: '2026-09-30' }));
  assert.equal(r.state, 'deferred_until_match_end');
  assert.equal(r.blocking_match_id, 'm-live');
  assert.deepEqual(r.registration, { player_id: 'p2', league_id: 'lg-r1', squad_id: 'sq-b', parent_squad_id: null,
    registration_type: 'transfer', start_date: '2026-09-30', loan_end_date: null, role: 'substitute' });
  const free = R.evaluateTransfer({ ...ctx(), league: { ...league, matches_in_progress: [] } }, req());
  assert.equal(free.state, 'active');
  assert.equal(free.blocking_match_id, null);
});

test('loan registration and automatic return the day after loan_end_date', () => {
  const r = R.evaluateTransfer({ ...ctx(), league: { ...league, matches_in_progress: [] } },
    req({ type: 'loan', loan_end_date: '2026-10-15' }));
  assert.equal(r.registration.parent_squad_id, 'sq-a');
  assert.equal(r.registration.registration_type, 'loan');
  const regs = [init('p2', 'sq-a'), r.registration];
  assert.equal(R.stateOn(regs, '2026-09-14').squad_id, 'sq-a');
  assert.deepEqual([R.stateOn(regs, '2026-10-15').squad_id, R.stateOn(regs, '2026-10-15').parent_squad_id], ['sq-b', 'sq-a']);
  assert.deepEqual([R.stateOn(regs, '2026-10-16').squad_id, R.stateOn(regs, '2026-10-16').parent_squad_id], ['sq-a', null]);
  assert.equal(R.endedLoans(regs, '2026-10-15').length, 0);
  assert.equal(R.endedLoans(regs, '2026-10-16').length, 1);
  const e = R.loanReturnEntry('au-0002', r.registration, '2026-10-17T00:00:00Z');
  assert.deepEqual([e.action, e.who, e.from_squad_id, e.to_squad_id, e.effective_date], ['loan_return', 'system', 'sq-b', 'sq-a', '2026-10-16']);
  assert.equal(R.auditId(7), 'au-0007');
  assert.equal(R.stateOn([], '2026-01-01').squad_id, null);
});

test('setup validation', () => {
  const ok = { league: { league_id: 'lg', tenant_id: 'tenant-alpha', sport_id: 'football', transfer_window: { open: '2026-09-01', close: '2026-09-30' } },
    squads: [{ squad_id: 'a', tenant_id: 'tenant-alpha' }], players: [{ player_id: 'p', position: 'gk', squad_id: 'a', role: 'captain' }] };
  assert.equal(code(() => R.validateSetup(ok)), 'OK');
  assert.equal(code(() => R.validateSetup({ ...ok, players: [{ player_id: 'p', position: 'gk', squad_id: 'zz' }] })), 'VALIDATION_ERROR');
  assert.equal(code(() => R.validateSetup({ ...ok, players: [{ player_id: 'p', position: 'gk', squad_id: 'a', role: 'boss' }] })), 'VALIDATION_ERROR');
  assert.equal(code(() => R.validateSetup({ ...ok, league: { ...ok.league, transfer_window: { open: '2026-10-01', close: '2026-09-01' } } })), 'VALIDATION_ERROR');
  assert.equal(code(() => R.validateSetup({ ...ok, league: { ...ok.league, max_squad_size: 0, required_positions: { gk: -1 } } })), 'VALIDATION_ERROR');
  assert.equal(code(() => R.validateSetup({ ...ok, squads: [{ squad_id: 'a', tenant_id: 'x' }, { squad_id: 'a', tenant_id: 'x' }] })), 'VALIDATION_ERROR');
  assert.equal(code(() => R.validateSetup({ ...ok, matches_in_progress: [{}] })), 'VALIDATION_ERROR');
  assert.equal(code(() => R.validateSetup({ league: 1 })), 'VALIDATION_ERROR');
  assert.equal(code(() => R.validateSetup([])), 'VALIDATION_ERROR');
});
