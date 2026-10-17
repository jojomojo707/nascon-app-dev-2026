import React from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { repo, keys } from "../../data/repos";
import { Fixture, teamName } from "../../data/types";
import { formatTime } from "../../core/format";
import { statusLabel } from "../../core/scoreView";
import { useCached } from "../../ui/useCached";
import { ChipTone, EmptyState, ListRow, LoadingState, Screen, StateView, StatusChip, TenantHeader } from "../../ui/components";
import { LeaguePicker, useSelectedLeague } from "../../ui/LeaguePicker";

export function toneForStatus(s: string | null | undefined): ChipTone {
  if (s === "in_progress") return "info";
  if (s === "completed") return "success";
  if (s === "cancelled" || s === "abandoned") return "danger";
  if (s === "postponed") return "warning";
  return "neutral";
}

export default function Fixtures() {
  const { leagues, list, league, setSelected } = useSelectedLeague();
  const id = league?.league_id ?? null;
  const fixtures = useCached<Fixture[]>(id ? keys.fixtures(id) : null, id ? () => repo.fixtures(id) : null);

  return (
    <Screen onRefresh={() => { leagues.refresh(); fixtures.refresh(); }} refreshing={fixtures.isRefreshing}>
      <TenantHeader subtitle={league ? `Fixtures · ${league.name ?? league.league_id}` : "Fixtures"} />
      <LeaguePicker list={list} selectedId={id} onSelect={setSelected} />
      {!league ? (
        leagues.isLoading ? <LoadingState text="Loading leagues..." /> : <EmptyState text="No leagues yet. Pull down to refresh." icon="trophy-outline" />
      ) : (
        <StateView state={fixtures} loadingText="Loading fixtures..." emptyText="No matches yet." isEmpty={(d) => d.length === 0}>
          {(data) => (
            <View style={{ gap: 8 }}>
              {data.map((f) => {
                const st = statusLabel(f.status);
                return (
                  <ListRow
                    key={f.match_id}
                    title={`${teamName(f.home)} vs ${teamName(f.away)}`}
                    subtitle={`${formatTime(f.scheduled_at)}${f.venue ? " · " + f.venue : ""}`}
                    right={<StatusChip text={st.text} icon={st.icon} tone={toneForStatus(f.status)} />}
                    onPress={() => router.push({ pathname: "/match/[matchId]", params: { matchId: f.match_id, leagueId: league.league_id } })}
                    accessibilityLabel={`${teamName(f.home)} versus ${teamName(f.away)}, ${st.text}. Open match.`}
                  />
                );
              })}
            </View>
          )}
        </StateView>
      )}
    </Screen>
  );
}
