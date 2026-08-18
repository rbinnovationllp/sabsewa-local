import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from "react-native";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { apiUrl } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";
import { useLanguage } from "@/providers/LanguageProvider";

const CATEGORIES = [
  { key: "kirana", labelKey: "category.groceryKirana" },
  { key: "vegetables", labelKey: "category.vegetables" },
  { key: "fruits", labelKey: "category.fruits" },
  { key: "dairy", labelKey: "category.dairy" },
  { key: "bakery", labelKey: "category.bakery" },
  { key: "medical", labelKey: "category.medicalStore" },
  { key: "restaurant", labelKey: "category.restaurantTiffin" },
];

const DEFAULT_MASTER_IMAGES: Record<string, string> = {
  vegetables: "https://images.unsplash.com/photo-1604977042946-1eecc30f269e?q=80&w=600",
  fruits: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?q=80&w=600",
  kirana: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?q=80&w=600",
  dairy: "https://images.unsplash.com/photo-1628088062854-d1870b4553da?q=80&w=600",
  bakery: "https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=600",
  default: "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=600",
};

function normalizeSearchText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\u0c80-\u0cff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenLocalNames(localNames: any) {
  if (!localNames || typeof localNames !== "object") return [];
  return Object.values(localNames).flatMap((value: any) => Array.isArray(value) ? value : [value]).filter(Boolean);
}

export default function CustomerVendorDiscoveryScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { language, t } = useLanguage();

  const [category, setCategory] = useState("vegetables");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [pincode, setPincode] = useState("");
  const [locality, setLocality] = useState("");
  const [city, setCity] = useState("");
  const [vendors, setVendors] = useState<any[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [cartByShop, setCartByShop] = useState<Record<string, Record<string, number>>>({});
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [searchRadius, setSearchRadius] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [leadSaving, setLeadSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function useCurrentLocation() {
    setErrorMessage("");
    setStatusMessage(t("discovery.requestingLocation"));
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setStatusMessage("");
      setErrorMessage(t("discovery.locationDenied"));
      Alert.alert(t("discovery.locationPermissionTitle"), t("discovery.locationManualPrompt"));
      return;
    }

    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLat(current.coords.latitude);
    setLng(current.coords.longitude);
    setStatusMessage(t("discovery.locationAdded"));
    Alert.alert(t("auth.locationAdded"), t("discovery.locationAddedAlert"));
  }

  async function searchVendors() {
    setErrorMessage("");
    setStatusMessage("");
    setSearchRadius(null);
    setVendors([]);

    if (!lat && !lng && !pincode.trim() && !locality.trim()) {
      setErrorMessage(t("discovery.locationRequired"));
      Alert.alert(t("discovery.locationRequiredTitle"), t("discovery.locationRequired"));
      return;
    }

    setLoading(true);
    setStatusMessage(t("discovery.searchingNearby"));
    try {
      const query = new URLSearchParams({ category });
      query.set("language", language);
      if (productSearch.trim()) query.set("q", productSearch.trim());
      if (lat != null && lng != null) {
        query.set("lat", String(lat));
        query.set("lng", String(lng));
      }
      if (pincode.trim()) query.set("pincode", pincode.trim());
      if (locality.trim()) query.set("locality", locality.trim());

      const response = await fetch(apiUrl(`/api/discovery/vendors?${query.toString()}`));
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || t("discovery.searchFailedGeneric"));

      setVendors(json.vendors || []);
      setSearchRadius(json.search_radius_m || null);
      setExpanded(Boolean(json.expanded));
      setStatusMessage(
        (json.vendors || []).length > 0
          ? `Found ${(json.vendors || []).length} nearby vendor(s).`
          : t("discovery.noVendorInRadius")
      );
    } catch (error) {
      setStatusMessage("");
      setErrorMessage(
        error instanceof Error
          ? `${t("discovery.searchFailedTitle")}: ${error.message}`
          : t("discovery.backendNoResponse")
      );
      Alert.alert(t("discovery.searchFailedTitle"), error instanceof Error ? error.message : t("discovery.unknownError"));
    } finally {
      setLoading(false);
    }
  }

  async function saveUnservedLead(button: string) {
    if (!pincode.trim() && !locality.trim() && !lat && !lng) {
      Alert.alert(t("discovery.localityNeededTitle"), t("discovery.localityNeeded"));
      return;
    }

    setLeadSaving(true);
    setErrorMessage("");
    setStatusMessage(t("discovery.savingRequirement"));
    try {
      const response = await fetch(apiUrl("/api/discovery/unserved-area-leads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: user?.id || null,
          category,
          locality: locality.trim(),
          pincode: pincode.trim(),
          city: city.trim(),
          lat,
          lng,
          consent_given: true,
          requested_button: button,
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || t("discovery.recordFailed"));
      setStatusMessage(t("discovery.requirementRecorded"));
      Alert.alert(t("discovery.requirementRecordedTitle"), t("discovery.requirementRecorded"));
    } catch (error) {
      setStatusMessage("");
      setErrorMessage(error instanceof Error ? `${t("discovery.saveFailedTitle")}: ${error.message}` : t("discovery.saveFailed"));
      Alert.alert(t("discovery.saveFailedTitle"), error instanceof Error ? error.message : t("discovery.unknownError"));
    } finally {
      setLeadSaving(false);
    }
  }

  const filteredVendors = useMemo(() => {
    const term = normalizeSearchText(productSearch);
    if (!term) return vendors;
    return vendors
      .map((vendor) => ({
        ...vendor,
        available_products: (vendor.available_products || []).filter((product: any) => {
          const text = [
            product.item_name,
            product.generic_product_name,
            product.master_standard_title,
            product.local_name,
            product.local_language_name,
            product.hindi_name,
            product.kannada_name,
            ...flattenLocalNames(product.local_names),
            ...(product.search_keywords || []),
            ...(product.alternative_spellings || []),
            product.brand_name,
            product.variant_name,
            product.pack_size,
            product.pack_unit,
            product.unit,
            product.category,
          ]
            .filter(Boolean)
            .join(" ");
          return normalizeSearchText(text).includes(term);
        }),
      }))
      .filter((vendor) => (vendor.available_products || []).length > 0);
  }, [productSearch, vendors]);

  function shopKey(vendor: any) {
    return `${vendor.id}:${vendor.terminal_id}`;
  }

  function setProductQty(vendor: any, productId: string, nextQty: number) {
    const boundedQty = Math.max(0, Math.min(99, Math.floor(Number(nextQty) || 0)));
    setCartByShop((current) => {
      const key = shopKey(vendor);
      const shopCart = { ...(current[key] || {}) };
      if (boundedQty <= 0) delete shopCart[productId];
      else shopCart[productId] = boundedQty;
      return { ...current, [key]: shopCart };
    });
  }

  function toggleFavorite(productId: string) {
    setFavorites((prev) => ({ ...prev, [productId]: !prev[productId] }));
  }

  function openCart(vendor: any) {
    const cartData = cartByShop[shopKey(vendor)] || {};
    if (Object.keys(cartData).length === 0) {
      Alert.alert(t("discovery.selectProductsTitle"), t("discovery.selectProducts"));
      return;
    }

    router.push({
      pathname: "/hyperlocal/cart" as any,
      params: {
        vendor: vendor.id,
        terminal: vendor.terminal_id,
        cartData: JSON.stringify(cartData),
        shopName: vendor.shop_name,
      },
    });
  }

  // Priority image selector: Vendor uploaded -> Master Catalog -> Category Default
  function resolveProductImage(product: any) {
    if (product.vendor_image_url) return product.vendor_image_url;
    if (product.image_url) return product.image_url;
    if (product.master_image_url) return product.master_image_url;
    return DEFAULT_MASTER_IMAGES[category] || DEFAULT_MASTER_IMAGES.default;
  }

  function localizedProductTitle(product: any) {
    const localValue = product.local_names?.[language];
    const localName = Array.isArray(localValue) ? localValue[0] : localValue;
    return localName || product.local_name || product.generic_product_name || product.item_name || product.master_standard_title || t("product.generic");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>{t("discovery.title")}</Text>
      <Text style={styles.subtitle}>{t("discovery.subtitle")}</Text>

      <Text style={styles.label}>{t("discovery.selectCategory")}</Text>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.categoryChip, category === item.key && styles.categorySelected]}
            onPress={() => setCategory(item.key)}
          >
            <Text style={[styles.categoryText, category === item.key && styles.categorySelectedText]}>{t(item.labelKey)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.locationBtn} onPress={useCurrentLocation}>
        <Text style={styles.locationText}>{t("discovery.useCurrentLocation")}</Text>
      </TouchableOpacity>

      <Text style={styles.orText}>{t("discovery.orManual")}</Text>
      <TextInput style={styles.input} placeholder={t("auth.pinCode")} value={pincode} onChangeText={setPincode} keyboardType="number-pad" />
      <TextInput style={styles.input} placeholder={t("auth.streetLocality")} value={locality} onChangeText={setLocality} />
      <TextInput style={styles.input} placeholder={t("auth.city")} value={city} onChangeText={setCity} />

      <TouchableOpacity style={styles.searchBtn} onPress={searchVendors} disabled={loading}>
        <Text style={styles.searchText}>{loading ? t("discovery.searching") : t("discovery.searchNearbyVendors")}</Text>
      </TouchableOpacity>

      {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}

      {statusMessage ? (
        <View style={styles.statusBox}>
          <Text style={styles.statusText}>{statusMessage}</Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {searchRadius ? (
        <Text style={styles.resultNote}>
          Showing vendors within {searchRadius} metres{expanded ? " after expanding from 500 metres." : "."}
        </Text>
      ) : null}

      {vendors.length > 0 ? (
        <View style={styles.catalogueIntro}>
          <Text style={styles.catalogueTitle}>{t("discovery.shopProducts")}</Text>
          <Text style={styles.catalogueText}>{t("discovery.shopProductsText")}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("discovery.productSearchPlaceholder")}
            value={productSearch}
            onChangeText={setProductSearch}
            accessibilityLabel={t("discovery.productSearchLabel")}
          />
        </View>
      ) : null}

      {filteredVendors.map((vendor) => (
        <View key={`${vendor.id}-${vendor.terminal_id}`} style={styles.vendorCard}>
          <View style={styles.cardHeader}>
            {vendor.profile_photo_url ? (
              <Image
                source={{ uri: apiUrl(vendor.profile_photo_url) }}
                style={styles.vendorPhoto}
                resizeMode="cover"
                accessibilityLabel={`${vendor.shop_name} verified shop photograph`}
              />
            ) : (
              <View style={styles.vendorPhotoPlaceholder}>
                <Ionicons name="storefront-outline" size={28} color="#0f766e" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.shopName}>{vendor.shop_name}</Text>
              <Text style={styles.vendorMeta}>{vendor.category} | {vendor.distance_label || t("discovery.nearby")}</Text>
              {vendor.verified_vendor || vendor.verification_status === "kyc_verified" ? (
                <Text style={styles.verifiedBadge}>{t("discovery.verifiedVendor")}</Text>
              ) : null}
            </View>
            <Text style={[styles.status, vendor.open_now ? styles.open : styles.closed]}>
              {vendor.open_now ? t("discovery.open") : t("discovery.closed")}
            </Text>
          </View>

          <Text style={styles.vendorMeta}>{t("discovery.rating")}: {Number(vendor.rating || 4.5).toFixed(1)} ({vendor.rating_count || 12}+)</Text>
          <Text style={styles.vendorMeta}>{t("discovery.fulfilment")}: {vendor.estimated_fulfilment_minutes || 20} {t("discovery.minutes")}</Text>

          {/* Modern Blinkit / Zepto Product Showcase Cards */}
          <View style={styles.productsList}>
            {(vendor.available_products || []).map((product: any) => {
              const qty = cartByShop[shopKey(vendor)]?.[product.id] || 0;
              const isFav = Boolean(favorites[product.id]);

              return (
                <View key={product.id} style={styles.productRowCard}>
                  <View style={styles.imageBox}>
                    <Image source={{ uri: resolveProductImage(product) }} style={styles.productImg} />
                    <TouchableOpacity style={styles.favBadge} onPress={() => toggleFavorite(product.id)}>
                      <Ionicons name={isFav ? "heart" : "heart-outline"} size={16} color={isFav ? "#ef4444" : "#64748b"} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.productDetails}>
                    <Text style={styles.itemTitle}>{localizedProductTitle(product)}</Text>
                    {product.hindi_name || product.kannada_name ? (
                      <Text style={styles.localLangName}>{product.hindi_name || product.kannada_name}</Text>
                    ) : null}
                    
                    <Text style={styles.freshnessBadge}>{t("discovery.freshStock")}</Text>

                    <View style={styles.priceActionRow}>
                      <View>
                        <Text style={styles.priceText}>
                          Rs {product.price || product.selling_price || 20}{" "}
                          {product.mrp ? <Text style={styles.mrpText}>Rs {product.mrp}</Text> : null}
                        </Text>
                        <Text style={styles.unitMeta}>{t("discovery.per")} {product.pack_size || product.pack_unit || product.unit || t("discovery.unit")}</Text>
                      </View>

                      {qty > 0 ? (
                        <View style={styles.qtyControl}>
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => setProductQty(vendor, product.id, qty - 1)}>
                            <Text style={styles.qtyBtnText}>-</Text>
                          </TouchableOpacity>
                          <Text style={styles.qtyValue}>{qty}</Text>
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => setProductQty(vendor, product.id, qty + 1)}>
                            <Text style={styles.qtyBtnText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity style={styles.addBtn} onPress={() => setProductQty(vendor, product.id, 1)}>
                          <Text style={styles.addBtnText}>{t("home.add").toUpperCase()}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          <TouchableOpacity style={styles.orderBtn} onPress={() => openCart(vendor)}>
            <Text style={styles.orderText}>
              {Object.keys(cartByShop[shopKey(vendor)] || {}).length > 0 ? t("discovery.reviewCart") : t("discovery.addItemsFirst")}
            </Text>
          </TouchableOpacity>
        </View>
      ))}

      {vendors.length > 0 && filteredVendors.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t("discovery.noMatchingProducts")}</Text>
          <Text style={styles.emptyText}>{t("discovery.tryAnotherLanguageTerm")}</Text>
        </View>
      ) : null}

      {!loading && (searchRadius || errorMessage) && vendors.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t("discovery.sorryTitle")}</Text>
          <Text style={styles.emptyText}>
            {t("vendor.noneFound")}
          </Text>

          <TouchableOpacity style={styles.emptyBtn} onPress={() => saveUnservedLead("request_local_vendor")} disabled={leadSaving}>
            <Text style={styles.emptyBtnText}>{t("vendor.requestArea")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setCategory("kirana")}>
            <Text style={styles.secondaryText}>{t("discovery.chooseAnotherCategory")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 20, paddingBottom: 40, backgroundColor: "#fff" },
  heading: { fontSize: 26, fontWeight: "900" },
  subtitle: { color: "#555", lineHeight: 20, marginTop: 6, marginBottom: 18 },
  label: { fontWeight: "900", marginBottom: 8 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  categoryChip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  categorySelected: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  categoryText: { color: "#333", fontWeight: "700" },
  categorySelectedText: { color: "#fff" },
  locationBtn: { backgroundColor: "#0f766e", borderRadius: 10, padding: 14 },
  locationText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  orText: { textAlign: "center", color: "#666", marginVertical: 12 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, marginBottom: 10 },
  searchBtn: { backgroundColor: "#1166ff", borderRadius: 10, padding: 14, marginTop: 4 },
  searchText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  statusBox: { borderWidth: 1, borderColor: "#bbf7d0", backgroundColor: "#f0fdf4", borderRadius: 10, padding: 12, marginTop: 14 },
  statusText: { color: "#166534", fontWeight: "700", lineHeight: 20 },
  errorBox: { borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fef2f2", borderRadius: 10, padding: 12, marginTop: 14 },
  errorText: { color: "#991b1b", fontWeight: "900", lineHeight: 20 },
  resultNote: { color: "#555", marginTop: 16, marginBottom: 8 },
  catalogueIntro: { borderWidth: 1, borderColor: "#99f6e4", backgroundColor: "#ecfeff", borderRadius: 10, padding: 12, marginTop: 14, marginBottom: 4 },
  catalogueTitle: { color: "#0f766e", fontSize: 18, fontWeight: "900" },
  catalogueText: { color: "#334155", lineHeight: 19, marginTop: 5, marginBottom: 10 },
  vendorCard: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 14, marginTop: 14, backgroundColor: "#fafafa" },
  cardHeader: { flexDirection: "row", gap: 12, alignItems: "center" },
  vendorPhoto: { width: 96, height: 72, borderRadius: 8, backgroundColor: "#ecfeff", borderWidth: 1, borderColor: "#99f6e4" },
  vendorPhotoPlaceholder: { width: 96, height: 72, borderRadius: 8, backgroundColor: "#ecfeff", borderWidth: 1, borderColor: "#99f6e4", alignItems: "center", justifyContent: "center" },
  verifiedBadge: { alignSelf: "flex-start", marginTop: 5, color: "#166534", backgroundColor: "#dcfce7", borderWidth: 1, borderColor: "#86efac", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, fontSize: 11, fontWeight: "900", overflow: "hidden" },
  shopName: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  vendorMeta: { color: "#64748b", marginTop: 2, fontSize: 13 },
  status: { fontWeight: "900" },
  open: { color: "#16a34a" },
  closed: { color: "#dc2626" },
  
  // Blinkit / Zepto Product Card Styling
  productsList: { marginTop: 12, gap: 10 },
  productRowCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
    gap: 12,
  },
  imageBox: { position: "relative", width: 85, height: 85 },
  productImg: { width: "100%", height: "100%", borderRadius: 8 },
  favBadge: { position: "absolute", top: 2, right: 2, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 10, padding: 3 },
  productDetails: { flex: 1, justifyContent: "space-between" },
  itemTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a" },
  localLangName: { fontSize: 12, color: "#64748b" },
  freshnessBadge: { fontSize: 11, color: "#16a34a", fontWeight: "700" },
  priceActionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  priceText: { fontSize: 16, fontWeight: "900", color: "#0f766e" },
  mrpText: { fontSize: 12, color: "#94a3b8", textDecorationLine: "line-through" },
  unitMeta: { fontSize: 11, color: "#64748b" },
  addBtn: { backgroundColor: "#15803d", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6 },
  addBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  qtyControl: { flexDirection: "row", alignItems: "center", backgroundColor: "#16a34a", borderRadius: 6 },
  qtyBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  qtyBtnText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  qtyValue: { color: "#fff", fontWeight: "900", paddingHorizontal: 6 },

  orderBtn: { backgroundColor: "#16a34a", borderRadius: 8, padding: 14, marginTop: 14 },
  orderText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  emptyCard: { backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 10, padding: 14, marginTop: 18 },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: "#9a3412" },
  emptyText: { color: "#7c2d12", lineHeight: 20, marginTop: 8 },
  emptyBtn: { backgroundColor: "#9a3412", borderRadius: 8, padding: 12, marginTop: 10 },
  emptyBtnText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  secondaryBtn: { borderWidth: 1, borderColor: "#9a3412", borderRadius: 8, padding: 12, marginTop: 10 },
  secondaryText: { color: "#9a3412", textAlign: "center", fontWeight: "900" },
});
