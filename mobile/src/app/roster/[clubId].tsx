import React, { useMemo, useState } from "react";
import { Modal, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { apiPost, routes } from "../../data/api";
import { cacheGet } from "../../data/db";
import { repo, keys } from "../../data/repos";
import { Club, History, RosterPlayer, Squad } from "../../data/types";
import { enqueueRosterTransfer, listPending } from "../../data/sync";
import { TransferBody } from "../../core/offlineAction";
import { messageForError } from "../../core/errors";
import { humanize, isValidDate, todayDate } from "../../core/format";
import { toast, useAppStore } from "../../state/appStore";
import { useCached } from "../../ui/useCached";
import { Button, Card, confirm, EmptyState, ListRow, OptionList, Screen, SectionHeader, StateView, StatusChip, styles, TextField } from "../../ui/components";
import { baseColors, radius, space } from "../../ui/theme";

type Kind = "transfer" | "loan" | "release";

export default function RosterManagement() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const session = useAppStore((s) => s.session);
  const netState = useAppStore((s) => s.netState);
  const dataVersion = useAppStore((s) => s.dataVersion);
  const club = useCached<Club>(keys.club(clubId), () => repo.club(clubId));
  const [player, setPlayer] = useState<RosterPlayer | null>(null);

  const pendingIds = useMemo(() => {
    void dataVersion;
    return new Set(listPending().filter((p) => p.type === "roster_transfer").map((p) => p.target_id));
  }, [dataVersion]);

  return (
    <Screen onRefresh={club.refresh} refreshing={club.isRefreshing}>
      <StateView state={club} loadingText="Loading roster..." emptyText="No roster yet." isEmpty={(c) => (c.roster ?? []).length === 0}>
        {(c) => (
          <View style={{ gap: space.sm }}>
            <SectionHeader title={`${c.name} · players`} />
            <Text style={styles.small}>Tap a player to transfer, loan or release them.</Text>
            {(c.roster ?? []).map((p) => (
              <ListRow
                key={p.player_id}
                icon="account-outline"
                title={p.name}
                subtitle={[p.position ? humanize(p.position) : null, p.role ? humanize(p.role) : null].filter(Boolean).join(" · ")}
                right={
                  pendingIds.has(p.player_id) ? (
                    <StatusChip text="Pending sync" icon="clock-outline" tone="warning" />
                  ) : p.on_loan ? (
                    <StatusChip text="On loan" icon="account-arrow-right-outline" tone="info" />
                  ) : undefined
                }
                onPress={() => setPlayer(p)}
              />
            ))}
          </View>
        )}
      </StateView>
      {player ? (
        <RosterActionSheet
          player={player}
          clubName={club.data?.name ?? ""}
          online={netState === "online"}
          userId={session?.user.user_id ?? "unknown"}
          onClose={() => setPlayer(null)}
          onDone={() => {
            setPlayer(null);
            club.refresh();
          }}
        />
      ) : null}
    </Screen>
  );
}

function RosterActionSheet({
  player,
  clubName,
  online,
  userId,
  onClose,
  onDone,
}: {
  player: RosterPlayer;
  clubName: string;
  online: boolean;
  userId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const leagueId = player.league_id ?? "";
  const squads = useCached<Squad[]>(leagueId ? keys.squads(leagueId) : null, leagueId ? () => repo.squads(leagueId) : null);
  const [kind, setKind] = useState<Kind>("transfer");
  const [to, setTo] = useState<string | null>(null);
  const [effective, setEffective] = useState(todayDate());
  const [loanEnd, setLoanEnd] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const targets = (squads.data ?? []).filter((s) => s.squad_id !== player.squad_id);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (kind !== "release" && !to) e.to = "Choose the destination squad.";
    if (!isValidDate(effective)) e.effective = "Use the format YYYY-MM-DD.";
    if (kind === "loan") {
      if (!isValidDate(loanEnd)) e.loanEnd = "Use the format YYYY-MM-DD.";
      else if (loanEnd <= effective) e.loanEnd = "The loan must end after it starts.";
    }
    if (!reason.trim()) e.reason = "Please give a reason.";
    if (!player.squad_id || !leagueId) e.to = "This player's squad is unknown. Refresh the roster and try again.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    const body: TransferBody = {
      request_id: "tr-" + Crypto.randomUUID(),
      league_id: leagueId,
      player_id: player.player_id,
      type: kind,
      from_squad_id: player.squad_id ?? "",
      to_squad_id: kind === "release" ? null : to,
      effective_date: effective,
      loan_end_date: kind === "loan" ? loanEnd : null,
      reason: reason.trim(),
      requested_by: userId,
    };
    const history = cacheGet<History>(keys.history(player.player_id));
    const baseVersion = history?.data.history.length ?? 0;
    const summary = `${humanize(kind)} ${player.name}${to ? " to " + (targets.find((t) => t.squad_id === to)?.name ?? to) : ""}`;
    if (!online) {
      enqueueRosterTransfer(body, baseVersion, summary, userId);
      toast("Saved offline. Will sync when you're back online.", "info");
      return onDone();
    }
    setBusy(true);
    const res = await apiPost<{ state?: string; blocking_match_id?: string | null }>(routes.rosterTransfer, body);
    setBusy(false);
    if (res.ok) {
      if (res.data?.state === "deferred_until_match_end") {
        toast(`Accepted. Takes effect after match ${res.data.blocking_match_id ?? ""} ends.`, "success");
      } else {
        toast(`${humanize(kind)} done for ${player.name}.`, "success");
      }
      repo.history(player.player_id);
      return onDone();
    }
    if (res.error.kind === "offline" || res.error.kind === "timeout") {
      enqueueRosterTransfer(body, baseVersion, summary, userId);
      toast("Couldn't reach the server. Saved offline and will sync later.", "info");
      return onDone();
    }
    toast(messageForError(res.error), "error");
  };

  const ask = () => {
    if (!validate()) return;
    const dest = targets.find((t) => t.squad_id === to)?.name ?? to;
    const msg =
      kind === "release"
        ? `Release ${player.name} from ${clubName}? They will leave the league.`
        : kind === "loan"
          ? `Loan ${player.name} to ${dest} from ${effective} to ${loanEnd}?`
          : `Transfer ${player.name} permanently to ${dest}?`;
    confirm(`${humanize(kind)} player?`, msg, humanize(kind), submit);
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: baseColors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "92%" }}>
          <Screen>
            <SectionHeader title={player.name} />
            {!online ? (
              <Card style={{ backgroundColor: baseColors.warningBg }}>
                <Text style={{ color: baseColors.warning }}>You're offline. This change will be saved and sent when you reconnect.</Text>
              </Card>
            ) : null}
            <OptionList<Kind>
              label="Action"
              value={kind}
              onChange={setKind}
              options={[
                { value: "transfer", label: "Transfer (permanent)" },
                { value: "loan", label: "Loan (with end date)" },
                { value: "release", label: "Release from the league" },
              ]}
            />
            {kind !== "release" ? (
              targets.length === 0 ? (
                <EmptyState text={squads.isLoading ? "Loading squads..." : "No other squads available (connect once to load them)."} icon="account-group-outline" />
              ) : (
                <OptionList<string>
                  label="Destination squad"
                  value={to}
                  onChange={setTo}
                  options={targets.map((t) => ({ value: t.squad_id, label: t.name ?? t.squad_id, hint: t.size != null ? `${t.size} players` : undefined }))}
                />
              )
            ) : null}
            {errors.to ? <Text style={{ color: baseColors.danger }}>{errors.to}</Text> : null}
            <TextField label="Effective date (YYYY-MM-DD)" value={effective} onChangeText={setEffective} error={errors.effective} />
            {kind === "loan" ? <TextField label="Loan end date (YYYY-MM-DD)" value={loanEnd} onChangeText={setLoanEnd} error={errors.loanEnd} /> : null}
            <TextField label="Reason" value={reason} onChangeText={setReason} error={errors.reason} autoCapitalize="sentences" />
            <View style={{ gap: space.sm }}>
              <Button title={online ? `${humanize(kind)} player` : `Save ${kind} offline`} icon="check" onPress={ask} loading={busy} variant={kind === "release" ? "danger" : "primary"} />
              <Button
                title="View history"
                icon="history"
                variant="secondary"
                onPress={() => {
                  onClose();
                  router.push({ pathname: "/player/[playerId]", params: { playerId: player.player_id } });
                }}
              />
              <Button title="Cancel" variant="ghost" onPress={onClose} />
            </View>
          </Screen>
        </View>
      </View>
    </Modal>
  );
}
