'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { canonical } = require('../backend/src/lib/canonical');
const { sign, lotsKey, bodyHash } = require('../backend/src/lib/signature');

test('canonical JSON sorts keys recursively with no whitespace', () => {
  assert.equal(canonical({ team_id: 't1', event_type: 'goal' }), '{"event_type":"goal","team_id":"t1"}');
  assert.equal(canonical({ b: [3, { z: 1, a: null }], a: true }), '{"a":true,"b":[3,{"a":null,"z":1}]}');
  assert.equal(canonical({ n: 'Ålesund – ü' }), '{"n":"Ålesund – ü"}');
  assert.equal(canonical({ x: 1.0, y: 2.5 }), '{"x":1,"y":2.5}');
  assert.equal(canonical(undefined), 'null');
});

test('appendix A vector 1: event signature', () => {
  assert.equal(sign('evt-1', { team_id: 't1', event_type: 'goal' }, 'demo-salt'),
    '972a8b558690b19121cc5bea84978f85e8eb15a3735018db36616bab1d7ec501');
});

test('signature reads the salt from the environment', () => {
  const old = process.env.DAY1_SALT;
  process.env.DAY1_SALT = 'demo-salt';
  try {
    assert.equal(sign('evt-1', { team_id: 't1', event_type: 'goal' }),
      '972a8b558690b19121cc5bea84978f85e8eb15a3735018db36616bab1d7ec501');
  } finally {
    if (old === undefined) delete process.env.DAY1_SALT; else process.env.DAY1_SALT = old;
  }
});

test('appendix A vector 2: drawing of lots keys', () => {
  assert.equal(lotsKey(42, 'lg-1', 't1'), '0613316991ce0ac31e88d6003e3ff4d5e21bb072ac5f81b42c0cdc6598453293');
  assert.equal(lotsKey(42, 'lg-1', 't2'), 'e3e3a14e22727f936e1f288cf5d02a8a9362b1da13c5432725fc10b2c7955dd9');
  assert.equal(lotsKey(42, 'lg-1', 't3'), 'c8f28e3c2f1eb6c4f636b4f57050e3362a2b39c07fda9b61742a26dd20397028');
});

test('body hash ignores key order', () => {
  assert.equal(bodyHash({ a: 1, b: 2 }), bodyHash({ b: 2, a: 1 }));
  assert.notEqual(bodyHash({ a: 1 }), bodyHash({ a: 2 }));
});
