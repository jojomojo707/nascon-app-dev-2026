// Team display names for a match, taken from cached fixtures / standings (falls back to the id).
import { useMemo } from "react";
import { cacheGet } from "../data/db";
import { keys } from "../data/repos";
import { Fixture, teamId, teamName } from "../data/types";
import { useAppStore } from "../state/appStore";

export function useTeamNames(leagueId: string | undefined, matchId: string) {
  const dataVersion = useAppStore((s) => s.dataVersion);
  return useMemo(() => {
    void dataVersion;
    const names: Record<string, string> = {};
    const fromScore = cacheGet<{ team_names?: Record<string, string> }>(keys.score(matchId))?.data?.team_names;
    if (fromScore) Object.assign(names, fromScore);
    if (leagueId) {
      const st = cacheGet<{ team_names?: Record<string, string> }>(keys.standings(leagueId))?.data?.team_names;
      if (st) Object.assign(names, st);
      const f = cacheGet<Fixture[]>(keys.fixtures(leagueId))?.data ?? [];
      const m = f.find((x) => x.match_id === matchId);
      if (m) {
        names[teamId(m.home)] = teamName(m.home, names);
        names[teamId(m.away)] = teamName(m.away, names);
      }
    }
    return (id: string) => names[id] ?? id;
  }, [leagueId, matchId, dataVersion]);
}
