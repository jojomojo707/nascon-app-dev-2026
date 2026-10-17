import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { repo, keys } from "../../data/repos";
import { Fixture, Standings, teamName } from "../../data/types";
import { qualificationLabel, statusLabel } from "../../core/scoreView";
import { humanize } from "../../core/format";
import { useCached } from "../../ui/useCached";
import { Card, ChipTone, EmptyState, ListRow, LoadingState, Screen, SectionHeader, StateView, StatusChip, styles as ui, TenantHeader } from "../../ui/components";
import { LeaguePicker, useSelectedLeague } from "../../ui/LeaguePicker";
import { baseColors, font, space } from "../../ui/theme";

function qualTone(s: string): ChipTone {
  return s === "clinched" ? "success" : s === "eliminated" ? "danger" : "warning";
}

const COLS: { key: "played" | "won" | "drawn" | "lost" | "diff" | "points"; label: string; a11y: string }[] = [
  { key: "played", label: "P", a11y: "played" },
  { key: "won", label: "W", a11y: "won" },
  { key: "drawn", label: "D", a11y: "drawn" },
  { key: "lost", label: "L", a11y: "lost" },
  { key: "diff", label: "Diff", a11y: "difference" },
  { key: "points", label: "Pts", a11y: "points" },
];

export default function StandingsTab() {
  const { leagues, list, league, setSelected } = useSelectedLeague();
  const id = league?.league_id ?? null;
  const standings = useCached<Standings>(id ? keys.standings(id) : null, id ? () => repo.standings(id) : null);
  const fixtures = useCached<Fixture[]>(id ? keys.fixtures(id) : null, id ? () => repo.fixtures(id) : null);

  const names: Record<string, string> = { ...(standings.data?.team_names ?? {}) };
  for (const f of fixtures.data ?? []) {
    if (typeof f.home !== "string" && f.home.name) names[f.home.team_id] = f.home.name;
    if (typeof f.away !== "string" && f.away.name) names[f.away.team_id] = f.away.name;
  }

  return (
    <Screen onRefresh={() => { leagues.refresh(); standings.refresh(); fixtures.refresh(); }} refreshing={standings.isRefreshing}>
      <TenantHeader subtitle={league ? `Standings · ${league.name ?? league.league_id}` : "Standings"} />
      <LeaguePicker list={list} selectedId={id} onSelect={setSelected} />
      {!league ? (
        leagues.isLoading ? <LoadingState text="Loading leagues..." /> : <EmptyState text="No leagues yet. Pull down to refresh." icon="trophy-outline" />
      ) : (
        <StateView state={standings} loadingText="Loading standings..." emptyText="No table yet. Matches haven't been played." isEmpty={(d) => !d.table || d.table.length === 0}>
          {(data) => (
            <View style={{ gap: space.md }}>
              <Card style={{ padding: 0 }}>
                <ScrollView horizontal>
                  <View>
                    <View style={[s.row, s.head]}>
                      <Text style={[s.rank, s.headText]}>#</Text>
                      <Text style={[s.team, s.headText]}>Team</Text>
                      {COLS.map((c) => (
                        <Text key={c.key} style={[s.num, s.headText]} accessibilityLabel={c.a11y}>
                          {c.label}
                        </Text>
                      ))}
                      <Text style={[s.status, s.headText]}>Status</Text>
                    </View>
                    {data.table.map((r) => {
                      const q = qualificationLabel(r.status);
                      const name = names[r.team_id] ?? r.team_id;
                      return (
                        <View
                          key={r.team_id}
                          style={s.row}
                          accessible
                          accessibilityLabel={`Rank ${r.rank}, ${name}, ${r.points} points, played ${r.played}, ${q.text}`}
                        >
                          <Text style={s.rank} maxFontSizeMultiplier={1.3}>{r.rank}</Text>
                          <View style={s.team}>
                            <Text style={s.teamText} numberOfLines={1} maxFontSizeMultiplier={1.3}>{name}</Text>
                            {r.resolved_by ? <Text style={ui.small}>Tie-break: {humanize(r.resolved_by)}</Text> : null}
                          </View>
                          {COLS.map((c) => (
                            <Text key={c.key} style={[s.num, c.key === "points" && { fontWeight: "800" }]} maxFontSizeMultiplier={1.3}>
                              {String(r[c.key])}
                            </Text>
                          ))}
                          <View style={s.status}>
                            <StatusChip text={q.text} icon={q.icon} tone={qualTone(r.status)} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              </Card>
              <Text style={ui.small}>
                Top {data.qualification_spots ?? "?"} qualify. Clinched = sure to qualify · Eliminated = cannot qualify · Still possible = depends on remaining matches.
              </Text>
              <SectionHeader title="Matches" />
              {(fixtures.data ?? []).length === 0 ? (
                <EmptyState text="No matches yet." />
              ) : (
                (fixtures.data ?? []).map((f) => {
                  const st = statusLabel(f.status);
                  return (
                    <ListRow
                      key={f.match_id}
                      title={`${teamName(f.home, names)} vs ${teamName(f.away, names)}`}
                      right={<StatusChip text={st.text} icon={st.icon} />}
                      onPress={() => router.push({ pathname: "/match/[matchId]", params: { matchId: f.match_id, leagueId: league.league_id } })}
                    />
                  );
                })
              )}
            </View>
          )}
        </StateView>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", minHeight: 52, borderBottomWidth: 1, borderBottomColor: baseColors.border, paddingHorizontal: space.sm },
  head: { backgroundColor: baseColors.neutralBg, minHeight: 40 },
  headText: { fontWeight: "800", color: baseColors.onSurface },
  rank: { width: 32, fontSize: font.body, color: baseColors.onSurface },
  team: { width: 150, paddingRight: space.sm },
  teamText: { fontSize: font.body, fontWeight: "600", color: baseColors.onSurface },
  num: { width: 44, textAlign: "center", fontSize: font.body, color: baseColors.onSurface },
  status: { width: 150, paddingLeft: space.sm },
});
