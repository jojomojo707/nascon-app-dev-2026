import React from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { repo, keys } from "../../data/repos";
import { History } from "../../data/types";
import { humanize } from "../../core/format";
import { useCached } from "../../ui/useCached";
import { Card, ListRow, Screen, SectionHeader, StateView, StatusChip, styles } from "../../ui/components";
import { Text } from "react-native";
import { space } from "../../ui/theme";

const ICONS: Record<string, string> = { transfer: "swap-horizontal", loan: "account-arrow-right-outline", release: "account-remove-outline", loan_return: "keyboard-return" };

export default function PlayerHistory() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const history = useCached<History>(keys.history(playerId), () => repo.history(playerId));
  return (
    <Screen onRefresh={history.refresh} refreshing={history.isRefreshing}>
      <StateView state={history} loadingText="Loading history..." emptyText="No history yet.">
        {(h) => (
          <View style={{ gap: space.sm }}>
            <Card>
              <Text style={styles.rowTitle}>Player {h.player_id}</Text>
              <Text style={styles.small}>Current squad: {h.current_squad_id ?? "None (released)"}</Text>
              {h.parent_squad_id ? <Text style={styles.small}>On loan from: {h.parent_squad_id}</Text> : null}
            </Card>
            <SectionHeader title="Roster changes (oldest first)" />
            {h.history.length === 0 ? (
              <Text style={styles.muted}>No roster changes recorded.</Text>
            ) : (
              h.history.map((e) => (
                <ListRow
                  key={e.audit_id}
                  icon={ICONS[e.action] ?? "history"}
                  title={`${humanize(e.action)}${e.to_squad_id ? " → " + e.to_squad_id : ""}`}
                  subtitle={`${e.effective_date ?? ""} · by ${e.who ?? "?"}${e.why ? " · " + e.why : ""}`}
                  right={e.state === "deferred_until_match_end" ? <StatusChip text="After match" icon="clock-outline" tone="warning" /> : undefined}
                />
              ))
            )}
          </View>
        )}
      </StateView>
    </Screen>
  );
}
