'use strict';
// Roster rules (spec 13). Pure functions over the league's roster state.
// A player's registrations are append-only; their squad on a date is the last registration that
// started on or before that date, with a loan automatically returning the day after loan_end_date.
const { AppError, validation, notFound, conflict } = require('../../lib/errors');
const { isObject, isId, isInt, isDate, isString } = require('../../lib/validate');
const { addDays } = require('../../lib/time');

const ROLES = ['captain', 'vice_captain', 'starter', 'substitute'];
const TYPES = ['transfer', 'loan', 'release'];

function validateSetup(body) {
  if (!isObject(body)) throw validation(['body']);
  const f = [];
  const l = body.league;
  if (!isObject(l)) f.push('league');
  else {
    if (!isId(l.league_id)) f.push('league.league_id');
    if (!isId(l.tenant_id)) f.push('league.tenant_id');
    if (!isId(l.sport_id)) f.push('league.sport_id');
    const w = l.transfer_window;
    if (!isObject(w) || !isDate(w.open) || !isDate(w.close) || w.open > w.close) f.push('league.transfer_window');
    if (l.max_squad_size !== undefined && l.max_squad_size !== null && !isInt(l.max_squad_size, 1)) f.push('league.max_squad_size');
    if (l.required_positions !== undefined && l.required_positions !== null &&
      (!isObject(l.required_positions) || !Object.values(l.required_positions).every((v) => isInt(v, 0)))) {
      f.push('league.required_positions');
    }
  }
  const squads = body.squads ?? [];
  const squadIds = new Set();
  if (!Array.isArray(squads)) f.push('squads');
  else for (const s of squads) {
    if (!isObject(s) || !isId(s.squad_id) || !isId(s.tenant_id) || squadIds.has(s.squad_id) ||
      (s.club_id !== undefined && s.club_id !== null && !isId(s.club_id))) { f.push('squads'); break; }
    squadIds.add(s.squad_id);
  }
  const players = body.players ?? [];
  const playerIds = new Set();
  if (!Array.isArray(players)) f.push('players');
  else for (const p of players) {
    if (!isObject(p) || !isId(p.player_id) || playerIds.has(p.player_id) || !isString(p.position, 1, 64) ||
      (p.squad_id !== null && p.squad_id !== undefined && !squadIds.has(p.squad_id)) ||
      (p.role !== undefined && p.role !== null && !ROLES.includes(p.role))) { f.push('players'); break; }
    playerIds.add(p.player_id);
  }
  const mip = body.matches_in_progress ?? [];
  if (!Array.isArray(mip) || !mip.every((m) => isObject(m) && isId(m.match_id))) f.push('matches_in_progress');
  if (f.length) throw validation(f);
  return { league: l, squads, players, matches_in_progress: mip };
}

function validateTransfer(body) {
  if (!isObject(body)) throw validation(['body']);
  const f = [];
  for (const k of ['request_id', 'league_id', 'player_id', 'from_squad_id']) if (!isId(body[k])) f.push(k);
  if (!TYPES.includes(body.type)) f.push('type');
  if (body.type !== 'release' && !isId(body.to_squad_id)) f.push('to_squad_id');
  if (!isDate(body.effective_date)) f.push('effective_date');
  if (body.type === 'loan') {
    if (!isDate(body.loan_end_date) || (isDate(body.effective_date) && body.loan_end_date <= body.effective_date)) f.push('loan_end_date');
  } else if (body.loan_end_date !== undefined && body.loan_end_date !== null && !isDate(body.loan_end_date)) {
    f.push('loan_end_date');
  }
  for (const k of ['reason', 'requested_by']) {
    if (body[k] !== undefined && body[k] !== null && typeof body[k] !== 'string') f.push(k);
  }
  if (f.length) throw validation(f);
}

// Player's registration state on `date` (YYYY-MM-DD). `regs` are in append order.
function stateOn(regs, date) {
  let cur = null;
  for (const r of regs) if (r.start_date === null || r.start_date <= date) cur = r;
  if (!cur) return { squad_id: null, parent_squad_id: null, role: null, onLoan: false, loan: null };
  if (cur.registration_type === 'loan') {
    if (date > cur.loan_end_date) {
      return { squad_id: cur.parent_squad_id, parent_squad_id: null, role: 'substitute', onLoan: false, loan: null, returnedLoan: cur };
    }
    return { squad_id: cur.squad_id, parent_squad_id: cur.parent_squad_id, role: cur.role, onLoan: true, loan: cur };
  }
  return { squad_id: cur.squad_id, parent_squad_id: null, role: cur.role, onLoan: false, loan: null };
}

// Loans whose end has passed by `date` (each needs exactly one loan_return audit entry).
function endedLoans(regs, date) {
  return regs.filter((r) => r.registration_type === 'loan' && date > r.loan_end_date);
}

/**
 * Evaluates a transfer request in the exact spec order (checks 2-8; check 1 is validateTransfer).
 * ctx: {league, squads: Map, player, regsByPlayer: Map(player_id -> regs), playersInLeague: [player]}
 * Returns {registration, state, blocking_match_id}.
 */
function evaluateTransfer(ctx, body) {
  const { league, squads, player } = ctx;
  if (!league) throw notFound('LEAGUE_NOT_FOUND', `League ${body.league_id} does not exist.`, { league_id: body.league_id });
  if (!player) throw notFound('PLAYER_NOT_FOUND', `Player ${body.player_id} does not exist.`, { player_id: body.player_id });
  const from = squads.get(body.from_squad_id);
  if (!from) throw notFound('SQUAD_NOT_FOUND', `Squad ${body.from_squad_id} does not exist.`, { squad_id: body.from_squad_id });
  const to = body.type === 'release' ? null : squads.get(body.to_squad_id);
  if (body.type !== 'release' && !to) throw notFound('SQUAD_NOT_FOUND', `Squad ${body.to_squad_id} does not exist.`, { squad_id: body.to_squad_id });

  if (from.tenant_id !== league.tenant_id || (to && to.tenant_id !== league.tenant_id)) {
    throw conflict('CROSS_TENANT_TRANSFER', 'Both squads must belong to the league\'s tenant.',
      { league_tenant_id: league.tenant_id, from_squad_id: from.squad_id, to_squad_id: to ? to.squad_id : null });
  }

  const D = body.effective_date;
  const st = stateOn(ctx.regsByPlayer.get(player.player_id) || [], D);
  if (player.league_id !== body.league_id || st.squad_id !== body.from_squad_id) {
    throw conflict('NOT_IN_SQUAD', `Player ${player.player_id} is not in squad ${body.from_squad_id}.`,
      { player_id: player.player_id, squad_id: body.from_squad_id, current_squad_id: st.squad_id });
  }
  const w = league.transfer_window;
  if (body.type !== 'release' && (D < w.open || D > w.close)) {
    throw conflict('TRANSFER_WINDOW_CLOSED', `${D} is outside the transfer window ${w.open}..${w.close}.`,
      { effective_date: D, open: w.open, close: w.close });
  }
  if (st.onLoan) {
    throw conflict('PLAYER_ON_LOAN', `Player ${player.player_id} is on loan until ${st.loan.loan_end_date}.`,
      { player_id: player.player_id, loan_end_date: st.loan.loan_end_date });
  }
  const squadOn = (p) => stateOn(ctx.regsByPlayer.get(p.player_id) || [], D).squad_id;
  if (to) {
    const count = ctx.playersInLeague.filter((p) => squadOn(p) === to.squad_id).length;
    if (count + 1 > league.max_squad_size) {
      throw conflict('SQUAD_FULL', `Squad ${to.squad_id} is full.`, { squad_id: to.squad_id, max_squad_size: league.max_squad_size });
    }
  }
  const need = league.required_positions[player.position];
  if (need !== undefined) {
    const same = ctx.playersInLeague.filter((p) => p.position === player.position && squadOn(p) === from.squad_id).length;
    if (same - 1 < need) {
      throw conflict('MIN_POSITION_VIOLATION', `Squad ${from.squad_id} needs at least ${need} ${player.position}.`,
        { squad_id: from.squad_id, position: player.position, required: need });
    }
  }

  const blocking = league.matches_in_progress.find((m) => m.home_squad_id === from.squad_id || m.away_squad_id === from.squad_id);
  const registration = body.type === 'release' ? null : {
    player_id: player.player_id, league_id: body.league_id, squad_id: to.squad_id,
    parent_squad_id: body.type === 'loan' ? from.squad_id : null,
    registration_type: body.type, start_date: D,
    loan_end_date: body.type === 'loan' ? body.loan_end_date : null,
    role: 'substitute',
  };
  return {
    registration,
    state: blocking ? 'deferred_until_match_end' : 'active',
    blocking_match_id: blocking ? blocking.match_id : null,
  };
}

function loanReturnEntry(auditId, loan, when) {
  return {
    audit_id: auditId, action: 'loan_return', player_id: loan.player_id, league_id: loan.league_id,
    from_squad_id: loan.squad_id, to_squad_id: loan.parent_squad_id, effective_date: addDays(loan.loan_end_date, 1),
    state: 'active', who: 'system', when, why: 'Loan ended',
  };
}

const auditId = (n) => 'au-' + String(n).padStart(4, '0');

module.exports = { validateSetup, validateTransfer, stateOn, endedLoans, evaluateTransfer, loanReturnEntry, auditId, ROLES, AppError };
