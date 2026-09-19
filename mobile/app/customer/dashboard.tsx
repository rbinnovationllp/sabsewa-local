import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import BrandHeader from "@/components/BrandHeader";
import { useLanguage } from "@/providers/LanguageProvider";

const CATEGORIES = [
  { labelKey: "category.grocery", value: "kirana" },
  { labelKey: "category.vegetables", value: "vegetables" },
  { labelKey: "category.fruits", value: "fruits" },
  { labelKey: "category.dairy", value: "dairy" },
  { labelKey: "category.medical", value: "medical" },
  { labelKey: "category.tiffin", value: "restaurant" },
];

export default function CustomerDashboard() {
  const router = useRouter();
  const { t } = useLanguage();
  const [query, setQuery] = useState("");

  function openDiscovery(params: Record<string, string> = {}) {
    router.push({ pathname: "/customer/discover", params } as any);
  }

  function submitSearch() {
    const q = query.trim();
    openDiscovery(q ? { q } : {});
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrandHeader subtitle={t("customerDashboard.brandSubtitle")} />

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{t("customerDashboard.eyebrow")}</Text>
        <Text style={styles.title}>{t("customerDashboard.title")}</Text>
        <Text style={styles.support}>{t("customerDashboard.support")}</Text>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
            style={styles.searchInput}
            placeholder={t("customerDashboard.searchPlaceholder")}
            accessibilityLabel={t("customerDashboard.searchAccessibility")}
          />
          <TouchableOpacity accessibilityRole="button" style={styles.searchButton} onPress={submitSearch}>
            <Ionicons name="search" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.voiceButton} onPress={() => router.push("/customer/GeminiOrder" as any)}>
          <Ionicons name="mic" size={18} color="#ffffff" />
          <Text style={styles.voiceText}>{t("customerDashboard.voiceOrder")}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("customerDashboard.shopByCategory")}</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((category) => (
            <TouchableOpacity key={category.value} style={styles.categoryChip} onPress={() => openDiscovery({ category: category.value })}>
              <Text style={styles.categoryText}>{t(category.labelKey)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("customerDashboard.quickActions")}</Text>
        <View style={styles.actionGrid}>
          <ActionCard icon="storefront" title={t("customerDashboard.nearbyStores")} text={t("customerDashboard.useLocationPin")} onPress={() => openDiscovery()} />
          <ActionCard icon="cart" title={t("customerDashboard.cart")} text={t("customerDashboard.editItems")} onPress={() => router.push("/hyperlocal/cart" as any)} />
          <ActionCard icon="navigate" title={t("customerDashboard.trackOrder")} text={t("customerDashboard.followStatus")} onPress={() => router.push("/customer/track" as any)} />
          <ActionCard icon="person" title={t("customerDashboard.myProfile")} text={t("customerDashboard.accountAddress")} onPress={() => router.push("/customer/profile" as any)} />
        </View>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.supportButton} onPress={() => router.push("/customer/support" as any)}>
          <Text style={styles.supportButtonText}>{t("customerDashboard.helpSupport")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.complaintButton} onPress={() => router.push("/customer/complaint" as any)}>
          <Text style={styles.complaintText}>{t("customerDashboard.raiseComplaint")}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomNav} accessibilityRole="tablist">
        <CustomerNavItem icon="home" label={t("common.home")} active onPress={() => router.push("/customer/dashboard" as any)} />
        <CustomerNavItem icon="search" label={t("common.search")} onPress={() => openDiscovery()} />
        <CustomerNavItem icon="cart" label={t("customerDashboard.cart")} onPress={() => router.push("/hyperlocal/cart" as any)} />
        <CustomerNavItem icon="receipt" label={t("customerDashboard.orders")} onPress={() => router.push("/customer/OrderHistory" as any)} />
        <CustomerNavItem icon="person" label={t("customerDashboard.me")} onPress={() => router.push("/customer/profile" as any)} />
      </View>
    </ScrollView>
  );
}

function ActionCard({ icon, title, text, onPress }: { icon: string; title: string; text: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress}>
      <Ionicons name={icon as any} size={20} color="#0f766e" />
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionText}>{text}</Text>
    </TouchableOpacity>
  );
}

function CustomerNavItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="tab"
      accessibilityState={{ selected: Boolean(active) }}
      style={[styles.navItem, active && styles.navItemActive]}
      onPress={onPress}
    >
      <Ionicons name={icon as any} size={19} color={active ? "#0f766e" : "#64748b"} />
      <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#ffffff" },
  content: { padding: 16, paddingTop: 10, paddingBottom: 48 },
  hero: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  eyebrow: { color: "#0f766e", fontWeight: "900", marginBottom: 6 },
  title: { color: "#0f172a", fontSize: 24, fontWeight: "900" },
  support: { color: "#475569", lineHeight: 20, marginTop: 8, marginBottom: 14 },
  searchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  searchButton: { width: 48, height: 48, borderRadius: 8, backgroundColor: "#1166ff", alignItems: "center", justifyContent: "center" },
  voiceButton: {
    backgroundColor: "#0f766e",
    borderRadius: 8,
    padding: 13,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  voiceText: { color: "#ffffff", fontWeight: "900" },
  section: { marginBottom: 16 },
  sectionTitle: { color: "#0f172a", fontSize: 18, fontWeight: "900", marginBottom: 10 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: { borderWidth: 1, borderColor: "#99f6e4", backgroundColor: "#ecfeff", borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12 },
  categoryText: { color: "#0f766e", fontWeight: "900" },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionCard: {
    width: "48%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 14,
    minHeight: 112,
  },
  actionTitle: { color: "#0f172a", fontSize: 16, fontWeight: "900", marginTop: 8 },
  actionText: { color: "#64748b", marginTop: 4, lineHeight: 18 },
  supportButton: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14, alignItems: "center", marginBottom: 10 },
  supportButtonText: { color: "#ffffff", fontWeight: "900" },
  complaintButton: { borderWidth: 1, borderColor: "#dc2626", borderRadius: 8, padding: 14, alignItems: "center" },
  complaintText: { color: "#b91c1c", fontWeight: "900" },
  bottomNav: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    padding: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
  },
  navItem: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  navItemActive: { backgroundColor: "#ecfeff" },
  navText: { color: "#64748b", fontSize: 11, fontWeight: "800", marginTop: 3 },
  navTextActive: { color: "#0f766e" },
});
