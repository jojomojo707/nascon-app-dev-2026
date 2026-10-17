import React, { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { apiPost, pingHealth, routes } from "../data/api";
import { getServerUrl, normaliseServerUrl, setServerUrl } from "../data/settings";
import { clearSession } from "../data/session";
import { checkNow } from "../data/connectivity";
import { messageForError } from "../core/errors";
import { capabilities, roleLabel } from "../core/capabilities";
import { toast, useAppStore } from "../state/appStore";
import { Button, Card, confirm, Icon, Screen, SectionHeader, styles, TextField } from "../ui/components";
import { baseColors, space } from "../ui/theme";

export default function Settings() {
  const session = useAppStore((s) => s.session);
  const [url, setUrl] = useState(getServerUrl());
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<null | { ok: boolean; text: string }>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = normaliseServerUrl(url);
    if (!n) return setError("Enter an address like 192.168.1.5:8080 or http://10.0.2.2:8080.");
    setError(null);
    setServerUrl(n);
    setUrl(n);
    setBusy(true);
    const ok = await pingHealth(n);
    setBusy(false);
    setStatus(ok ? { ok, text: "Connected. Server address saved." } : { ok, text: `Saved, but can't reach the server at ${n.replace(/^https?:\/\//, "")}.` });
    checkNow();
  };

  const seed = async () => {
    setBusy(true);
    const res = await apiPost(routes.demoSeed);
    setBusy(false);
    if (res.ok) toast("Demo content created.", "success");
    else toast(messageForError(res.error), "error");
  };

  return (
    <Screen>
      <SectionHeader title="Server address" />
      <Card>
        <Text style={styles.small}>Emulator: 10.0.2.2:8080 · Phone: your laptop's address on the same Wi-Fi.</Text>
        <TextField label="Server address" value={url} onChangeText={setUrl} keyboardType="url" error={error} />
        <Button title="Save and test connection" icon="lan-connect" onPress={save} loading={busy} />
        {status ? (
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }} accessibilityLiveRegion="polite">
            <Icon name={status.ok ? "check-circle-outline" : "alert-circle-outline"} color={status.ok ? baseColors.success : baseColors.danger} />
            <Text style={{ flex: 1, color: status.ok ? baseColors.success : baseColors.danger }}>{status.text}</Text>
          </View>
        ) : null}
      </Card>
      {session ? (
        <>
          <SectionHeader title="Account" />
          <Card>
            <Text style={styles.rowTitle}>{session.user.display_name ?? session.user.email}</Text>
            <Text style={styles.small}>{roleLabel(session.user.role)}</Text>
            {capabilities(session).canSeedDemo ? (
              <Button title="Create demo content" icon="database-plus-outline" variant="secondary" onPress={seed} loading={busy} />
            ) : null}
            <Button
              title="Sign out"
              icon="logout"
              variant="danger"
              onPress={() =>
                confirm("Sign out?", "Saved data on this phone is cleared. Changes waiting to sync are kept.", "Sign out", async () => {
                  await clearSession();
                  router.replace("/login");
                })
              }
            />
          </Card>
        </>
      ) : null}
      <Text style={styles.small}>NaSCon League · version 1.0.0</Text>
    </Screen>
  );
}
