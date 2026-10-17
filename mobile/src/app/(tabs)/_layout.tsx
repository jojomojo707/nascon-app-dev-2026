import React from "react";
import { Redirect, Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAppStore } from "../../state/appStore";
import { baseColors, useColors } from "../../ui/theme";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

const tab = (title: string, icon: IconName) => ({
  title,
  tabBarLabel: title,
  tabBarAccessibilityLabel: `${title} tab`,
  tabBarIcon: ({ color, size }: { color: unknown; size: number }) => (
    <MaterialCommunityIcons name={icon} color={typeof color === "string" ? color : baseColors.muted} size={size} />
  ),
});

export default function TabsLayout() {
  const session = useAppStore((s) => s.session);
  const c = useColors();
  if (!session) return <Redirect href="/login" />;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.primary },
        headerTintColor: c.onPrimary,
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: baseColors.muted,
        tabBarLabelStyle: { fontSize: 13, fontWeight: "600" },
        tabBarStyle: { minHeight: 60 },
      }}
    >
      <Tabs.Screen name="fixtures" options={tab("Fixtures", "calendar-month-outline")} />
      <Tabs.Screen name="standings" options={tab("Standings", "format-list-numbered")} />
      <Tabs.Screen name="store" options={tab("Store", "shopping-outline")} />
      <Tabs.Screen name="club" options={tab("Club", "shield-account-outline")} />
      <Tabs.Screen name="more" options={tab("More", "dots-horizontal-circle-outline")} />
    </Tabs>
  );
}
