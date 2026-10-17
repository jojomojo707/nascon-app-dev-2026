import React, { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { checkout, cartPreview, listCart } from "../data/store";
import { repo } from "../data/repos";
import { formatMoney } from "../core/format";
import { messageForError } from "../core/errors";
import { toast, useAppStore } from "../state/appStore";
import { Button, Card, confirm, EmptyState, Icon, OptionList, Screen, SectionHeader, styles, TextField } from "../ui/components";
import { baseColors, font, space } from "../ui/theme";

type Tok = "tok_success" | "tok_declined" | "tok_capture_fail";

export default function Checkout() {
  const session = useAppStore((s) => s.session);
  const netState = useAppStore((s) => s.netState);
  useAppStore((s) => s.dataVersion);
  const lines = listCart();
  const [code, setCode] = useState("");
  const [token, setToken] = useState<Tok>("tok_success");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const p = cartPreview(lines, code);
  const online = netState === "online";

  if (lines.length === 0) return <Screen><EmptyState text="Your cart is empty." icon="cart-outline" /></Screen>;

  const pay = async () => {
    setError(null);
    setCodeError(null);
    setBusy(true);
    const res = await checkout(session?.user.user_id ?? "guest", lines, code, token);
    setBusy(false);
    if (res.ok) {
      toast("Payment successful.", "success");
      repo.products();
      router.replace({ pathname: "/receipt/[orderId]", params: { orderId: res.data.order_id } });
      return;
    }
    if ("code" in res.error && res.error.code === "INVALID_DISCOUNT_CODE") return setCodeError(messageForError(res.error));
    if (res.error.kind === "conflict" && res.error.code === "OUT_OF_STOCK") repo.products();
    if (res.error.kind === "timeout") return setError("Checking your order took too long. Tap Pay again — you won't be charged twice.");
    setError(messageForError(res.error));
  };

  return (
    <Screen>
      <SectionHeader title="Order summary" />
      <Card>
        {lines.map((l) => (
          <Text key={l.variant_id} style={styles.muted}>
            {l.quantity} × {l.label} — {formatMoney(l.price_minor * l.quantity)}
          </Text>
        ))}
        <Text style={styles.rowTitle}>Subtotal: {formatMoney(p.subtotal)}</Text>
        {p.discount > 0 ? <Text style={{ color: baseColors.success, fontSize: font.body }}>Discount: −{formatMoney(p.discount)}</Text> : null}
        <Text style={{ fontSize: font.h1, fontWeight: "800", color: baseColors.onSurface }}>Total: {formatMoney(p.total)}</Text>
      </Card>
      <TextField label="Discount code (optional)" value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="e.g. WELCOME10" error={codeError} />
      <OptionList<Tok>
        label="Payment method (test cards)"
        value={token}
        onChange={setToken}
        options={[
          { value: "tok_success", label: "Test card: success" },
          { value: "tok_declined", label: "Test card: declined" },
          { value: "tok_capture_fail", label: "Test card: capture fails" },
        ]}
      />
      {error ? (
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }} accessibilityLiveRegion="assertive">
          <Icon name="alert-circle-outline" color={baseColors.danger} />
          <Text style={{ color: baseColors.danger, fontSize: font.body, flex: 1 }}>{error}</Text>
        </View>
      ) : null}
      {!online ? <Text style={{ color: baseColors.warning, fontSize: font.body }}>You're offline. Paying needs a connection.</Text> : null}
      <Button
        title={`Pay ${formatMoney(p.total)}`}
        icon="lock-outline"
        disabled={!online}
        loading={busy}
        onPress={() => confirm("Confirm payment", `Pay ${formatMoney(p.total)} with the selected test card?`, "Pay", pay)}
      />
    </Screen>
  );
}
