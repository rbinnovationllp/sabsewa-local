import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";
import LanguageSelector from "@/components/LanguageSelector";
import { useAuth } from "@/providers/AuthProvider";
import { useLanguage } from "@/providers/LanguageProvider";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrandHeader subtitle={t("home.tagline")} />

      <View style={styles.hero}>
        <Text style={styles.brandTitle}>{t("home.title")}</Text>
        <Text style={styles.tagline}>{t("home.tagline")}</Text>
        <TextInput style={styles.input} placeholder={t("home.locationPlaceholder")} accessibilityLabel={t("home.locationPlaceholder")} />
        <TextInput style={styles.input} placeholder={t("home.searchPlaceholder")} accessibilityLabel={t("home.searchPlaceholder")} />
        <LanguageSelector />
      </View>

      <View style={styles.categoryRow}>
        {categoryKeys.map((key) => (
          <TouchableOpacity key={key} style={styles.categoryChip} onPress={() => router.push("/customer/discover" as any)}>
            <Text style={styles.categoryText}>{t(key)}</Text>
          </TouchableOpacity>
        ))}
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
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/customer/GeminiOrder" as any)}>
                <Text style={styles.secondaryText}>{t("home.recentShops")}</Text>
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

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{t("home.verifiedVendors")}</Text>
        <Text style={styles.panelText}>{t("home.verifiedVendorsText")}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{t("home.popularProducts")}</Text>
        <Text style={styles.panelText}>{t("home.popularProductsText")}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 20, paddingTop: 64, paddingBottom: 40 },
  hero: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
    backgroundColor: "#f8fbff",
  },
  brandTitle: { fontSize: 28, fontWeight: "900", color: "#0f766e" },
  tagline: { color: "#f97316", fontSize: 16, fontWeight: "900", marginTop: 4, marginBottom: 14 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: "#fff" },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  categoryChip: { borderWidth: 1, borderColor: "#99f6e4", backgroundColor: "#ecfeff", borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12 },
  categoryText: { color: "#0f766e", fontWeight: "900" },
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
