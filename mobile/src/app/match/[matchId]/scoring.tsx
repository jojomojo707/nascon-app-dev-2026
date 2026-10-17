// Scoring entry (organizer / super admin). Buttons are generated from the sport config's
// scoring_events keys; nothing here branches on a sport or event name.
import React, { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { apiPost, routes } from "../../../data/api";
import { repo, keys } from "../../../data/repos";
import { Score, SportConfig } from "../../../data/types";
import { enqueueScoreEvent } from "../../../data/sync";
import { EventBody } from "../../../core/offlineAction";
import { messageForError } from "../../../core/errors";
import { describeEvent, eventButtonLabel, scoreHeadline, statusLabel } from "../../../core/scoreView";
import { toast, useAppStore } from "../../../state/appStore";
import { useCached } from "../../../ui/useCached";
import { Button, Card, confirm, EmptyState, ListRow, Screen, SectionHeader, StateView, StatusChip, styles } from "../../../ui/components";
import { baseColors, radius, space, TAP } from "../../../ui/theme";
import { useTeamNames } from "../../../ui/useTeamNames";

const CORRECTABLE = new Set(["score", "discipline", "tiebreak_winner"]);

export default function ScoringEntry() {
  const { matchId, leagueId } = useLocalSearchParams<{ matchId: string; leagueId?: string }>();
  const session = useAppStore((s) => s.session);
  const netState = useAppStore((s) => s.netState);
  const score = useCached<Score>(keys.score(matchId), () => repo.score(matchId));
  const sportId = score.data?.sport_id;
  const sport = useCached<SportConfig>(sportId ? keys.sport(sportId) : null, sportId ? () => repo.sport(sportId) : null);
  const nameOf = useTeamNames(leagueId || score.data?.league_id || undefined, matchId);
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const online = netState === "online";

  /** Online: POST /events. Offline or network failure: queue in the exact offline-sync format. */
  const send = async (type: string, payload: Record<string, unknown>, summary: string, queueable: boolean) => {
    const body: EventBody = { event_id: "evt-" + Crypto.randomUUID(), match_id: matchId, type, payload };
    const baseVersion = score.data?.version ?? 0;
    if (!online) {
      if (!queueable) return toast("You're offline. Starting or ending a match needs a connection.", "error");
      enqueueScoreEvent(body, baseVersion, summary, session?.user.user_id ?? "");
      return toast("Saved offline. Will sync when you're back online.", "info");
    }
    setBusy(true);
    const res = await apiPost(routes.events, body);
    setBusy(false);
    if (res.ok) {
      toast(`${summary} recorded.`, "success");
      score.refresh();
      return;
    }
    if ((res.error.kind === "offline" || res.error.kind === "timeout") && queueable) {
      enqueueScoreEvent(body, baseVersion, summary, session?.user.user_id ?? "");
      return toast("Couldn't reach the server. Saved offline and will sync later.", "info");
    }
    toast(messageForError(res.error), "error");
  };

  return (
    <Screen onRefresh={score.refresh} refreshing={score.isRefreshing}>
      <StateView state={score} loadingText="Loading match..." emptyText="This match has no data yet.">
        {(s) => {
          const model = sport.data?.scoring_model;
          const events = Object.entries(sport.data?.scoring_events ?? {});
          const st = statusLabel(s.status);
          return (
            <View style={{ gap: space.md }}>
              <Card style={{ alignItems: "center" }}>
                <StatusChip text={st.text} icon={st.icon} tone={s.status === "in_progress" ? "info" : "neutral"} />
                <Text style={[styles.section, { marginTop: 0 }]}>{scoreHeadline(model, s.home, s.away)}</Text>
                <Text style={styles.small}>
                  {nameOf(s.home.team_id)} vs {nameOf(s.away.team_id)}
                </Text>
              </Card>
              {!online ? (
                <Card style={{ backgroundColor: baseColors.warningBg }}>
                  <Text style={{ color: baseColors.warning }}>You're offline. Score events and corrections are saved and sent when you reconnect.</Text>
                </Card>
              ) : null}
              {s.status === "upcoming" ? (
                <Button
                  title="Start match"
                  icon="play"
                  disabled={!online}
                  loading={busy}
                  onPress={() => confirm("Start match?", "The match will go live and scores can be added.", "Start", () => send("match_start", {}, "Match start", false))}
                />
              ) : null}
              {s.status === "in_progress" ? (
                <>
                  {events.length === 0 ? (
                    <EmptyState text={sport.isLoading ? "Loading scoring options..." : "Scoring options aren't available offline yet."} />
                  ) : (
                    [s.home.team_id, s.away.team_id].map((team) => (
                      <View key={team} style={{ gap: space.sm }}>
                        <SectionHeader title={nameOf(team)} />
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                          {events.map(([key, def]) => {
                            const label = eventButtonLabel(model, key, def);
                            return (
                              <Button
                                key={key}
                                title={label}
                                variant="secondary"
                                loading={busy}
                                onPress={() => send("score", { team_id: team, event_type: key }, `${label} for ${nameOf(team)}`, true)}
                                style={{ flexGrow: 1 }}
                              />
                            );
                          })}
                        </View>
                      </View>
                    ))
                  )}
                  <SectionHeader title="Tie-break" />
                  <Text style={styles.small}>Use only when scores are level and the sport needs a winner.</Text>
                  <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                    {[s.home.team_id, s.away.team_id].map((team) => (
                      <Button
                        key={team}
                        title={`${nameOf(team)} won tie-break`}
                        variant="secondary"
                        icon="trophy-outline"
                        onPress={() =>
                          confirm("Record tie-break winner?", `${nameOf(team)} won the tie-break. The score does not change.`, "Record", () =>
                            send("tiebreak_winner", { team_id: team }, `Tie-break won by ${nameOf(team)}`, true),
                          )
                        }
                        style={{ flexGrow: 1 }}
                      />
                    ))}
                  </View>
                  <Button
                    title="End match"
                    icon="flag-checkered"
                    variant="danger"
                    disabled={!online}
                    loading={busy}
                    onPress={() => confirm("End match?", "The result becomes final. Corrections are still possible afterwards.", "End match", () => send("match_end", {}, "Match end", false))}
                  />
                </>
              ) : null}
              <SectionHeader title="Correct an event" />
              <Text style={styles.small}>Corrections add a new event; the original stays in the history.</Text>
              {s.events.filter((e) => CORRECTABLE.has(e.type) && !e.compensated).length === 0 ? (
                <EmptyState text="Nothing to correct yet." icon="undo-variant" />
              ) : (
                s.events
                  .filter((e) => CORRECTABLE.has(e.type) && !e.compensated)
                  .reverse()
                  .map((e) => (
                    <View key={e.event_id} style={{ gap: space.sm }}>
                      <ListRow
                        icon="undo-variant"
                        title={describeEvent(e.type, e.payload ?? {}, nameOf)}
                        subtitle={correcting === e.event_id ? "Enter a reason below" : "Tap to correct"}
                        onPress={() => {
                          setCorrecting(correcting === e.event_id ? null : e.event_id);
                          setReason("");
                        }}
                      />
                      {correcting === e.event_id ? (
                        <Card>
                          <Text style={styles.label}>Reason for correction</Text>
                          <TextInput
                            accessibilityLabel="Reason for correction"
                            value={reason}
                            onChangeText={setReason}
                            placeholder="e.g. Goal disallowed (offside)"
                            placeholderTextColor={baseColors.muted}
                            style={{ minHeight: TAP, borderWidth: 1, borderColor: baseColors.border, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 16 }}
                          />
                          <Button
                            title="Correct event"
                            icon="undo-variant"
                            variant="danger"
                            disabled={!reason.trim()}
                            onPress={() =>
                              confirm("Correct this event?", `"${describeEvent(e.type, e.payload ?? {}, nameOf)}" will no longer count.`, "Correct", () => {
                                send("compensation", { compensates: e.event_id, reason: reason.trim() }, "Correction", true);
                                setCorrecting(null);
                              })
                            }
                          />
                        </Card>
                      ) : null}
                    </View>
                  ))
              )}
            </View>
          );
        }}
      </StateView>
    </Screen>
  );
}
