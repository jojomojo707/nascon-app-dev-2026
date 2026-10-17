'use strict';
// POST /audit/v1/offline-sync and /api/v1/offline-sync share this exact code path (spec 16).
// Each action goes through the same services as /events and /roster/transfer.
const { pool } = require('../../db/pool');
const { AppError } = require('../../lib/errors');
const { bodyHash } = require('../../lib/signature');
const scoring = require('../scoring/service');
const { validateEventBody } = require('../scoring/engine');
const roster = require('../roster/service');
const { validateTransfer } = require('../roster/rules');
const E = require('./envelope');

async function scoreEvent(action) {
  const body = action.payload;
  try { validateEventBody(body); } catch (e) { return E.rejected(e.code, 0); }
  const m = await pool.query('SELECT 1 FROM matches WHERE match_id = $1', [body.match_id]);
  if (!m.rowCount && body.type !== 'match_init') return E.rejected('MATCH_NOT_FOUND', 0);
  const current = await scoring.matchVersion(pool, body.match_id);
  const prior = await pool.query('SELECT body_hash FROM events WHERE event_id = $1', [body.event_id]);
  if (prior.rowCount && prior.rows[0].body_hash === bodyHash(scoring.eventKey(body))) return E.duplicate(current);
  if (action.base_version > current) return E.rejected('INVALID_BASE_VERSION', current);
  try {
    const r = await scoring.appendEvent(body);
    if (r.status === 200) return E.duplicate(current);
    return E.applied(action.base_version, current, r.body.match_version, r.body.signature);
  } catch (e) {
    if (e instanceof AppError) return E.rejected(e.code, current);
    throw e;
  }
}

async function rosterTransfer(action) {
  const body = action.payload;
  try { validateTransfer(body); } catch (e) { return E.rejected(e.code, 0); }
  const p = await pool.query('SELECT 1 FROM players WHERE player_id = $1', [body.player_id]);
  if (!p.rowCount) return E.rejected('PLAYER_NOT_FOUND', 0);
  const current = await roster.playerVersion(pool, body.player_id);
  const prior = await pool.query('SELECT body_hash FROM roster_requests WHERE request_id = $1', [body.request_id]);
  if (prior.rowCount && prior.rows[0].body_hash === bodyHash(body)) return E.duplicate(current);
  if (action.base_version > current) return E.rejected('INVALID_BASE_VERSION', current);
  try {
    const r = await roster.transfer(body);
    if (r.status === 200) return E.duplicate(current);
    return E.applied(action.base_version, current, await roster.playerVersion(pool, body.player_id), null);
  } catch (e) {
    if (e instanceof AppError) return E.rejected(e.code, current);
    throw e;
  }
}

async function currentVersion(action) {
  const p = action.payload || {};
  if (action.type === 'score_event' && typeof p.match_id === 'string') return scoring.matchVersion(pool, p.match_id);
  if (action.type === 'roster_transfer' && typeof p.player_id === 'string') return roster.playerVersion(pool, p.player_id);
  return 0;
}

async function offlineSync(body) {
  E.validateEnvelope(body);
  const results = new Array(body.actions.length);
  let n = 0;
  for (const i of E.processingOrder(body.actions)) {
    const action = body.actions[i];
    n++;
    const seen = await pool.query('SELECT 1 FROM sync_actions WHERE device_id = $1 AND action_id = $2', [body.device_id, action.action_id]);
    let r;
    if (seen.rowCount) r = E.duplicate(await currentVersion(action));
    else {
      r = action.type === 'score_event' ? await scoreEvent(action) : await rosterTransfer(action);
      await pool.query('INSERT INTO sync_actions VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [body.device_id, action.action_id, r]);
    }
    results[i] = { action_id: action.action_id, status: r.status, resolution: r.resolution, error_code: r.error_code,
      processed_order: n, server_version: r.server_version, signature: r.signature };
  }
  return { device_id: body.device_id, results, summary: E.summarize(results) };
}

module.exports = { offlineSync };
