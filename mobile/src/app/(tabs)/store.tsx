import React from "react";
import { Image, View } from "react-native";
import { router } from "expo-router";
import { repo, keys } from "../../data/repos";
import { Product } from "../../data/types";
import { formatMoney } from "../../core/format";
import { useAppStore } from "../../state/appStore";
import { useCached } from "../../ui/useCached";
import { Button, Icon, ListRow, Screen, StateView, TenantHeader } from "../../ui/components";
import { baseColors, space } from "../../ui/theme";
import { listCart } from "../../data/store";

export default function StoreTab() {
  const products = useCached<Product[]>(keys.products, repo.products);
  const dataVersion = useAppStore((s) => s.dataVersion);
  void dataVersion;
  const cartCount = listCart().reduce((n, l) => n + l.quantity, 0);
  return (
    <Screen onRefresh={products.refresh} refreshing={products.isRefreshing}>
      <TenantHeader subtitle="Club store" />
      <Button title={cartCount > 0 ? `View cart (${cartCount})` : "View cart"} icon="cart-outline" variant="secondary" onPress={() => router.push("/cart")} />
      <StateView state={products} loadingText="Loading products..." emptyText="No products in the store yet." isEmpty={(d) => d.length === 0}>
        {(data) => (
          <View style={{ gap: space.sm }}>
            {data.map((p) => {
              const prices = p.variants.map((v) => v.price_minor);
              const from = prices.length ? Math.min(...prices) : null;
              const stock = p.variants.reduce((n, v) => n + (v.stock ?? 0), 0);
              return (
                <ListRow
                  key={p.product_id}
                  title={p.name}
                  subtitle={`${from != null ? formatMoney(from) : ""}${stock === 0 && p.variants.some((v) => v.stock != null) ? " · Sold out" : ""}`}
                  right={
                    p.image_url ? (
                      <Image source={{ uri: p.image_url }} style={{ width: 48, height: 48, borderRadius: 8 }} accessibilityLabel={`${p.name} photo`} />
                    ) : (
                      <Icon name="tshirt-crew-outline" size={32} color={baseColors.muted} />
                    )
                  }
                  onPress={() => router.push({ pathname: "/product/[productId]", params: { productId: p.product_id } })}
                />
              );
            })}
          </View>
        )}
      </StateView>
    </Screen>
  );
}
