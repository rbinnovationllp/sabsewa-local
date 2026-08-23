import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import BrandHeader from "@/components/BrandHeader";
import LanguageSelector from "@/components/LanguageSelector";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { useLanguage } from "@/providers/LanguageProvider";

function sanitizeGreetingName(value?: string | null) {
  const name = String(value || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  if (!name || name.includes("@")) return "";
  const digits = name.replace(/\D/g, "");
  if (digits.length >= 8) return "";
  return name;
}

const SHOWCASE_PRODUCT_VARIANTS = [
  {
    key: "500g",
    variantId: "home-demo-cucumber-500g",
    label: "500g",
    price: 20,
    mrp: 30,
    unitPriceLabel: "Rs 40 / kg",
    packSize: 500,
    packUnit: "g",
    available: true,
  },
  {
    key: "1kg",
    variantId: "home-demo-cucumber-1kg",
    label: "1 kg",
    price: 38,
    mrp: 55,
    unitPriceLabel: "Rs 38 / kg",
    packSize: 1,
    packUnit: "kg",
    available: true,
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { user, loading, role, signOut } = useAuth();
  const { language, t, setLanguage, isLanguageAvailable } = useLanguage();
  const [profileName, setProfileName] = useState("");
  const [showcaseQty, setShowcaseQty] = useState(0);
  const [showcaseVariantKey, setShowcaseVariantKey] = useState("500g");
  const normalizedRole = String(role || "").toLowerCase();
  const isCustomer = normalizedRole === "customer";
  const isVendor = normalizedRole === "vendor";

  const categoryKeys = [
    "category.grocery",
    "category.vegetables",
    "category.fruits",
    "category.dairy",
    "category.medical",
    "category.tiffin",
  ];

  const displayName = useMemo(
    () => sanitizeGreetingName(profileName || user?.user_metadata?.preferred_name || user?.user_metadata?.full_name),
    [profileName, user?.user_metadata?.full_name, user?.user_metadata?.preferred_name]
  );

  const greeting = loading || !user
    ? ""
    : isVendor
    ? displayName
      ? t("home.vendorGreeting", { name: displayName })
      : t("home.vendorGreetingGeneric")
    : displayName
    ? t("home.customerGreeting", { name: displayName })
    : t("home.customerGreetingGeneric");

  const selectedShowcaseVariant = useMemo(
    () => SHOWCASE_PRODUCT_VARIANTS.find((item) => item.key === showcaseVariantKey) || SHOWCASE_PRODUCT_VARIANTS[0],
    [showcaseVariantKey]
  );

  // Load language preference persistently
  useEffect(() => {
    let active = true;

    async function loadProfile() {
      if (!user?.id) {
        setProfileName("");
        return;
      }
      const { data } = await supabase
        .from("user_profiles")
        .select("full_name, preferred_language")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;
      setProfileName(sanitizeGreetingName(data?.full_name));

      const preferredLanguage = data?.preferred_language;
      const hasSavedLocalLanguage =
        typeof globalThis !== "undefined" &&
        typeof globalThis.localStorage !== "undefined" &&
        Boolean(globalThis.localStorage.getItem("sabsewa_local_language") || globalThis.localStorage.getItem("user_language"));
      if (preferredLanguage && !hasSavedLocalLanguage && language === "en" && isLanguageAvailable(preferredLanguage as any)) {
        setLanguage(preferredLanguage as any);
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [isLanguageAvailable, language, setLanguage, user?.id]);

  async function handleSwitchAccount() {
    await signOut();
    router.push("/auth/Login" as any);
  }

  function openVendorRegistration() {
    if (typeof window !== "undefined" && window.location) {
      window.location.href = "/vendor/register";
      return;
    }
    router.push("/vendor/register" as any);
  }

  function openVendorLogin() {
    if (typeof window !== "undefined" && window.location) {
      window.location.href = "/auth/Login?role=vendor&intent=vendor_login";
      return;
    }
    router.push({ pathname: "/auth/Login", params: { role: "vendor", intent: "vendor_login" } } as any);
  }

  function saveShowcaseCartIntent(nextQty: number, variant = selectedShowcaseVariant) {
    const intent = {
      source: "home_showcase_product",
      shop_name: "Shree Ram Veggies",
      product_name: "Crisp Fresh Cucumber",
      category: "vegetables",
      search_query: "cucumber",
      variant_key: variant.key,
      variant_id: variant.variantId,
      variant_label: variant.label,
      pack_size: variant.packSize,
      pack_unit: variant.packUnit,
      display_price: variant.price,
      display_mrp: variant.mrp,
      unit_price_label: variant.unitPriceLabel,
      quantity: nextQty,
      cart_line_text: `Crisp Fresh Cucumber - ${nextQty} x ${variant.label}`,
      created_at: new Date().toISOString(),
      requires_live_vendor_validation: true,
    };
    try {
      globalThis.localStorage?.setItem("sabsewa_pending_customer_cart_intent", JSON.stringify(intent));
    } catch {}
  }

  function updateShowcaseQty(nextQty: number) {
    const boundedQty = Math.max(0, Math.min(99, Math.floor(Number(nextQty) || 0)));
    setShowcaseQty(boundedQty);
    if (boundedQty > 0) {
      saveShowcaseCartIntent(boundedQty);
      return;
    }
    try {
      globalThis.localStorage?.removeItem("sabsewa_pending_customer_cart_intent");
    } catch {}
  }

  function handleShowcaseAdd() {
    updateShowcaseQty(1);
    Alert.alert(
      "Item selected",
      `${selectedShowcaseVariant.label} Crisp Fresh Cucumber has been saved. Open View Cart to choose the verified nearby vendor, review the cart and edit quantities before ordering.`
    );
  }

  function selectShowcaseVariant(variantKey: string) {
    const variant = SHOWCASE_PRODUCT_VARIANTS.find((item) => item.key === variantKey);
    if (!variant) return;
    if (!variant.available) {
      Alert.alert("Currently unavailable", `${variant.label} is currently unavailable.`);
      return;
    }
    setShowcaseVariantKey(variant.key);
    if (showcaseQty > 0) saveShowcaseCartIntent(showcaseQty, variant);
  }

  function handleShowcaseProductSelect() {
    Alert.alert("Product selected", "Choose 500g or 1 kg, then press ADD or View Cart.");
  }

  function openShowcaseCart() {
    if (showcaseQty <= 0) handleShowcaseAdd();
    router.push({
      pathname: "/customer/discover" as any,
      params: {
        category: "vegetables",
        q: "cucumber",
        pendingProduct: "Crisp Fresh Cucumber",
        pendingVariant: selectedShowcaseVariant.label,
        pendingPrice: String(selectedShowcaseVariant.price),
        pendingQty: String(showcaseQty || 1),
      },
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrandHeader subtitle={t("home.tagline")} />

      <View style={styles.hero}>
        <View style={styles.topNav}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("home.partnerWithUs")}
            style={styles.partnerNavButton}
            onPress={() => router.push("/partner" as any)}
          >
            <Text style={styles.partnerNavText}>{t("home.partnerWithUs")}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.brandTitle}>{t("home.title")}</Text>
        <Text style={styles.tagline}>{t("home.tagline")}</Text>
        <TextInput style={styles.input} placeholder={t("home.locationPlaceholder")} accessibilityLabel={t("home.locationPlaceholder")} />
        <TextInput style={styles.input} placeholder={t("home.searchPlaceholder")} accessibilityLabel={t("home.searchPlaceholder")} />
        <LanguageSelector />
      </View>

      {greeting ? (
        <View style={styles.greetingPanel}>
          <Text style={styles.greetingText}>{greeting}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t("home.switchAccount")} onPress={handleSwitchAccount}>
            <Text style={styles.switchText}>{t("home.switchAccount")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Partner With Us - Help SabSewa Local Grow Across India and Earn Benefits"
        style={styles.partnerHomeBanner}
        onPress={() => router.push("/partner" as any)}
      >
        <Text style={styles.partnerHomeTitle}>{t("home.partnerBannerTitle")}</Text>
        <Text style={styles.partnerHomeText}>{t("home.partnerBannerText")}</Text>
      </TouchableOpacity>


      <View style={styles.categoryRow}>
        {categoryKeys.map((key) => (
          <TouchableOpacity key={key} style={styles.categoryChip} onPress={() => router.push("/customer/discover" as any)}>
            <Text style={styles.categoryText}>{t(key)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Modern Blinkit/Zepto Showcase Item */}
      <View style={styles.showcaseSection}>
        <Text style={styles.showcaseTitle}>{t("home.showcaseTitle")}</Text>
        <View style={styles.productCard}>
          <TouchableOpacity
            style={styles.imageContainer}
            onPress={handleShowcaseProductSelect}
            accessibilityRole="button"
            accessibilityLabel={`Crisp Fresh Cucumber product image. Selected variant ${selectedShowcaseVariant.label}.`}
          >
            <Image 
              source={{ uri: "https://images.unsplash.com/photo-1604977042946-1eecc30f269e?q=80&w=600" }} 
              style={styles.productImage} 
            />
            <View style={styles.distanceBadge}>
              <Ionicons name="location-sharp" size={12} color="#fff" />
              <Text style={styles.distanceText}>600m away</Text>
            </View>
            <TouchableOpacity style={styles.favoriteBtn}>
              <Ionicons name="heart-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          </TouchableOpacity>
          <View style={styles.productDetails}>
            <TouchableOpacity onPress={handleShowcaseProductSelect} accessibilityRole="button" accessibilityLabel="Select Crisp Fresh Cucumber product card">
              <Text style={styles.vendorName}>Shree Ram Veggies • ⭐ 4.8</Text>
              <Text style={styles.productTitle}>Crisp Fresh Cucumber (खीरा)</Text>
            </TouchableOpacity>
            <Text style={styles.freshnessTag}>🌱 Fresh Harvest Today</Text>
            
            <View style={styles.unitSelector}>
              {SHOWCASE_PRODUCT_VARIANTS.map((variant) => {
                const isSelected = variant.key === selectedShowcaseVariant.key;
                return (
                  <TouchableOpacity
                    key={variant.key}
                    style={[
                      styles.unitChip,
                      isSelected && styles.activeUnitChip,
                      !variant.available && styles.disabledUnitChip,
                    ]}
                    onPress={() => selectShowcaseVariant(variant.key)}
                    disabled={!variant.available}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected, disabled: !variant.available }}
                    accessibilityLabel={`${variant.label} cucumber variant${isSelected ? ", selected" : ""}${variant.available ? "" : ", currently unavailable"}`}
                  >
                    <Text style={isSelected ? styles.activeUnitText : styles.unitText}>
                      {variant.label}{isSelected ? " ✓" : ""}
                    </Text>
                    {!variant.available ? <Text style={styles.unavailableText}>Unavailable</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.priceRow}>
              <View>
                <Text style={styles.price}>₹{selectedShowcaseVariant.price} <Text style={styles.mrp}>₹{selectedShowcaseVariant.mrp}</Text></Text>
                <Text style={styles.unitMeta}>{selectedShowcaseVariant.unitPriceLabel}</Text>
              </View>
              {showcaseQty > 0 ? (
                <View style={styles.showcaseActionStack}>
                  <View style={styles.showcaseQtyControl}>
                    <TouchableOpacity style={styles.showcaseQtyBtn} onPress={() => updateShowcaseQty(showcaseQty - 1)}>
                      <Text style={styles.showcaseQtyText}>-</Text>
                    </TouchableOpacity>
                    <Text style={styles.showcaseQtyValue}>{showcaseQty}</Text>
                    <TouchableOpacity style={styles.showcaseQtyBtn} onPress={() => updateShowcaseQty(showcaseQty + 1)}>
                      <Text style={styles.showcaseQtyText}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.viewCartBtn} onPress={openShowcaseCart}>
                    <Text style={styles.viewCartText}>{t("home.viewCart")}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.addToCartBtn} onPress={handleShowcaseAdd}>
                  <Text style={styles.addToCartText}>{t("home.add").toUpperCase()}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{isCustomer ? t("home.welcomeBack") : t("home.shopNearbyTitle")}</Text>
        <Text style={styles.panelText}>{t("home.shopNearbyText")}</Text>
        {isCustomer ? (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/customer/discover" as any)}>
              <Text style={styles.primaryText}>{t("home.continueShopping")}</Text>
            </TouchableOpacity>
            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/customer/GeminiOrder" as any)}>
                <Text style={styles.secondaryText}>{t("home.orderAgain")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/customer/track" as any)}>
                <Text style={styles.secondaryText}>{t("home.myOrders")}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/customer/discover" as any)}>
              <Text style={styles.primaryText}>{t("home.shopNearbyButton")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push({ pathname: "/auth/Register", params: { role: "customer" } } as any)}>
              <Text style={styles.secondaryText}>{t("home.registerCustomer")}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{isVendor ? t("home.vendorOperations") : t("home.growShop")}</Text>
        <Text style={styles.panelText}>{t("home.vendorText")}</Text>
        {isVendor ? (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/vendor/dashboard" as any)}>
              <Text style={styles.primaryText}>{t("home.openVendorDashboard")}</Text>
            </TouchableOpacity>
            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/vendor/TodayAvailability" as any)}>
                <Text style={styles.secondaryText}>{t("home.manageTodayItems")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/vendor/Orders" as any)}>
                <Text style={styles.secondaryText}>{t("home.viewOrders")}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/vendor/SecurityWallet" as any)}>
                <Text style={styles.secondaryText}>{t("home.walletBalance")}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={openVendorRegistration}>
              <Text style={styles.primaryText}>{t("home.registerShop")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={openVendorLogin}>
              <Text style={styles.secondaryText}>{t("home.vendorLogin")}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 20, paddingTop: 16, paddingBottom: 40 },
  hero: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    backgroundColor: "#f8fbff",
  },
  brandTitle: { fontSize: 28, fontWeight: "900", color: "#0f766e" },
  topNav: { flexDirection: "row", justifyContent: "flex-end", marginBottom: 12 },
  partnerNavButton: { backgroundColor: "#f97316", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 },
  partnerNavText: { color: "#fff", fontWeight: "900" },
  tagline: { color: "#f97316", fontSize: 16, fontWeight: "900", marginTop: 4, marginBottom: 14 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: "#fff" },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  categoryChip: { borderWidth: 1, borderColor: "#99f6e4", backgroundColor: "#ecfeff", borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12 },
  categoryText: { color: "#0f766e", fontWeight: "900" },
  greetingPanel: {
    borderWidth: 1,
    borderColor: "#99f6e4",
    backgroundColor: "#ecfeff",
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
  },
  greetingText: { color: "#0f766e", fontSize: 18, fontWeight: "900", lineHeight: 24 },
  switchText: { color: "#1166ff", fontWeight: "900", marginTop: 8 },
  partnerHomeBanner: { borderWidth: 1, borderColor: "#fdba74", backgroundColor: "#fff7ed", borderRadius: 8, padding: 14, marginBottom: 14 },
  partnerHomeTitle: { color: "#9a3412", fontSize: 18, fontWeight: "900", marginBottom: 4 },
  partnerHomeText: { color: "#7c2d12", lineHeight: 20 },
  
  // Showcase Card Styles
  showcaseSection: { marginBottom: 16 },
  showcaseTitle: { fontSize: 18, fontWeight: "800", color: "#1f2937", marginBottom: 10 },
  productCard: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  imageContainer: { position: "relative", width: 110, height: 110 },
  productImage: { width: "100%", height: "100%", borderRadius: 8 },
  distanceBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(15, 118, 110, 0.9)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  distanceText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  favoriteBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    padding: 4,
  },
  productDetails: { flex: 1, marginLeft: 12, justifyContent: "space-between" },
  vendorName: { fontSize: 11, color: "#6b7280", fontWeight: "600" },
  productTitle: { fontSize: 15, fontWeight: "800", color: "#111827", marginTop: 2 },
  freshnessTag: { fontSize: 11, color: "#16a34a", fontWeight: "700", marginTop: 2 },
  unitSelector: { flexDirection: "row", gap: 6, marginTop: 6 },
  unitChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: "#cbd5e1" },
  activeUnitChip: { backgroundColor: "#0f766e", borderColor: "#052e2b", borderWidth: 2 },
  disabledUnitChip: { opacity: 0.45, backgroundColor: "#f1f5f9" },
  unitText: { fontSize: 11, color: "#475569", fontWeight: "600" },
  activeUnitText: { fontSize: 11, color: "#fff", fontWeight: "700" },
  unavailableText: { fontSize: 9, color: "#991b1b", fontWeight: "800", marginTop: 2 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6 },
  price: { fontSize: 16, fontWeight: "900", color: "#0f766e" },
  mrp: { fontSize: 12, color: "#9ca3af", textDecorationLine: "line-through" },
  unitMeta: { fontSize: 10, color: "#6b7280" },
  addToCartBtn: { backgroundColor: "#15803d", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6 },
  addToCartText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  showcaseActionStack: { alignItems: "flex-end", gap: 6 },
  showcaseQtyControl: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#15803d", borderRadius: 6, overflow: "hidden" },
  showcaseQtyBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center", backgroundColor: "#dcfce7" },
  showcaseQtyText: { color: "#15803d", fontSize: 16, fontWeight: "900" },
  showcaseQtyValue: { minWidth: 28, textAlign: "center", color: "#15803d", fontWeight: "900" },
  viewCartBtn: { backgroundColor: "#1166ff", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  viewCartText: { color: "#fff", fontSize: 12, fontWeight: "900" },

  panel: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
    backgroundColor: "#fff"
  },
  panelTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  panelText: { color: "#4b5563", marginTop: 6, marginBottom: 14, lineHeight: 20 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primaryButton: { backgroundColor: "#1166ff", borderRadius: 8, padding: 13, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#1166ff",
    borderRadius: 8,
    padding: 13,
    alignItems: "center",
    marginTop: 10,
    flexGrow: 1
  },
  secondaryText: { color: "#1166ff", fontWeight: "900", textAlign: "center" },
});
