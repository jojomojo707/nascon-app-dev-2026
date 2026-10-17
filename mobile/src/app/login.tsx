import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { apiPost, routes } from "../data/api";
import { saveSession } from "../data/session";
import { getServerUrl } from "../data/settings";
import { messageForError } from "../core/errors";
import { Session } from "../state/appStore";
import { Button, Card, Icon, Screen, styles, TextField } from "../ui/components";
import { baseColors, font, space, TAP, useColors } from "../ui/theme";
import { requestSync } from "../data/sync";

type LoginResponse = Session & { token: string };

export default function Login() {
  const c = useColors();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Please enter a valid email address.");
    if (!password) return setError("Please enter your password.");
    setBusy(true);
    const res = await apiPost<LoginResponse>(routes.login, { email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (!res.ok) {
      if (res.error.kind === "unauthenticated" || res.error.kind === "validation") {
        return setError("Email or password is incorrect.");
      }
      if (res.error.kind === "offline" || res.error.kind === "timeout") {
        return setError(`Can't reach the server at ${getServerUrl().replace(/^https?:\/\//, "")}. Check the server address.`);
      }
      return setError(messageForError(res.error));
    }
    const { token, user, tenant, expires_at } = res.data;
    if (!token || !user) return setError("The server sent an unexpected reply. Please try again.");
    await saveSession(token, { user, tenant: tenant ?? null, expires_at });
    requestSync();
    router.replace("/fixtures");
  };

  return (
    <Screen>
      <View style={{ alignItems: "center", gap: space.sm, marginTop: space.xl }}>
        <Icon name="trophy-outline" size={56} color={c.primary} label="NaSCon League logo" />
        <Text style={{ fontSize: font.h1, fontWeight: "800", color: baseColors.onSurface }} accessibilityRole="header">
          NaSCon League
        </Text>
        <Text style={styles.muted}>Sign in to follow fixtures, standings and your club.</Text>
      </View>
      <Card>
        <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="name@example.com" />
        <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry={!show} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={show ? "Hide password" : "Show password"}
          onPress={() => setShow(!show)}
          style={{ minHeight: TAP, flexDirection: "row", alignItems: "center", gap: space.sm }}
        >
          <Icon name={show ? "eye-off-outline" : "eye-outline"} color={c.primary} />
          <Text style={{ color: c.primary, fontWeight: "600", fontSize: font.body }}>{show ? "Hide password" : "Show password"}</Text>
        </Pressable>
        {error ? (
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }} accessibilityLiveRegion="assertive">
            <Icon name="alert-circle-outline" color={baseColors.danger} />
            <Text style={{ color: baseColors.danger, fontSize: font.body, flex: 1 }}>{error}</Text>
          </View>
        ) : null}
        <Button title="Sign in" icon="login" onPress={submit} loading={busy} />
      </Card>
      <Button
        title={`Server: ${getServerUrl().replace(/^https?:\/\//, "")} (change)`}
        icon="server-network"
        variant="ghost"
        onPress={() => router.push("/settings")}
      />
      <Card>
        <Text style={styles.label}>Demo accounts (password Nascon@26)</Text>
        {["admin", "organizer", "manager", "player", "viewer"].map((r) => (
          <Pressable
            key={r}
            accessibilityRole="button"
            accessibilityLabel={`Use demo account ${r}@nascon.test`}
            onPress={() => {
              setEmail(`${r}@nascon.test`);
              setPassword("Nascon@26");
            }}
            style={{ minHeight: TAP, justifyContent: "center" }}
          >
            <Text style={{ color: c.primary, fontSize: font.body }}>{r}@nascon.test</Text>
          </Pressable>
        ))}
      </Card>
    </Screen>
  );
}
