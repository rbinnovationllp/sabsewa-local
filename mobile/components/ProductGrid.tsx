import { DimensionValue, Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";

type ProductGridProps = {
  products: any[];
  quantities: Record<string, number>;
  onChangeQuantity: (productId: string, nextQuantity: number) => void;
  onOpenProduct?: (product: any) => void;
};

function getProductTitle(product: any) {
  return product.generic_product_name || product.item_name || "Product";
}

function getSearchNames(product: any) {
  return [product.local_name, product.local_language_name, product.hindi_name, product.kannada_name]
    .filter(Boolean)
    .join(" / ");
}

function getVariantLine(product: any) {
  return [
    product.brand_name,
    product.variant_name,
    product.pack_size && product.pack_unit ? `${product.pack_size} ${product.pack_unit}` : "",
    product.unit && !product.pack_unit ? product.unit : "",
  ]
    .filter(Boolean)
    .join(" - ");
}

function getImageUrl(product: any) {
  return (
    product.master_image_url ||
    product.master_image_thumb_url ||
    product.shared_image_url ||
    product.thumbnail_url ||
    product.item_pic ||
    product.image_url ||
    null
  );
}

function getPriceLabel(product: any) {
  const mode = product.price_display_mode || "show_price";
  if (mode === "hide_price" || mode === "market_price") return "Price confirmation required from vendor";
  if (product.price_label && !/^rs\s*0(\.00)?/i.test(String(product.price_label))) return product.price_label;
  if (product.price == null || Number(product.price) <= 0) return "Price available from shop";
  const unit = product.price_unit_label || product.pack_unit || product.unit;
  return `Rs ${Number(product.price).toFixed(2)}${unit ? ` per ${unit}` : ""}`;
}

function isOrderable(product: any) {
  const dailyStatus = product.daily_availability_status || "available";
  return (
    product.is_available !== false &&
    product.available_today !== false &&
    product.stock_status !== "out_of_stock" &&
    !["temporarily_unavailable", "out_of_stock"].includes(dailyStatus)
  );
}

function getAvailabilityLabel(product: any) {
  const dailyStatus = product.daily_availability_status || "available";
  if (!isOrderable(product)) return product.expected_restock_at ? `Currently unavailable. Expected back: ${product.expected_restock_at}` : "Currently unavailable";
  if (dailyStatus === "limited_stock") return "Limited stock";
  if (dailyStatus === "available_on_request") return "Available on request";
  return "Available today";
}

function getCategoryLabel(product: any) {
  return product.category || product.product_category || product.master_category || "SabSewa Local";
}

export default function ProductGrid({ products, quantities, onChangeQuantity, onOpenProduct }: ProductGridProps) {
  const { width } = useWindowDimensions();
  const columns = width >= 1024 ? 4 : width >= 720 ? 3 : 2;
  const gap = 10;
  const cardWidth = `${100 / columns}%` as DimensionValue;

  if (!products.length) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyTitle}>No orderable products found</Text>
        <Text style={styles.emptyText}>Try another search term, category or nearby shop.</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {products.map((product) => {
        const productId = String(product.id);
        const qty = Number(quantities[productId] || 0);
        const title = getProductTitle(product);
        const imageUrl = getImageUrl(product);
        const orderable = isOrderable(product);

        return (
          <View key={productId} style={[styles.cardWrap, { width: cardWidth, paddingHorizontal: gap / 2 }]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`${title}. ${getPriceLabel(product)}. ${getAvailabilityLabel(product)}`}
              activeOpacity={0.88}
              style={styles.card}
              onPress={() => onOpenProduct?.(product)}
            >
              <View style={styles.imageArea}>
                {imageUrl ? (
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.image}
                    resizeMode="cover"
                    accessibilityLabel={`${title} product image`}
                  />
                ) : (
                  <View style={styles.placeholder}>
                    <Text style={styles.placeholderKicker}>No image available</Text>
                    <Text style={styles.placeholderTitle} numberOfLines={3}>{title}</Text>
                    <Text style={styles.placeholderMeta}>{getCategoryLabel(product)}</Text>
                  </View>
                )}
                {product.discount_label || product.offer_label ? (
                  <Text style={styles.offerBadge}>{product.discount_label || product.offer_label}</Text>
                ) : null}
              </View>

              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={2}>{title}</Text>
                {getSearchNames(product) ? <Text style={styles.localName} numberOfLines={1}>{getSearchNames(product)}</Text> : null}
                {getVariantLine(product) ? <Text style={styles.variant} numberOfLines={2}>{getVariantLine(product)}</Text> : null}
                <Text style={styles.price} numberOfLines={2}>{getPriceLabel(product)}</Text>
                <Text style={[styles.availability, orderable ? styles.available : styles.unavailable]} numberOfLines={2}>
                  {getAvailabilityLabel(product)}
                </Text>
                {product.has_variants || product.requires_variant_selection ? (
                  <Text style={styles.representative}>Representative image. Select the exact variety before checkout.</Text>
                ) : null}
              </View>
            </TouchableOpacity>

            {orderable ? (
              qty > 0 ? (
                <View style={styles.qtyRow}>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Decrease ${title}`} style={styles.qtyBtn} onPress={() => onChangeQuantity(productId, qty - 1)}>
                    <Text style={styles.qtyBtnText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyText}>{qty}</Text>
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Increase ${title}`} style={styles.qtyBtn} onPress={() => onChangeQuantity(productId, qty + 1)}>
                    <Text style={styles.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Add ${title}`} style={styles.addBtn} onPress={() => onChangeQuantity(productId, 1)}>
                  <Text style={styles.addText}>Add</Text>
                </TouchableOpacity>
              )
            ) : (
              <View style={styles.disabledBtn}>
                <Text style={styles.disabledText}>Unavailable</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, marginTop: 8 },
  cardWrap: { marginBottom: 14 },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    borderRadius: 8,
    overflow: "hidden",
    minHeight: 270,
  },
  imageArea: { aspectRatio: 1, backgroundColor: "#f1f5f9", position: "relative" },
  image: { width: "100%", height: "100%" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", padding: 10, backgroundColor: "#ecfeff" },
  placeholderKicker: { color: "#64748b", fontSize: 11, fontWeight: "800", marginBottom: 5 },
  placeholderTitle: { color: "#0f766e", fontSize: 16, fontWeight: "900", textAlign: "center", lineHeight: 21 },
  placeholderMeta: { color: "#f97316", fontSize: 12, fontWeight: "900", marginTop: 6, textAlign: "center" },
  offerBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    backgroundColor: "#be123c",
    color: "#fff",
    fontWeight: "900",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  body: { padding: 10, gap: 3 },
  title: { color: "#111827", fontSize: 15, fontWeight: "900", lineHeight: 20 },
  localName: { color: "#0f766e", fontWeight: "800" },
  variant: { color: "#475569", lineHeight: 18 },
  price: { color: "#111827", fontSize: 15, fontWeight: "900", lineHeight: 19 },
  availability: { fontWeight: "800", lineHeight: 18 },
  available: { color: "#15803d" },
  unavailable: { color: "#b91c1c" },
  representative: { color: "#7c2d12", fontSize: 11, lineHeight: 15, marginTop: 2 },
  addBtn: { backgroundColor: "#ffd21f", borderRadius: 999, paddingVertical: 9, alignItems: "center", marginTop: -18, marginHorizontal: 10 },
  addText: { color: "#111827", fontWeight: "900" },
  qtyRow: {
    backgroundColor: "#0f766e",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: -18,
    marginHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  qtyBtnText: { color: "#0f766e", fontWeight: "900", fontSize: 18 },
  qtyText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  disabledBtn: { borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", borderRadius: 999, paddingVertical: 9, alignItems: "center", marginTop: -18, marginHorizontal: 10 },
  disabledText: { color: "#991b1b", fontWeight: "900" },
  emptyBox: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, backgroundColor: "#f8fafc", marginTop: 8 },
  emptyTitle: { color: "#111827", fontWeight: "900" },
  emptyText: { color: "#64748b", marginTop: 5, lineHeight: 18 },
});
