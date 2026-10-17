// League selector shared by Fixtures and Standings (selection kept in appStore).
import React, { useEffect } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { repo, keys } from "../data/repos";
import { League } from "../data/types";
import { useAppStore } from "../state/appStore";
import { useCached } from "./useCached";
import { Icon, styles } from "./components";
import { baseColors, radius, space, TAP, useColors } from "./theme";

export function useSelectedLeague() {
  const leagues = useCached<League[]>(keys.leagues, repo.leagues);
  const selected = useAppStore((s) => s.selectedLeagueId);
  const setSelected = useAppStore((s) => s.setSelectedLeagueId);
  const list = leagues.data ?? [];
  useEffect(() => {
    if (list.length > 0 && (!selected || !list.some((l) => l.league_id === selected))) setSelected(list[0].league_id);
  }, [list.length, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const league = list.find((l) => l.league_id === selected) ?? null;
  return { leagues, list, league, setSelected };
}

export function LeaguePicker({ list, selectedId, onSelect }: { list: League[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const c = useColors();
  if (list.length <= 1) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} accessibilityLabel="Choose a league">
      {list.map((l) => {
        const sel = l.league_id === selectedId;
        return (
          <Pressable
            key={l.league_id}
            accessibilityRole="button"
            accessibilityState={{ selected: sel }}
            accessibilityLabel={`League ${l.name ?? l.league_id}${sel ? ", selected" : ""}`}
            onPress={() => onSelect(l.league_id)}
            style={{
              minHeight: TAP,
              paddingHorizontal: space.lg,
              borderRadius: radius.lg,
              borderWidth: 2,
              borderColor: c.primary,
              backgroundColor: sel ? c.primary : baseColors.surface,
              flexDirection: "row",
              alignItems: "center",
              gap: space.xs,
            }}
          >
            {sel ? <Icon name="check" size={18} color={c.onPrimary} /> : null}
            <Text style={[styles.rowTitle, { color: sel ? c.onPrimary : c.primary }]}>{l.name ?? l.league_id}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
