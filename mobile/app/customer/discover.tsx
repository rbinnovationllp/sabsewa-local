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

const CATEGORIES = [
  { key: "kirana", label: "Grocery/Kirana" },
  { key: "vegetables", label: "Vegetables" },
  { key: "fruits", label: "Fruits" },
  { key: "dairy", label: "Dairy" },
  { key: "bakery", label: "Bakery" },
  { key: "medical", label: "Medical store" },
  { key: "restaurant", label: "Restaurant/Tiffin" },
];

const DEFAULT_MASTER_IMAGES: Record<string, string> = {
  vegetables: "https://images.unsplash.com/photo-1604977042946-1eecc30f269e?q=80&w=600",
  fruits: "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?q=80&w=600",
  kirana: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?q=80&w=600",
  dairy: "https://images.unsplash.com/photo-1628088062854-d1870b4553da?q=80&w=600",
  bakery: "https://images.unsplash.com/photo-1509440159596-0249088772ff?q=80&w=600",
  default: "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=600",
};

export default function CustomerVendorDiscoveryScreen() {
  const router = useRouter();
  const { user } = useAuth();

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
    setStatusMessage("Requesting location permission...");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setStatusMessage("");
      setErrorMessage("Location permission was not granted. You can still search by entering PIN code or locality manually.");
      Alert.alert("Location permission", "Enter PIN code or locality manually to search nearby vendors.");
      return;
    }

    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLat(current.coords.latitude);
    setLng(current.coords.longitude);
    setStatusMessage("Location added. Click Search Nearby Vendors to continue.");
    Alert.alert("Location added", "We will search nearby verified vendors within 1 kilometre.");
  }

  async function searchVendors() {
    setErrorMessage("");
    setStatusMessage("");
    setSearchRadius(null);
    setVendors([]);

    if (!lat && !lng && !pincode.trim() && !locality.trim()) {
      setErrorMessage("Allow location permission or enter PIN code/locality before searching.");
      Alert.alert("Location required", "Allow location permission or enter PIN code/locality.");
      return;
    }

    setLoading(true);
    setStatusMessage("Searching verified vendors within 500 metres first, then up to 1 kilometre...");
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
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to search vendors.");

      setVendors(json.vendors || []);
      setSearchRadius(json.search_radius_m || null);
      setExpanded(Boolean(json.expanded));
      setStatusMessage(
        (json.vendors || []).length > 0
          ? `Found ${(json.vendors || []).length} nearby vendor(s).`
          : "No registered available vendor was found within 1 kilometre for this category."
      );
    } catch (error) {
      setStatusMessage("");
      setErrorMessage(
        error instanceof Error
          ? `Search failed: ${error.message}`
          : "Search failed because the backend did not respond."
      );
      Alert.alert("Search failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function saveUnservedLead(button: string) {
    if (!pincode.trim() && !locality.trim() && !lat && !lng) {
      Alert.alert("Locality needed", "Enter at least a PIN code or locality so our team can identify nearby vendors.");
      return;
    }

    setLeadSaving(true);
    setErrorMessage("");
    setStatusMessage("Saving your requirement for company follow-up...");
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
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to record requirement.");
      setStatusMessage("Requirement recorded. We will notify you when a suitable registered vendor becomes active nearby.");
      Alert.alert("Requirement recorded", "We will notify you when a suitable registered vendor becomes available nearby.");
    } catch (error) {
      setStatusMessage("");
      setErrorMessage(error instanceof Error ? `Could not save: ${error.message}` : "Could not save your requirement.");
      Alert.alert("Could not save", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLeadSaving(false);
    }
  }

  const filteredVendors = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return vendors;
    return vendors
      .map((vendor) => ({
        ...vendor,
        available_products: (vendor.available_products || []).filter((product: any) => {
          const text = [
            product.item_name,
            product.generic_product_name,
            product.local_name,
            product.local_language_name,
            product.hindi_name,
            product.kannada_name,
            product.brand_name,
            product.variant_name,
            product.pack_size,
            product.pack_unit,
            product.unit,
            product.category,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return text.includes(term);
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
      Alert.alert("Select products", "Add at least one available product from this shop before opening the cart.");
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Find Nearby Vendors</Text>
      <Text style={styles.subtitle}>We search verified open vendors within 500 metres first, then up to 1 kilometre.</Text>

      <Text style={styles.label}>Select category</Text>
      <View style={styles.categoryGrid}>
        {CATEGORIES.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.categoryChip, category === item.key && styles.categorySelected]}
            onPress={() => setCategory(item.key)}
          >
            <Text style={[styles.categoryText, category === item.key && styles.categorySelectedText]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.locationBtn} onPress={useCurrentLocation}>
        <Text style={styles.locationText}>Use Current Location</Text>
      </TouchableOpacity>

      <Text style={styles.orText}>Or enter location manually</Text>
      <TextInput style={styles.input} placeholder="PIN code" value={pincode} onChangeText={setPincode} keyboardType="number-pad" />
      <TextInput style={styles.input} placeholder="Locality" value={locality} onChangeText={setLocality} />
      <TextInput style={styles.input} placeholder="City" value={city} onChangeText={setCity} />

      <TouchableOpacity style={styles.searchBtn} onPress={searchVendors} disabled={loading}>
        <Text style={styles.searchText}>{loading ? "Searching..." : "Search Nearby Vendors"}</Text>
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
          <Text style={styles.catalogueTitle}>Shop available products</Text>
          <Text style={styles.catalogueText}>Browse verified products from nearby shops. Vendor uploaded images take priority over catalog images.</Text>
          <TextInput
            style={styles.input}
            placeholder="Search product, brand, Hindi or Kannada name"
            value={productSearch}
            onChangeText={setProductSearch}
            accessibilityLabel="Search products"
          />
        </View>
      ) : null}

      {filteredVendors.map((vendor) => (
        <View key={`${vendor.id}-${vendor.terminal_id}`} style={styles.vendorCard}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.shopName}>{vendor.shop_name}</Text>
              <Text style={styles.vendorMeta}>{vendor.category} | ⚡ {vendor.distance_label || "Nearby"}</Text>
            </View>
            <Text style={[styles.status, vendor.open_now ? styles.open : styles.closed]}>
              {vendor.open_now ? "Open" : "Closed"}
            </Text>
          </View>

          <Text style={styles.vendorMeta}>Rating: ⭐ {Number(vendor.rating || 4.5).toFixed(1)} ({vendor.rating_count || 12}+ reviews)</Text>
          <Text style={styles.vendorMeta}>Fulfilment: approx. {vendor.estimated_fulfilment_minutes || 15-20} mins</Text>

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
                    <Text style={styles.itemTitle}>{product.item_name || product.generic_product_name}</Text>
                    {product.hindi_name || product.kannada_name ? (
                      <Text style={styles.localLangName}>{product.hindi_name || product.kannada_name}</Text>
                    ) : null}
                    
                    <Text style={styles.freshnessBadge}>🌱 Fresh Stock Available</Text>

                    <View style={styles.priceActionRow}>
                      <View>
                        <Text style={styles.priceText}>
                          ₹{product.price || product.selling_price || 20}{" "}
                          {product.mrp ? <Text style={styles.mrpText}>₹{product.mrp}</Text> : null}
                        </Text>
                        <Text style={styles.unitMeta}>per {product.pack_size || "500g"}</Text>
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
                          <Text style={styles.addBtnText}>ADD</Text>
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
              {Object.keys(cartByShop[shopKey(vendor)] || {}).length > 0 ? "Review Cart & Pay" : "Add Items First"}
            </Text>
          </TouchableOpacity>
        </View>
      ))}

      {vendors.length > 0 && filteredVendors.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No matching products</Text>
          <Text style={styles.emptyText}>Try another product name, brand, Hindi or Kannada term.</Text>
        </View>
      ) : null}

      {!loading && (searchRadius || errorMessage) && vendors.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>We are sorry!</Text>
          <Text style={styles.emptyText}>
            No SabSewa Local vendor matching your requirement is currently listed in your area. As more people start using SabSewa Local in your locality, our team will work to identify and onboard suitable nearby vendors.
          </Text>

          <TouchableOpacity style={styles.emptyBtn} onPress={() => saveUnservedLead("request_local_vendor")} disabled={leadSaving}>
            <Text style={styles.emptyBtnText}>Request a Vendor in My Area</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setCategory("kirana")}>
            <Text style={styles.secondaryText}>Choose Another Category</Text>
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
  cardHeader: { flexDirection: "row", gap: 12 },
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