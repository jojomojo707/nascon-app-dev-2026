import React from "react";
import { router } from "expo-router";
import { clearSession } from "../../data/session";
import { roleLabel } from "../../core/capabilities";
import { useAppStore } from "../../state/appStore";
import { confirm, ListRow, Screen, SectionHeader, StatusChip, TenantHeader } from "../../ui/components";

export default function More() {
  const session = useAppStore((s) => s.session);
  const pending = useAppStore((s) => s.pendingCount);
  return (
    <Screen>
      <TenantHeader subtitle={`${session?.user.display_name ?? session?.user.email ?? ""} · ${roleLabel(session?.user.role)}`} />
      <SectionHeader title="More" />
      <ListRow
        icon="sync"
        title="Sync status"
        subtitle="Changes waiting to be sent and recent results"
        right={pending > 0 ? <StatusChip text={`${pending} pending`} icon="clock-outline" tone="warning" /> : undefined}
        onPress={() => router.push("/sync")}
      />
      <ListRow icon="receipt" title="Orders and receipts" subtitle="Your paid orders on this phone" onPress={() => router.push("/orders")} />
      <ListRow icon="cart-outline" title="Cart" onPress={() => router.push("/cart")} />
      <ListRow icon="cog-outline" title="Settings" subtitle="Server address, account" onPress={() => router.push("/settings")} />
      <ListRow
        icon="logout"
        title="Sign out"
        onPress={() =>
          confirm("Sign out?", "Saved data on this phone is cleared. Changes waiting to sync are kept.", "Sign out", async () => {
            await clearSession();
            router.replace("/login");
          })
        }
      />
    </Screen>
  );
}
