'use strict';
// Offline-sync envelope validation, processing order and result mapping (spec 16). Pure functions.
const { validation } = require('../../lib/errors');
const { isObject, isId, isInt, isTimestamp } = require('../../lib/validate');

const ACTION_TYPES = ['score_event', 'roster_transfer'];

function validateEnvelope(body) {
  if (!isObject(body)) throw validation(['body']);
  const f = [];
  if (!isId(body.device_id)) f.push('device_id');
  const a = body.actions;
  if (!Array.isArray(a) || a.length < 1 || a.length > 100) f.push('actions');
  else a.forEach((x, i) => {
    if (!isObject(x)) { f.push(`actions[${i}]`); return; }
    if (!isId(x.action_id)) f.push(`actions[${i}].action_id`);
    if (!ACTION_TYPES.includes(x.type)) f.push(`actions[${i}].type`);
    if (!isTimestamp(x.queued_at)) f.push(`actions[${i}].queued_at`);
    if (!isInt(x.base_version, 0)) f.push(`actions[${i}].base_version`);
    if (!isObject(x.payload)) f.push(`actions[${i}].payload`);
  });
  if (f.length) throw validation(f);
}

// Indices of actions sorted by queued_at ascending; ties keep array order.
function processingOrder(actions) {
  return actions.map((a, i) => i).sort((i, j) => (actions[i].queued_at < actions[j].queued_at ? -1
    : actions[i].queued_at > actions[j].queued_at ? 1 : i - j));
}

const applied = (baseVersion, currentBefore, serverVersion, signature) => ({
  status: 'applied', resolution: baseVersion === currentBefore ? 'appended' : 'rebased_append',
  error_code: null, server_version: serverVersion, signature,
});
const rejected = (code, serverVersion) => ({ status: 'rejected', resolution: 'server_wins', error_code: code, server_version: serverVersion, signature: null });
const duplicate = (serverVersion) => ({ status: 'duplicate', resolution: 'skipped_duplicate', error_code: null, server_version: serverVersion, signature: null });

function summarize(results) {
  const s = { applied: 0, rejected: 0, duplicate: 0 };
  for (const r of results) s[r.status]++;
  return s;
}

module.exports = { validateEnvelope, processingOrder, applied, rejected, duplicate, summarize, ACTION_TYPES };
