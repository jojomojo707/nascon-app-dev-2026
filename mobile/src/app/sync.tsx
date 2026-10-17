import React from "react";
import { Text } from "react-native";
import { clearResults, listPending, listResults, messageForCode, requestSync } from "../data/sync";
import { checkNow } from "../data/connectivity";
import { describeResult } from "../core/offlineAction";
import { useAppStore } from "../state/appStore";
import { Button, Card, EmptyState, ListRow, Screen, SectionHeader, StatusChip, styles } from "../ui/components";

export default function SyncStatus() {
  useAppStore((s) => s.dataVersion);
  const netState = useAppStore((s) => s.netState);
  const syncing = useAppStore((s) => s.syncing);
  const pending = listPending();
  const results = listResults();
  return (
    <Screen>
      <Card>
        <StatusChip
          text={netState === "offline" ? "Offline" : syncing ? "Syncing..." : "Online"}
          icon={netState === "offline" ? "cloud-off-outline" : syncing ? "sync" : "cloud-check-outline"}
          tone={netState === "offline" ? "neutral" : syncing ? "info" : "success"}
        />
        <Text style={styles.muted}>
          {netState === "offline"
            ? "Changes are saved on this phone and sent automatically when you're back online."
            : "Changes are sent automatically. You can also sync now."}
        </Text>
        <Button
          title="Sync now"
          icon="sync"
          loading={syncing}
          disabled={pending.length === 0}
          onPress={async () => {
            await checkNow();
            requestSync();
          }}
        />
      </Card>
      <SectionHeader title={`Waiting to sync (${pending.length})`} />
      {pending.length === 0 ? (
        <EmptyState text="No pending changes." icon="check-all" />
      ) : (
        pending.map((p) => (
          <ListRow
            key={p.action_id}
            icon="clock-outline"
            title={p.summary}
            subtitle={`Saved ${new Date(p.queued_at).toLocaleTimeString()}${p.last_error ? " · " + p.last_error : ""}`}
            right={<StatusChip text={p.state === "SENDING" ? "Sending" : "Pending"} icon="clock-outline" tone="warning" />}
          />
        ))
      )}
      <SectionHeader title="Recent results" />
      {results.length === 0 ? (
        <EmptyState text="No sync results yet." icon="history" />
      ) : (
        <>
          {results.map((r) => {
            const d = describeResult({ status: r.status as "applied", resolution: r.resolution as "appended", error_code: r.error_code }, messageForCode);
            return (
              <ListRow
                key={r.action_id}
                icon={d.icon}
                title={r.summary}
                subtitle={d.detail}
                right={<StatusChip text={d.label} icon={d.icon} tone={r.status === "rejected" ? "danger" : "success"} />}
              />
            );
          })}
          <Button title="Clear results" icon="broom" variant="ghost" onPress={clearResults} />
        </>
      )}
    </Screen>
  );
}
