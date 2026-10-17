import React, { useMemo } from "react";
import { useTeamNames } from "../../../ui/useTeamNames";
import { useLiveMatch } from "../../../ui/useLiveMatch";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { repo, keys } from "../../../data/repos";
import { PinnedProduct, Score, SportConfig } from "../../../data/types";
import { pendingForTarget } from "../../../data/sync";
import { capabilities } from "../../../core/capabilities";
import { formatMoney } from "../../../core/format";
import { describeEvent, scoreHeadline, statusLabel } from "../../../core/scoreView";
import { useAppStore } from "../../../state/appStore";
import { useCached } from "../../../ui/useCached";
import { Button, Card, EmptyState, Icon, ListRow, Screen, SectionHeader, StateView, StatusChip, styles } from "../../../ui/components";
import { baseColors, font, space } from "../../../ui/theme";

export default function MatchDetail() {
  const params = useLocalSearchParams<{ matchId: string; leagueId?: string }>();
  const matchId = params.matchId;
  const session = useAppStore((s) => s.session);
  const netState = useAppStore((s) => s.netState);
  const dataVersion = useAppStore((s) => s.dataVersion);
  // Live updates: poll the score every 10 s while this screen is open and online.
  const score = useCached<Score>(keys.score(matchId), () => repo.score(matchId), 10000);
  const leagueId = params.leagueId ?? score.data?.league_id ?? undefined;
  const sportId = score.data?.sport_id;
  const sport = useCached<SportConfig>(sportId ? keys.sport(sportId) : null, sportId ? () => repo.sport(sportId) : null);
  const pinned = useCached<PinnedProduct[]>(keys.pinned(matchId), () => repo.pinned(matchId), 30000);
  const nameOf = useTeamNames(leagueId, matchId);
  const pending = useMemo(() => {
    void dataVersion;
    return pendingForTarget(matchId);
  }, [matchId, dataVersion]);
  const canScore = capabilities(session).canScore(leagueId);
  const live = useLiveMatch(matchId, () => {
    score.refresh();
    pinned.refresh();
  });

  return (
    <Screen onRefresh={score.refresh} refreshing={score.isRefreshing}>
      <StateView state={score} loadingText="Loading match..." emptyText="This match has no data yet.">
        {(s) => {
          const st = statusLabel(s.status);
          const model = sport.data?.scoring_model;
          return (
            <View style={{ gap: space.md }}>
              <Card style={{ alignItems: "center" }}>
                <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                  <StatusChip text={st.text} icon={st.icon} tone={s.status === "in_progress" ? "info" : s.status === "completed" ? "success" : "neutral"} />
                  {netState === "online" ? (
                    live === "connected" ? (
                      <StatusChip text="Live" icon="access-point" tone="success" />
                    ) : (
                      <StatusChip text="Reconnecting..." icon="access-point-network-off" tone="warning" />
                    )
                  ) : (
                    <StatusChip text="Offline · saved score" icon="cloud-off-outline" />
                  )}
                </View>
                <Text style={styles.rowTitle}>
                  {nameOf(s.home.team_id)} vs {nameOf(s.away.team_id)}
                </Text>
                <Text
                  style={{ fontSize: font.score, fontWeight: "800", color: baseColors.onSurface, textAlign: "center" }}
                  accessibilityLabel={`Score ${nameOf(s.home.team_id)} ${s.home.score}, ${nameOf(s.away.team_id)} ${s.away.score}`}
                  accessibilityLiveRegion="polite"
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  {scoreHeadline(model, s.home, s.away)}
                </Text>
                {s.status === "completed" ? (
                  <Text style={styles.rowTitle}>
                    {s.winner_team_id ? `Winner: ${nameOf(s.winner_team_id)}` : s.outcome === "draw" ? "Result: draw" : "Result: undecided"}
                  </Text>
                ) : null}
                <Text style={styles.small}>
                  Fair play: {nameOf(s.home.team_id)} {s.home.fair_play} · {nameOf(s.away.team_id)} {s.away.fair_play}
                </Text>
              </Card>
              {canScore ? (
                <Button
                  title="Enter score"
                  icon="scoreboard-outline"
                  onPress={() => router.push({ pathname: "/match/[matchId]/scoring", params: { matchId, leagueId: leagueId ?? "" } })}
                />
              ) : null}
              <SectionHeader title="Timeline" />
              {pending.map((p) => (
                <ListRow key={p.action_id} icon="clock-outline" title={p.summary} right={<StatusChip text="Pending sync" icon="clock-outline" tone="warning" />} />
              ))}
              {s.events.length === 0 && pending.length === 0 ? (
                <EmptyState text="No events yet." icon="timeline-outline" />
              ) : (
                [...s.events].reverse().map((e) => (
                  <ListRow
                    key={e.event_id}
                    icon={e.compensated ? "cancel" : e.type === "compensation" ? "undo-variant" : "circle-medium"}
                    title={`${e.sequence}. ${describeEvent(e.type, e.payload ?? {}, nameOf)}`}
                    subtitle={e.compensated ? `Corrected by ${e.compensated_by}` : undefined}
                    right={e.compensated ? <StatusChip text="Corrected" icon="cancel" tone="danger" /> : undefined}
                  />
                ))
              )}
              <SectionHeader title="Featured products" />
              {(pinned.data ?? []).length === 0 ? (
                <EmptyState text="No products featured for this match." icon="shopping-outline" />
              ) : (
                (pinned.data ?? []).map((p) => (
                  <ListRow
                    key={p.product_id}
                    icon="tshirt-crew-outline"
                    title={p.name}
                    subtitle={p.price_minor != null ? formatMoney(p.price_minor) : undefined}
                    onPress={() => router.push({ pathname: "/product/[productId]", params: { productId: p.product_id } })}
                  />
                ))
              )}
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
                <Icon name="information-outline" size={16} color={baseColors.muted} />
                <Text style={styles.small}>Score updates automatically every few seconds while online.</Text>
              </View>
            </View>
          );
        }}
      </StateView>
    </Screen>
  );
}
