import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { apiUrl } from "@/lib/backend";
import { supabase } from "@/lib/supabase";
import { parseOrderWithGemini } from "@/services/gemini";

const CATEGORIES = [
  { key: "kirana", label: "Grocery/Kirana" },
  { key: "vegetables", label: "Vegetables" },
  { key: "fruits", label: "Fruits" },
  { key: "dairy", label: "Dairy" },
  { key: "bakery", label: "Bakery" },
  { key: "medical", label: "Medical store" },
  { key: "restaurant", label: "Restaurant/Tiffin" },
];

function imageUrl(value?: string | null) {
  if (!value) return "";
  return String(value).startsWith("/") ? apiUrl(value) : String(value);
}

export default function GeminiOrderScreen() {
  const { t } = useLanguage();
  const params: any = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const [selectedShop, setSelectedShop] = useState<any>(
    params.vendor && params.terminal
      ? {
          id: String(params.vendor),
          terminal_id: String(params.terminal),
          shop_name: params.shopName ? String(params.shopName) : "Selected shop",
          locality: params.locality ? String(params.locality) : "",
          distance_label: params.distance ? String(params.distance) : "",
          available_products: [],
        }
      : null
  );
  const [category, setCategory] = useState("kirana");
  const [searchText, setSearchText] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [autoSearched, setAutoSearched] = useState(false);
  const [pincode, setPincode] = useState("");
  const [locality, setLocality] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [shops, setShops] = useState<any[]>([]);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopMessage, setShopMessage] = useState("");
  const [leadSaving, setLeadSaving] = useState(false);

  const [orderText, setOrderText] = useState("2 kg atta, 1 packet namak, aur doodh");
  const [languageHint, setLanguageHint] = useState("Hinglish");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [cartNotice, setCartNotice] = useState("");

  const filteredDropdownShops = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) return shops;
    return shops.filter((shop: any) => {
      const shopText = `${shop.shop_name || ""} ${shop.category || ""} ${shop.locality || ""} ${shop.delivery_terms || ""}`.toLowerCase();
      const productText = (shop.available_products || [])
        .map((item: any) => `${item.item_name || ""} ${item.generic_product_name || ""} ${item.brand_name || ""} ${item.price_label || ""}`)
        .join(" ")
        .toLowerCase();
      return shopText.includes(term) || productText.includes(term);
    });
  }, [searchText, shops]);

  async function useCurrentLocation() {
    setShopMessage("Requesting location permission...");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setShopMessage("Location permission was not granted. You can still search using PIN code or locality.");
      return;
    }

    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLat(current.coords.latitude);
    setLng(current.coords.longitude);
    setDropdownOpen(true);
    setShopMessage("Location added. Nearby verified shops will refresh automatically.");
  }

  async function loadNearbyShops(options?: { manual?: boolean }) {
    const manual = options?.manual === true;
    if (manual) {
      setShopMessage("");
      setSelectedShop(null);
      setResult(null);
      setCartNotice("");
    }

    if (!lat && !lng && !pincode.trim() && !locality.trim()) {
      if (manual) setShopMessage("Use your location or enter PIN/locality before searching.");
      return;
    }

    setShopLoading(true);
    try {
      const query = new URLSearchParams({ category });
      if (lat != null && lng != null) {
        query.set("lat", String(lat));
        query.set("lng", String(lng));
      }
      if (pincode.trim()) query.set("pincode", pincode.trim());
      if (locality.trim()) query.set("locality", locality.trim());

      const response = await fetch(apiUrl(`/api/discovery/vendors?${query.toString()}`));
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to search shops.");

      setShops(json.vendors || []);
      setDropdownOpen(true);
      setAutoSearched(true);
      const visible = searchText.trim() ? filteredDropdownShops.length : (json.vendors || []).length;
      setShopMessage(
        (json.vendors || []).length > 0
          ? `Found ${(json.vendors || []).length} verified nearby shop(s). Tap the search field and choose your preferred shop.`
          : "No matching verified shop was found within the current search area. Try another category, product name or locality."
      );
    } catch (error) {
      setShopMessage(error instanceof Error ? `Shop search failed: ${error.message}` : "Shop search failed.");
    } finally {
      setShopLoading(false);
    }
  }

  async function findNearbyShops() {
    await loadNearbyShops({ manual: true });
  }

  useEffect(() => {
    if (selectedShop) return;
    if (!lat && !lng && !pincode.trim() && !locality.trim()) return;

    const timeout = setTimeout(() => {
      loadNearbyShops({ manual: false });
    }, 550);

    return () => clearTimeout(timeout);
  }, [category, pincode, locality, lat, lng]);

  function chooseCategory(nextCategory: string) {
    setCategory(nextCategory);
    setSelectedShop(null);
    setResult(null);
    setCartNotice("");
    setDropdownOpen(true);
  }

  function chooseShop(shop: any) {
    setSelectedShop(shop);
    setDropdownOpen(false);
    setSearchText(shop.shop_name || "");
    setResult(null);
    setCartNotice("");
    setShopMessage(`Selected ${shop.shop_name}. You can now type or speak the items required.`);
  }

  async function saveUnservedLead() {
    if (!pincode.trim() && !locality.trim() && !lat && !lng) {
      setShopMessage("Enter a PIN code/locality or use your location before requesting a vendor.");
      return;
    }

    setLeadSaving(true);
    try {
      const response = await fetch(apiUrl("/api/discovery/unserved-area-leads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: user?.id || null,
          category,
          locality: locality.trim(),
          pincode: pincode.trim(),
          lat,
          lng,
          requested_items: orderText.trim(),
          consent_given: true,
          requested_button: "request_vendor_in_my_area",
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to record request.");
      setShopMessage("Request recorded. We will notify you when a suitable registered vendor becomes available nearby.");
    } catch (error) {
      setShopMessage(error instanceof Error ? `Could not record request: ${error.message}` : "Could not record request.");
    } finally {
      setLeadSaving(false);
    }
  }

  async function parseOrder() {
    setCartNotice("");
    if (!selectedShop?.id || !selectedShop?.terminal_id) {
      setCartNotice("Select a nearby shop before creating a cart for review.");
      return;
    }

    if (!orderText.trim()) {
      setCartNotice("Type the customer order first.");
      return;
    }

    setLoading(true);
    try {
      const json = await parseOrderWithGemini({
        orderText,
        languageHint,
        userId: user?.id,
        vendorId: selectedShop.id,
      });
      if (!json.success) throw new Error(json.error || "Order preparation failed");
      setResult(json);
    } catch (error) {
      setCartNotice(error instanceof Error ? `Order preparation failed: ${error.message}` : "Order preparation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function createCartDraft() {
    setCartNotice("");
    if (!selectedShop?.id || !selectedShop?.terminal_id) {
      setCartNotice("Select a nearby verified shop before opening the cart.");
      return;
    }

    const requestedItems = Array.isArray(result?.data?.items) ? result.data.items : [];
    if (requestedItems.length === 0) {
      setCartNotice("Create a cart for review first.");
      return;
    }

    const availableProducts = Array.isArray(selectedShop.available_products) ? selectedShop.available_products : [];
    let catalogue = availableProducts.map((item: any) => ({
      id: item.id,
      product_variant_id: item.product_variant_id || null,
      item_name: item.item_name,
      search_text: [
        item.item_name,
        item.generic_product_name,
        item.brand_name,
        item.variant_name,
        item.pack_size && item.pack_unit ? `${item.pack_size} ${item.pack_unit}` : "",
        item.barcode,
      ].filter(Boolean).join(" ").toLowerCase(),
    }));

    if (catalogue.length === 0) {
      const { data } = await supabase
        .from("vendor_items")
        .select("id, item_name, generic_product_name, brand_name, variant_name, pack_size, pack_unit, barcode, product_variant_id")
        .eq("vendor_id", selectedShop.id)
        .eq("terminal_id", selectedShop.terminal_id)
        .eq("is_available", true)
        .eq("available_today", true)
        .neq("stock_status", "out_of_stock")
        .not("daily_availability_status", "in", "(temporarily_unavailable,out_of_stock)");
      catalogue = (data || []).map((item: any) => ({
        ...item,
        search_text: [
          item.item_name,
          item.generic_product_name,
          item.brand_name,
          item.variant_name,
          item.pack_size && item.pack_unit ? `${item.pack_size} ${item.pack_unit}` : "",
          item.barcode,
        ].filter(Boolean).join(" ").toLowerCase(),
      }));
    }

    const cart: Record<string, number> = {};
    const unmatched: string[] = [];
    requestedItems.forEach((requestItem: any) => {
      const wanted = [
        requestItem.name,
        requestItem.local_name,
        requestItem.brand,
        requestItem.variant,
        requestItem.pack_size,
        requestItem.unit,
      ].filter(Boolean).join(" ").toLowerCase();
      const match = catalogue.find((item: any) =>
        wanted.includes(String(item.item_name || "").toLowerCase()) ||
        String(item.search_text || "").includes(wanted) ||
        wanted.split(/\s+/).filter(Boolean).every((part) => String(item.search_text || "").includes(part))
      );
      if (match?.id) {
        cart[match.id] = Number(requestItem.quantity || 1);
      } else {
        unmatched.push(requestItem.local_name || requestItem.name || "item");
      }
    });

    if (Object.keys(cart).length === 0) {
      setCartNotice("No currently available product matched this shop catalogue. Please edit the request or choose another shop.");
      return;
    }

    router.push({
      pathname: "/hyperlocal/cart" as any,
      params: {
        vendor: selectedShop.id,
        terminal: selectedShop.terminal_id,
        cartData: JSON.stringify(cart),
        shopName: selectedShop.shop_name,
        unmatched: unmatched.join(", "),
      },
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>{t("customerOrder.title")}</Text>
      <Text style={styles.subtitle}>Select a nearby shop and type or speak what you need.</Text>
      <Text style={styles.subtitleSmall}>We will prepare a cart for your review before placing the order.</Text>

      <View style={styles.quickRow}>
        <TouchableOpacity style={styles.quickChip} accessibilityLabel="Recent Shops">
          <Text style={styles.quickText}>Recent Shops</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickChip} accessibilityLabel="Saved Shops">
          <Text style={styles.quickText}>Saved Shops</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickChip} accessibilityLabel="Order Again">
          <Text style={styles.quickText}>Order Again</Text>
        </TouchableOpacity>
      </View>

      {!selectedShop ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Search by shop, category or item</Text>
          <TextInput
            style={styles.input}
            value={searchText}
            onChangeText={(value) => {
              setSearchText(value);
              setDropdownOpen(true);
            }}
            onFocus={() => setDropdownOpen(true)}
            placeholder={t("customerOrder.searchPlaceholder")}
          />
          {dropdownOpen ? (
            <View style={styles.dropdown}>
              <Text style={styles.dropdownHint}>
                {shopLoading
                  ? "Refreshing nearby verified shops..."
                  : filteredDropdownShops.length
                    ? "Choose your preferred nearby shop"
                    : autoSearched
                      ? "No active verified vendor found for this category/location yet."
                      : "Select a category and location to load nearby vendors."}
              </Text>
              {filteredDropdownShops.slice(0, 12).map((shop: any) => (
                <TouchableOpacity key={`${shop.id}-${shop.terminal_id}`} style={styles.dropdownItem} onPress={() => chooseShop(shop)}>
                  {shop.profile_photo_url ? (
                    <Image source={{ uri: imageUrl(shop.profile_photo_url) }} style={styles.shopThumb} />
                  ) : (
                    <View style={styles.shopThumbFallback}>
                      <Text style={styles.shopThumbText}>{String(shop.shop_name || "S").slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.dropdownBody}>
                    <View style={styles.dropdownTitleRow}>
                      <Text style={styles.dropdownShopName}>{shop.shop_name}</Text>
                      <Text style={styles.verifiedPill}>Verified</Text>
                    </View>
                    <Text style={styles.dropdownMeta}>{shop.category || "Local shop"} | {shop.locality || "Nearby locality"} | {shop.distance_label || "Nearby"}</Text>
                    <Text style={styles.dropdownMeta}>{shop.open_now ? "Open now" : "Currently closed"} | {shop.available_product_count || 0} item(s) available today</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.categoryChip, category === item.key && styles.categorySelected]}
                onPress={() => chooseCategory(item.key)}
              >
                <Text style={[styles.categoryText, category === item.key && styles.categorySelectedText]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={pincode}
            onChangeText={(value) => {
              setPincode(value);
              setSelectedShop(null);
              setDropdownOpen(true);
            }}
            placeholder="PIN code"
            keyboardType="number-pad"
          />
          <TextInput
            style={styles.input}
            value={locality}
            onChangeText={(value) => {
              setLocality(value);
              setSelectedShop(null);
              setDropdownOpen(true);
            }}
            placeholder="Locality"
          />
          <TouchableOpacity style={styles.locationBtn} onPress={useCurrentLocation}>
            <Text style={styles.primaryText}>Use My Location</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={findNearbyShops} disabled={shopLoading} accessibilityLabel="Find Nearby Shops">
            <Text style={styles.primaryText}>{shopLoading ? "Finding shops..." : "Find Nearby Shops"}</Text>
          </TouchableOpacity>
          {shopLoading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
          {shopMessage ? <Text style={styles.message}>{shopMessage}</Text> : null}
          {!shopLoading && shops.length === 0 && shopMessage.includes("No matching verified shop") ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                We're sorry. No SabSewa Local vendor matching your requirement is currently listed in your area. As more people start using SabSewa Local in your locality, our team will work to identify and onboard suitable nearby vendors.
              </Text>
              <TouchableOpacity style={styles.requestBtn} onPress={saveUnservedLead} disabled={leadSaving}>
                <Text style={styles.primaryText}>{leadSaving ? "Recording..." : "Request a Vendor in My Area"}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.selectedPanel}>
          <Text style={styles.panelTitle}>Selected Shop: {selectedShop.shop_name}</Text>
          <Text style={styles.meta}>{[selectedShop.category, selectedShop.locality, selectedShop.distance_label].filter(Boolean).join(" | ") || "Nearby shop"}</Text>
          <Text style={styles.meta}>Status: {selectedShop.open_now ? "Open" : "Currently closed"} | Verified vendor</Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => {
            setSelectedShop(null);
            setDropdownOpen(true);
          }}>
            <Text style={styles.secondaryText}>Change Shop</Text>
          </TouchableOpacity>
        </View>
      )}

      {shops.map((shop) => (
        <TouchableOpacity key={`${shop.id}-${shop.terminal_id}`} style={styles.shopCard} onPress={() => chooseShop(shop)}>
          <View style={styles.shopHeader}>
            <Text style={styles.shopName}>{shop.shop_name}</Text>
            <Text style={[styles.badge, shop.open_now ? styles.openBadge : styles.closedBadge]}>
              {shop.open_now ? "Open" : "Closed"}
            </Text>
          </View>
          <Text style={styles.meta}>{shop.category} | {shop.locality || "Nearby"} | {shop.distance_label || "Nearby"} | Verified</Text>
          <Text style={styles.meta}>{shop.delivery_terms || "Delivery terms confirmed by shop"}</Text>
          <Text style={styles.productsTitle}>Currently available</Text>
          {(shop.available_products || []).slice(0, 4).map((item: any) => (
            <Text key={item.id} style={styles.meta}>{item.item_name} - {item.price_label || "Ask Vendor"}</Text>
          ))}
        </TouchableOpacity>
      ))}

      <Text style={styles.label}>Language</Text>
      <TextInput style={styles.input} value={languageHint} onChangeText={setLanguageHint} placeholder="English / Hindi / local language" accessibilityLabel="Language" />
      <Text style={styles.label}>Your Order</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        multiline
        value={orderText}
        onChangeText={setOrderText}
        placeholder="Type or speak the required items"
        accessibilityLabel="Your Order"
      />

      {cartNotice ? <Text style={styles.errorText}>{cartNotice}</Text> : null}

      <TouchableOpacity style={styles.primaryBtn} onPress={parseOrder} disabled={loading} accessibilityLabel="Create Cart for Review">
        <Text style={styles.primaryText}>{loading ? "Preparing cart..." : "Create Cart for Review"}</Text>
      </TouchableOpacity>

      {result?.data ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Cart for Review</Text>
          {(result.data.items || []).map((item: any, index: number) => (
            <View key={`${item.name}-${index}`} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.local_name || item.name}</Text>
              <Text style={styles.meta}>{item.quantity} {item.unit} | {item.name} | confidence {item.confidence}</Text>
            </View>
          ))}
          <Text style={styles.meta}>Prepared cart reference: {result.audit_log_id || "pending"}</Text>
          <TouchableOpacity style={styles.saveBtn} onPress={createCartDraft}>
            <Text style={styles.primaryText}>Review Matched Cart</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  heading: { fontSize: 24, fontWeight: "900" },
  subtitle: { marginTop: 8, marginBottom: 18, color: "#555", lineHeight: 20 },
  subtitleSmall: { marginTop: -10, marginBottom: 16, color: "#555", lineHeight: 20 },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  quickChip: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: "#fff" },
  quickText: { color: "#334155", fontWeight: "900" },
  panel: { marginBottom: 18, borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, backgroundColor: "#fff" },
  selectedPanel: { marginBottom: 18, borderWidth: 1, borderColor: "#bbf7d0", borderRadius: 10, padding: 14, backgroundColor: "#f0fdf4" },
  panelTitle: { fontSize: 18, fontWeight: "900", marginBottom: 10 },
  label: { fontWeight: "900", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, marginBottom: 12, backgroundColor: "#fff" },
  textArea: { minHeight: 110, textAlignVertical: "top" },
  dropdown: { borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 10, backgroundColor: "#f8fbff", marginTop: -4, marginBottom: 12, overflow: "hidden" },
  dropdownHint: { color: "#1e40af", fontWeight: "800", padding: 10, borderBottomWidth: 1, borderBottomColor: "#dbeafe" },
  dropdownItem: { flexDirection: "row", gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: "#e5e7eb", backgroundColor: "#fff" },
  shopThumb: { width: 54, height: 54, borderRadius: 8, backgroundColor: "#e5e7eb" },
  shopThumbFallback: { width: 54, height: 54, borderRadius: 8, backgroundColor: "#ecfeff", alignItems: "center", justifyContent: "center" },
  shopThumbText: { color: "#0f766e", fontSize: 22, fontWeight: "900" },
  dropdownBody: { flex: 1 },
  dropdownTitleRow: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "space-between" },
  dropdownShopName: { flex: 1, color: "#111827", fontWeight: "900", fontSize: 15 },
  verifiedPill: { color: "#15803d", fontWeight: "900", backgroundColor: "#dcfce7", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden" },
  dropdownMeta: { color: "#475569", marginTop: 4, lineHeight: 18 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  categoryChip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  categorySelected: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  categoryText: { color: "#333", fontWeight: "700" },
  categorySelectedText: { color: "#fff" },
  locationBtn: { backgroundColor: "#0f766e", padding: 14, borderRadius: 10, alignItems: "center", marginBottom: 10 },
  primaryBtn: { backgroundColor: "#1166ff", padding: 14, borderRadius: 10, alignItems: "center", marginBottom: 12 },
  saveBtn: { backgroundColor: "#16a34a", padding: 14, borderRadius: 10, alignItems: "center", marginTop: 14 },
  secondaryBtn: { borderWidth: 1, borderColor: "#16a34a", padding: 12, borderRadius: 10, alignItems: "center", marginTop: 12 },
  secondaryText: { color: "#15803d", fontWeight: "900" },
  primaryText: { color: "#fff", fontWeight: "900" },
  message: { color: "#1e40af", marginTop: 10, lineHeight: 20 },
  emptyBox: { borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", borderRadius: 10, padding: 12, marginTop: 12 },
  emptyText: { color: "#7c2d12", lineHeight: 20, marginBottom: 10 },
  requestBtn: { backgroundColor: "#9a3412", padding: 13, borderRadius: 10, alignItems: "center" },
  errorText: { color: "#991b1b", fontWeight: "800", marginBottom: 12, lineHeight: 20 },
  shopCard: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 14, marginBottom: 12, backgroundColor: "#fff" },
  shopHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  shopName: { flex: 1, fontSize: 17, fontWeight: "900" },
  badge: { fontWeight: "900" },
  openBadge: { color: "#16a34a" },
  closedBadge: { color: "#dc2626" },
  productsTitle: { fontWeight: "900", marginTop: 10 },
  itemRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#eee" },
  itemName: { fontWeight: "900" },
  meta: { color: "#666", marginTop: 4, lineHeight: 18 },
});