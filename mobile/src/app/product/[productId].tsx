import React, { useState } from "react";
import { Image, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { repo, keys } from "../../data/repos";
import { Product } from "../../data/types";
import { addToCart } from "../../data/store";
import { formatMoney } from "../../core/format";
import { toast } from "../../state/appStore";
import { useCached } from "../../ui/useCached";
import { Button, Card, EmptyState, OptionList, Screen, StateView, styles } from "../../ui/components";
import { baseColors, font, space } from "../../ui/theme";

function stockHint(stock: number | null | undefined): string | undefined {
  if (stock == null) return undefined;
  if (stock <= 0) return "Sold out";
  if (stock <= 3) return `Only ${stock} left`;
  return "In stock";
}

export default function ProductDetail() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const products = useCached<Product[]>(keys.products, repo.products);
  const [variantId, setVariantId] = useState<string | null>(null);

  return (
    <Screen onRefresh={products.refresh} refreshing={products.isRefreshing}>
      <StateView state={products} loadingText="Loading product..." emptyText="This product isn't available.">
        {(list) => {
          const p = list.find((x) => x.product_id === productId);
          if (!p) return <EmptyState text="This product isn't available any more." />;
          const v = p.variants.find((x) => x.variant_id === variantId) ?? null;
          return (
            <View style={{ gap: space.md }}>
              {p.image_url ? <Image source={{ uri: p.image_url }} style={{ width: "100%", height: 200, borderRadius: 12 }} accessibilityLabel={`${p.name} photo`} /> : null}
              <Card>
                <Text style={[styles.section, { marginTop: 0 }]} accessibilityRole="header">
                  {p.name}
                </Text>
                {p.description ? <Text style={styles.muted}>{p.description}</Text> : null}
                <Text style={{ fontSize: font.h1, fontWeight: "800", color: baseColors.onSurface }}>{formatMoney(v?.price_minor ?? p.variants[0]?.price_minor ?? 0)}</Text>
              </Card>
              <OptionList<string>
                label="Choose an option"
                value={variantId}
                onChange={setVariantId}
                options={p.variants.map((x) => ({
                  value: x.variant_id,
                  label: x.label ?? x.variant_id,
                  hint: stockHint(x.stock),
                  disabled: x.stock != null && x.stock <= 0,
                }))}
              />
              <Button
                title={v ? "Add to cart" : "Choose an option first"}
                icon="cart-plus"
                disabled={!v}
                onPress={() => {
                  if (!v) return;
                  addToCart({ variant_id: v.variant_id, product_id: p.product_id, label: `${p.name} · ${v.label ?? v.variant_id}`, price_minor: v.price_minor });
                  toast("Added to cart.", "success");
                }}
              />
              <Button title="Go to cart" icon="cart-outline" variant="secondary" onPress={() => router.push("/cart")} />
            </View>
          );
        }}
      </StateView>
    </Screen>
  );
}
