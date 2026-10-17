import React from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { listCart, setQuantity, cartPreview } from "../data/store";
import { formatMoney } from "../core/format";
import { useAppStore } from "../state/appStore";
import { Button, Card, EmptyState, Screen, SectionHeader, styles } from "../ui/components";
import { space } from "../ui/theme";

export default function Cart() {
  const dataVersion = useAppStore((s) => s.dataVersion);
  void dataVersion;
  const lines = listCart();
  const p = cartPreview(lines, "");
  if (lines.length === 0) {
    return (
      <Screen>
        <EmptyState text="Your cart is empty." icon="cart-outline" action={<Button title="Browse the store" icon="shopping-outline" onPress={() => router.replace("/store")} />} />
      </Screen>
    );
  }
  return (
    <Screen>
      <SectionHeader title="Your cart" />
      {lines.map((l) => (
        <Card key={l.variant_id}>
          <Text style={styles.rowTitle}>{l.label}</Text>
          <Text style={styles.small}>
            {formatMoney(l.price_minor)} each · {l.quantity} × = {formatMoney(l.price_minor * l.quantity)}
          </Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Button title="One less" icon="minus" variant="secondary" onPress={() => setQuantity(l.variant_id, l.quantity - 1)} style={{ flex: 1 }} />
            <Button title="One more" icon="plus" variant="secondary" disabled={l.quantity >= 10} onPress={() => setQuantity(l.variant_id, l.quantity + 1)} style={{ flex: 1 }} />
          </View>
        </Card>
      ))}
      <Card>
        <Text style={styles.rowTitle}>Subtotal: {formatMoney(p.subtotal)}</Text>
        <Text style={styles.small}>Discount codes are applied at checkout.</Text>
      </Card>
      <Button title="Continue to checkout" icon="credit-card-outline" onPress={() => router.push("/checkout")} />
    </Screen>
  );
}
