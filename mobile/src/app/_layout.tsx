import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { getDb } from "../data/db";
import { loadSession } from "../data/session";
import { startConnectivityMonitor } from "../data/connectivity";
import { refreshCounts, requestSync } from "../data/sync";
import { Button, ConnectivityBanner, LoadingState, ToastHost } from "../ui/components";
import { baseColors, useColors } from "../ui/theme";

export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>Something went wrong</Text>
      <Text style={{ fontSize: 16, textAlign: "center" }}>The screen could not be shown. Please try again.</Text>
      <Button title="Try again" icon="refresh" onPress={() => retry()} />
      {__DEV__ ? <Text>{error.message}</Text> : null}
    </View>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const c = useColors();

  useEffect(() => {
    (async () => {
      getDb();
      refreshCounts();
      await loadSession();
      setReady(true);
      startConnectivityMonitor();
      requestSync();
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.primary }} edges={["top"]}>
        <StatusBar style="light" />
        <ConnectivityBanner />
        <View style={{ flex: 1, backgroundColor: baseColors.background }}>
          {ready ? (
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: c.primary },
                headerTintColor: c.onPrimary,
                headerTitleStyle: { fontWeight: "700" },
                contentStyle: { backgroundColor: baseColors.background },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="login" options={{ title: "Sign in", headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="settings" options={{ title: "Settings" }} />
              <Stack.Screen name="sync" options={{ title: "Sync status" }} />
              <Stack.Screen name="match/[matchId]/index" options={{ title: "Match" }} />
              <Stack.Screen name="match/[matchId]/scoring" options={{ title: "Enter score" }} />
              <Stack.Screen name="product/[productId]" options={{ title: "Product" }} />
              <Stack.Screen name="cart" options={{ title: "Cart" }} />
              <Stack.Screen name="checkout" options={{ title: "Checkout" }} />
              <Stack.Screen name="receipt/[orderId]" options={{ title: "Receipt" }} />
              <Stack.Screen name="orders" options={{ title: "Orders and receipts" }} />
              <Stack.Screen name="roster/[clubId]" options={{ title: "Manage roster" }} />
              <Stack.Screen name="player/[playerId]" options={{ title: "Player history" }} />
            </Stack>
          ) : (
            <LoadingState text="Starting..." />
          )}
          <ToastHost />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
