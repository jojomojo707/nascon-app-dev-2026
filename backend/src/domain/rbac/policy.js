'use strict';
// Five-tier RBAC as policy-as-code (FR-5.1, spec 15). Each action maps role -> predicate over
// (principal, target). Anything not listed is denied. Tenant isolation is absolute: a non-super-admin
// is only ever allowed on targets of their own tenant. Unknown targets are treated as not owned.

const ROLES = ['super_admin', 'league_organizer', 'club_manager', 'player', 'viewer'];

const ALLOW = () => true;
const sameTenant = (p, t) => Boolean(t && t.exists && p.tenant_id && t.tenant_id === p.tenant_id);
const ownsLeague = (p, t) => sameTenant(p, t) && (p.league_ids || []).includes(t.league_id);
const managesClub = (p, t) => sameTenant(p, t) && Boolean(p.club_id) && t.club_id === p.club_id;
const isSelf = (p, t) => sameTenant(p, t) && Boolean(p.player_id) && t.player_id === p.player_id;

const POLICIES = {
  'tenant.create': { super_admin: ALLOW },
  'league.fixtures.write': { super_admin: ALLOW, league_organizer: ownsLeague },
  'league.scoring.write': { super_admin: ALLOW, league_organizer: ownsLeague },
  'club.roster.write': { super_admin: ALLOW, club_manager: managesClub },
  'club.products.write': { super_admin: ALLOW, club_manager: managesClub },
  'player.update': { super_admin: ALLOW, club_manager: managesClub, player: isSelf },
  'club.read': { super_admin: ALLOW, league_organizer: sameTenant, club_manager: sameTenant, player: sameTenant, viewer: sameTenant },
  'tenant.read': { super_admin: ALLOW, league_organizer: sameTenant, club_manager: sameTenant, player: sameTenant, viewer: sameTenant },
  'store.purchase': { super_admin: ALLOW, league_organizer: ALLOW, club_manager: ALLOW, player: ALLOW, viewer: ALLOW },
  'platform.config.read': { super_admin: ALLOW },
  'demo.seed': { super_admin: ALLOW },
};

function isAllowed(principal, action, target) {
  const rule = POLICIES[action];
  if (!rule || !principal || !ROLES.includes(principal.role)) return false;
  const pred = rule[principal.role];
  return pred ? Boolean(pred(principal, target)) : false;
}

module.exports = { ROLES, POLICIES, isAllowed };
