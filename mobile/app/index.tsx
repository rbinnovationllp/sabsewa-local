import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Image } from "react-native";
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

export default function HomeScreen() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const { t, setLanguage, isLanguageAvailable } = useLanguage();
  const [profileName, setProfileName] = useState("");
  const role = user?.user_metadata?.role;
  const isCustomer = role === "customer";
  const isVendor = role === "vendor";

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
      if (preferredLanguage && isLanguageAvailable(preferredLanguage as any)) {
        setLanguage(preferredLanguage as any);
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [isLanguageAvailable, setLanguage, user?.id]);

  async function handleSwitchAccount() {
    await signOut();
    router.push("/auth/Login" as any);
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
        <Text style={styles.showcaseTitle}>Fresh Local Produce Near You</Text>
        <View style={styles.productCard}>
          <View style={styles.imageContainer}>
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
          </View>
          <View style={styles.productDetails}>
            <Text style={styles.vendorName}>Shree Ram Veggies • ⭐ 4.8</Text>
            <Text style={styles.productTitle}>Crisp Fresh Cucumber (खीरा)</Text>
            <Text style={styles.freshnessTag}>🌱 Fresh Harvest Today</Text>
            
            <View style={styles.unitSelector}>
              <TouchableOpacity style={[styles.unitChip, styles.activeUnitChip]}>
                <Text style={styles.activeUnitText}>500g</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.unitChip}>
                <Text style={styles.unitText}>1 kg</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.priceRow}>
              <View>
                <Text style={styles.price}>₹20 <Text style={styles.mrp}>₹30</Text></Text>
                <Text style={styles.unitMeta}>₹40 / kg</Text>
              </View>
              <TouchableOpacity style={styles.addToCartBtn} onPress={() => router.push("/customer/discover" as any)}>
                <Text style={styles.addToCartText}>ADD</Text>
              </TouchableOpacity>
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
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push({ pathname: "/auth/Register", params: { role: "vendor" } } as any)}>
              <Text style={styles.primaryText}>{t("home.registerShop")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/auth/Login" as any)}>
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
  activeUnitChip: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  unitText: { fontSize: 11, color: "#475569", fontWeight: "600" },
  activeUnitText: { fontSize: 11, color: "#fff", fontWeight: "700" },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 6 },
  price: { fontSize: 16, fontWeight: "900", color: "#0f766e" },
  mrp: { fontSize: 12, color: "#9ca3af", textDecorationLine: "line-through" },
  unitMeta: { fontSize: 10, color: "#6b7280" },
  addToCartBtn: { backgroundColor: "#15803d", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 6 },
  addToCartText: { color: "#fff", fontWeight: "900", fontSize: 13 },

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
  secondaryText: { color: "#1166ff", fontWeight: "900", textAlign: "center" }
});