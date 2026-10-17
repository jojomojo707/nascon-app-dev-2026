import React from "react";
import { router } from "expo-router";
import { listOrders } from "../data/store";
import { formatMoney } from "../core/format";
import { useAppStore } from "../state/appStore";
import { EmptyState, ListRow, Screen } from "../ui/components";

export default function Orders() {
  useAppStore((s) => s.dataVersion);
  const orders = listOrders();
  return (
    <Screen>
      {orders.length === 0 ? (
        <EmptyState text="No orders yet. Paid orders appear here." icon="receipt" />
      ) : (
        orders.map((o) => (
          <ListRow
            key={o.order_id}
            icon="receipt"
            title={`${formatMoney(o.total_minor)} · ${o.status}`}
            subtitle={`${o.order_id}${o.paid_at ? " · " + new Date(o.paid_at).toLocaleString() : ""}`}
            onPress={() => router.push({ pathname: "/receipt/[orderId]", params: { orderId: o.order_id } })}
          />
        ))
      )}
    </Screen>
  );
}
