'use strict';
// Mock payment gateway built by the team (spec 14): authorization, capture, void, refund.
// Token behaviour: tok_success -> authorize + capture; tok_declined -> authorization fails;
// tok_capture_fail -> authorization succeeds, capture fails. Any other token is declined.

function authorize(token, amountMinor, seq) {
  if (token === 'tok_success' || token === 'tok_capture_fail') {
    return { ok: true, authorization_id: `auth_${seq}`, amount_minor: amountMinor };
  }
  return { ok: false, reason: 'declined' };
}

function capture(token, authorization, seq) {
  if (token === 'tok_capture_fail') return { ok: false, reason: 'capture_failed' };
  return { ok: true, capture_id: `cap_${seq}`, state: 'captured', authorization_id: authorization.authorization_id };
}

function voidAuthorization(authorization) {
  return { ok: true, authorization_id: authorization.authorization_id, state: 'voided' };
}

function refund(captureResult, amountMinor) {
  return { ok: true, capture_id: captureResult.capture_id, amount_minor: amountMinor, state: 'refunded' };
}

module.exports = { authorize, capture, voidAuthorization, refund };
