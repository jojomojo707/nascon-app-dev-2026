// Offline-first repositories: fetch from /api/v1, write the response into the SQLite cache.
// Screens read the cache (useCached) so they work offline with the last saved data.
import { apiGet, ApiResult, asArray, routes } from "./api";
import { cachePut } from "./db";
import { AuditEntry, Club, ClubSummary, Fixture, History, League, PinnedProduct, Product, Score, SportConfig, Squad, Standings } from "./types";

export const keys = {
  leagues: "leagues",
  fixtures: (l: string) => `fixtures:${l}`,
  standings: (l: string) => `standings:${l}`,
  sport: (s: string) => `sport:${s}`,
  score: (m: string) => `score:${m}`,
  pinned: (m: string) => `pinned:${m}`,
  clubs: "clubs",
  club: (c: string) => `club:${c}`,
  squads: (l: string) => `squads:${l}`,
  history: (p: string) => `history:${p}`,
  products: "products",
};

async function fetchInto<T>(key: string, url: string, map: (d: unknown) => T): Promise<ApiResult<T>> {
  const res = await apiGet<unknown>(url);
  if (!res.ok) return res;
  const data = map(res.data);
  cachePut(key, data);
  return { ok: true, data, status: res.status };
}

export const repo = {
  leagues: () => fetchInto<League[]>(keys.leagues, routes.leagues, (d) => asArray<League>(d, "leagues")),
  fixtures: (leagueId: string) =>
    fetchInto<Fixture[]>(keys.fixtures(leagueId), routes.fixtures(leagueId), (d) => asArray<Fixture>(d, "fixtures", "matches")),
  standings: (leagueId: string) => fetchInto<Standings>(keys.standings(leagueId), routes.standings(leagueId), (d) => d as Standings),
  sport: (sportId: string) =>
    fetchInto<SportConfig>(keys.sport(sportId), routes.sport(sportId), (d) => {
      const o = d as { config?: SportConfig } & SportConfig;
      return (o.config ?? o) as SportConfig;
    }),
  score: (matchId: string) => fetchInto<Score>(keys.score(matchId), routes.score(matchId), (d) => d as Score),
  pinned: (matchId: string) => fetchInto<PinnedProduct[]>(keys.pinned(matchId), routes.pinned(matchId), (d) => asArray<PinnedProduct>(d, "products")),
  clubs: () => fetchInto<ClubSummary[]>(keys.clubs, routes.clubs, (d) => asArray<ClubSummary>(d, "clubs")),
  club: (clubId: string) => fetchInto<Club>(keys.club(clubId), routes.club(clubId), (d) => d as Club),
  squads: (leagueId: string) => fetchInto<Squad[]>(keys.squads(leagueId), routes.squads(leagueId), (d) => asArray<Squad>(d, "squads")),
  history: (playerId: string) =>
    fetchInto<History>(keys.history(playerId), routes.rosterHistory(playerId), (d) => {
      const h = d as History;
      return { ...h, history: asArray<AuditEntry>(h?.history ?? []) };
    }),
  products: () => fetchInto<Product[]>(keys.products, routes.products, (d) => asArray<Product>(d, "products")),
};
