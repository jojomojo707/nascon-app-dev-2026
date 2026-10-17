import React, { useState } from "react";
import { Image, Linking, Text, View } from "react-native";
import { router } from "expo-router";
import { repo, keys } from "../../data/repos";
import { Club, ClubSummary, RosterPlayer } from "../../data/types";
import { capabilities } from "../../core/capabilities";
import { humanize } from "../../core/format";
import { useAppStore } from "../../state/appStore";
import { useCached } from "../../ui/useCached";
import { Button, Card, EmptyState, Icon, ListRow, Screen, SectionHeader, StateView, styles, TenantHeader } from "../../ui/components";
import { baseColors, space } from "../../ui/theme";

function groupByPosition(roster: RosterPlayer[]): [string, RosterPlayer[]][] {
  const m = new Map<string, RosterPlayer[]>();
  for (const p of roster) {
    const k = p.position ?? "other";
    m.set(k, [...(m.get(k) ?? []), p]);
  }
  return [...m.entries()];
}

export default function ClubTab() {
  const session = useAppStore((s) => s.session);
  const caps = capabilities(session);
  const [picked, setPicked] = useState<string | null>(session?.user.club_id ?? null);
  const clubs = useCached<ClubSummary[]>(keys.clubs, repo.clubs);
  const clubId = picked;
  const club = useCached<Club>(clubId ? keys.club(clubId) : null, clubId ? () => repo.club(clubId) : null);

  if (!clubId) {
    return (
      <Screen onRefresh={clubs.refresh} refreshing={clubs.isRefreshing}>
        <TenantHeader subtitle="Clubs" />
        <StateView state={clubs} loadingText="Loading clubs..." emptyText="No clubs yet." isEmpty={(d) => d.length === 0}>
          {(data) => (
            <View style={{ gap: space.sm }}>
              {data.map((c) => (
                <ListRow key={c.club_id} icon="shield-outline" title={c.name} onPress={() => setPicked(c.club_id)} />
              ))}
            </View>
          )}
        </StateView>
      </Screen>
    );
  }

  return (
    <Screen onRefresh={club.refresh} refreshing={club.isRefreshing}>
      <TenantHeader subtitle="Club profile" />
      {!session?.user.club_id || (clubs.data ?? []).length > 1 ? (
        <Button title="All clubs" icon="arrow-left" variant="ghost" onPress={() => setPicked(null)} />
      ) : null}
      <StateView state={club} loadingText="Loading club..." emptyText="Club details aren't available yet.">
        {(c) => {
          const roster = c.roster ?? [];
          const v = c.home_venue;
          return (
            <View style={{ gap: space.md }}>
              <Card>
                <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
                  {c.logo_url ? (
                    <Image source={{ uri: c.logo_url }} style={{ width: 56, height: 56, borderRadius: 28 }} accessibilityLabel={`${c.name} logo`} />
                  ) : (
                    <Icon name="shield-outline" size={48} color={baseColors.muted} label="Club badge" />
                  )}
                  <Text style={[styles.section, { flex: 1, marginTop: 0 }]} accessibilityRole="header">
                    {c.name}
                  </Text>
                </View>
                {v ? (
                  <>
                    <Text style={styles.rowTitle}>Home venue: {v.name ?? "Unknown"}</Text>
                    {v.lat != null && v.lng != null ? (
                      <>
                        <Text style={styles.small}>
                          Coordinates: {v.lat}, {v.lng}
                        </Text>
                        <Button
                          title="Open in Maps"
                          icon="map-marker-outline"
                          variant="secondary"
                          onPress={() => Linking.openURL(`geo:${v.lat},${v.lng}?q=${v.lat},${v.lng}(${encodeURIComponent(v.name ?? c.name)})`)}
                        />
                      </>
                    ) : null}
                  </>
                ) : null}
                {c.socials && Object.keys(c.socials).length > 0 ? (
                  <Text style={styles.small}>
                    {Object.entries(c.socials)
                      .map(([k, val]) => `${humanize(k)}: ${val}`)
                      .join(" · ")}
                  </Text>
                ) : null}
              </Card>
              {caps.canManageRoster(c.club_id) ? (
                <Button title="Manage roster" icon="account-switch-outline" onPress={() => router.push({ pathname: "/roster/[clubId]", params: { clubId: c.club_id } })} />
              ) : null}
              <SectionHeader title="Staff" />
              {(c.staff ?? []).length === 0 ? (
                <EmptyState text="No staff listed." icon="account-tie-outline" />
              ) : (
                (c.staff ?? []).map((s, i) => <ListRow key={i} icon="account-tie-outline" title={s.name} subtitle={humanize(s.role)} />)
              )}
              <SectionHeader title="Roster" />
              {roster.length === 0 ? (
                <EmptyState text="No players registered yet." icon="account-group-outline" />
              ) : (
                groupByPosition(roster).map(([pos, players]) => (
                  <View key={pos} style={{ gap: space.sm }}>
                    <Text style={styles.label}>{humanize(pos)}</Text>
                    {players.map((p) => (
                      <ListRow
                        key={p.player_id}
                        icon="account-outline"
                        title={p.name}
                        subtitle={p.role ? humanize(p.role) : undefined}
                        onPress={
                          caps.canSeeHistory(c.club_id, p.player_id)
                            ? () => router.push({ pathname: "/player/[playerId]", params: { playerId: p.player_id } })
                            : undefined
                        }
                      />
                    ))}
                  </View>
                ))
              )}
              <SectionHeader title="Season record" />
              {(c.season_stats ?? []).length === 0 ? (
                <EmptyState text="No past seasons yet." icon="chart-bar" />
              ) : (
                (c.season_stats ?? []).map((s) => (
                  <ListRow key={s.season} icon="chart-bar" title={s.season} subtitle={`Played ${s.played} · Won ${s.won} · Drawn ${s.drawn} · Lost ${s.lost}`} />
                ))
              )}
            </View>
          );
        }}
      </StateView>
    </Screen>
  );
}
