// Receipt: order header in-app, PDF opened in the phone's PDF viewer, Share/Save via the share sheet.
import React from "react";
import { Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import { File } from "expo-file-system";
import { getOrder } from "../../data/store";
import { formatMoney } from "../../core/format";
import { toast } from "../../state/appStore";
import { Button, Card, EmptyState, Screen, StatusChip, styles } from "../../ui/components";
import { baseColors, font } from "../../ui/theme";

export default function Receipt() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const order = getOrder(orderId);
  if (!order) return <Screen><EmptyState text="This receipt isn't on this phone." icon="receipt" /></Screen>;
  const data = JSON.parse(order.json) as { subtotal_minor: number; discount_minor: number; total_minor: number; receipt?: { signature?: string } };

  const open = async () => {
    if (!order.pdf_path) return toast("The receipt file isn't available.", "error");
    try {
      const file = new File(order.pdf_path);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", { data: file.contentUri, flags: 1, type: "application/pdf" });
    } catch {
      toast("No PDF viewer found. Use Share or save instead.", "error");
    }
  };

  const share = async () => {
    if (!order.pdf_path) return toast("The receipt file isn't available.", "error");
    try {
      await Sharing.shareAsync(order.pdf_path, { mimeType: "application/pdf", dialogTitle: "Save or share receipt", UTI: "com.adobe.pdf" });
    } catch {
      toast("Sharing isn't available on this phone.", "error");
    }
  };

  return (
    <Screen>
      <Card>
        <StatusChip text="Paid" icon="check-circle-outline" tone="success" />
        <Text style={styles.rowTitle}>Order {order.order_id}</Text>
        <Text style={{ fontSize: font.h1, fontWeight: "800", color: baseColors.onSurface }}>{formatMoney(order.total_minor)}</Text>
        <Text style={styles.small}>
          Subtotal {formatMoney(data.subtotal_minor)} · Discount {formatMoney(data.discount_minor)}
        </Text>
        {order.paid_at ? <Text style={styles.small}>Paid at {new Date(order.paid_at).toLocaleString()}</Text> : null}
        {data.receipt?.signature ? <Text style={styles.small} numberOfLines={1}>Signed receipt · {data.receipt.signature.slice(0, 16)}…</Text> : null}
      </Card>
      <Button title="View receipt (PDF)" icon="file-pdf-box" onPress={open} />
      <Button title="Download or share" icon="download-outline" variant="secondary" onPress={share} />
    </Screen>
  );
}
