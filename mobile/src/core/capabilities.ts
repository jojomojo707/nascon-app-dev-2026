// What each role may see in the UI (mobile/architecture/04 role matrix). Cosmetic only:
// the server's RBAC is the authority.
import type { Session } from "../state/appStore";

export function capabilities(session: Session | null) {
  const u = session?.user;
  const role = u?.role;
  const isAdmin = role === "super_admin";
  return {
    canScore: (leagueId: string | null | undefined) =>
      isAdmin || (role === "league_organizer" && !!leagueId && (u?.league_ids ?? []).includes(leagueId)),
    canManageRoster: (clubId: string | null | undefined) => isAdmin || (role === "club_manager" && !!clubId && u?.club_id === clubId),
    canSeeHistory: (clubId: string | null | undefined, playerId: string) =>
      isAdmin || (role === "club_manager" && u?.club_id === clubId) || (role === "player" && u?.player_id === playerId),
    canSeedDemo: isAdmin,
    canBuy: !!u,
  };
}

export function roleLabel(role: string | undefined): string {
  switch (role) {
    case "super_admin":
      return "Platform Super-Admin";
    case "league_organizer":
      return "League Organizer";
    case "club_manager":
      return "Club Manager";
    case "player":
      return "Player";
    case "viewer":
      return "General Viewer";
    default:
      return "Signed out";
  }
}
