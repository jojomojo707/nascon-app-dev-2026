'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../backend/src/domain/sync/envelope');

const action = (o = {}) => ({ action_id: 'a1', type: 'score_event', queued_at: '2026-10-17T11:00:00Z', base_version: 3,
  payload: { event_id: 'evt-9', match_id: 'm1', type: 'score', payload: { team_id: 't1', event_type: 'goal' } }, ...o });
const fields = (b) => { try { E.validateEnvelope(b); return null; } catch (e) { return e.details.fields; } };

test('envelope: 1-100 actions in the exact spec format', () => {
  assert.equal(fields({ device_id: 'dev-1', actions: [action()] }), null);
  assert.deepEqual(fields({ device_id: 'dev-1', actions: [] }), ['actions']);
  assert.deepEqual(fields({ device_id: 'dev-1', actions: Array.from({ length: 101 }, () => action()) }), ['actions']);
  assert.deepEqual(fields({ device_id: 'd|1', actions: [action({ type: 'x', queued_at: '2026-10-17 11:00', base_version: -1, payload: [] })] }),
    ['device_id', 'actions[0].type', 'actions[0].queued_at', 'actions[0].base_version', 'actions[0].payload']);
  assert.deepEqual(fields({ device_id: 'dev', actions: [null] }), ['actions[0]']);
  assert.deepEqual(fields({ device_id: 'dev', actions: [action({ action_id: '' })] }), ['actions[0].action_id']);
  assert.deepEqual(fields(null), ['body']);
});

test('processing order: queued_at ascending, ties keep array order', () => {
  const acts = [action({ queued_at: '2026-10-17T11:05:00Z' }), action({ queued_at: '2026-10-17T11:00:00Z' }),
    action({ queued_at: '2026-10-17T11:05:00Z' }), action({ queued_at: '2026-10-17T10:00:00Z' })];
  assert.deepEqual(E.processingOrder(acts), [3, 1, 0, 2]);
});

test('result mapping: appended vs rebased, rejected, duplicate, summary', () => {
  assert.deepEqual(E.applied(5, 5, 6, 'sig'), { status: 'applied', resolution: 'appended', error_code: null, server_version: 6, signature: 'sig' });
  assert.equal(E.applied(3, 5, 6, 'sig').resolution, 'rebased_append');
  assert.deepEqual(E.rejected('SQUAD_FULL', 1), { status: 'rejected', resolution: 'server_wins', error_code: 'SQUAD_FULL', server_version: 1, signature: null });
  assert.equal(E.duplicate(4).resolution, 'skipped_duplicate');
  assert.deepEqual(E.summarize([E.applied(1, 1, 2, 's'), E.rejected('X', 0), E.duplicate(0), E.duplicate(0)]), { applied: 1, rejected: 1, duplicate: 2 });
});
