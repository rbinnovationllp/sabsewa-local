import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { authenticatedFetch } from "@/lib/backend";
import BrandHeader from "@/components/BrandHeader";
import { useAuth } from "@/providers/AuthProvider";

export default function CompanyVendorDirectoryScreen() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [vendors, setVendors] = useState<any[]>([]);

  async function searchVendors() {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());

    const response = await authenticatedFetch(`/api/company/vendors?${query.toString()}`);
    const json = await response.json();

    if (!response.ok || !json.success) {
      Alert.alert("Search failed", json.error || "Unable to search vendors.");
      return;
    }

    setVendors(json.vendors || []);
  }

  async function updateKyc(vendorId: string, status: string) {
    const response = await authenticatedFetch(`/api/vendor/onboarding/${vendorId}/kyc-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, actor_user_id: user?.id || null, reason: "Company CRM verification update" }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("KYC update failed", json.error || "Unable to update KYC.");
      return;
    }
    await searchVendors();
  }

  async function activateVendor(vendorId: string) {
    const response = await authenticatedFetch(`/api/vendor/onboarding/${vendorId}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor_user_id: user?.id || null, reason: "Company CRM final activation" }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Activation failed", json.error || "Unable to activate vendor.");
      return;
    }
    await searchVendors();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Company Master CRM" />
      <Text style={styles.heading}>Vendor Directory</Text>
      <Text style={styles.subtitle}>
        Search by Vendor ID, terminal ID, shop, owner, phone, city, or locality.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Example: SL-GGM-S48-000125 or shop name"
        value={search}
        onChangeText={setSearch}
      />
      <TouchableOpacity style={styles.searchBtn} onPress={searchVendors}>
        <Text style={styles.searchText}>Search Vendors</Text>
      </TouchableOpacity>

      {vendors.map((vendor) => (
        <View key={vendor.id} style={styles.card}>
          <Text style={styles.cardTitle}>{vendor.shop_name}</Text>
          <Text style={styles.vendorCode}>{vendor.public_vendor_id}</Text>
          <Text style={styles.muted}>Owner: {vendor.owner_name || "N/A"}</Text>
          <Text style={styles.muted}>Phone: {vendor.phone || "N/A"}</Text>
          <Text style={styles.muted}>Location: {vendor.city_code || "UNK"}-{vendor.locality_code || "GEN"}</Text>
          <Text style={styles.statusLine}>Lifecycle: {vendor.status || "registered"} | KYC: {vendor.kyc_status || "kyc_not_started"} | Payment: {vendor.onboarding_payment_status || "payment_pending"}</Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.smallBtn} onPress={() => updateKyc(vendor.id, "kyc_under_review")}>
              <Text style={styles.smallBtnText}>Review KYC</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallBtn} onPress={() => updateKyc(vendor.id, "kyc_verified")}>
              <Text style={styles.smallBtnText}>Verify KYC</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.smallBtn, styles.activateBtn]} onPress={() => activateVendor(vendor.id)}>
              <Text style={styles.smallBtnText}>Activate</Text>
            </TouchableOpacity>
          </View>
          {(vendor.terminals || []).map((terminal: any) => (
            <View key={terminal.id} style={styles.terminalRow}>
              <Text style={styles.terminalName}>{terminal.terminal_name}</Text>
              <Text style={styles.muted}>{terminal.public_terminal_id || "Terminal ID pending"}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  heading: { fontSize: 24, fontWeight: "900" },
  subtitle: { color: "#555", lineHeight: 20, marginTop: 6, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, marginBottom: 10 },
  searchBtn: { backgroundColor: "#1166ff", borderRadius: 10, padding: 14, marginBottom: 18 },
  searchText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginBottom: 12 },
  cardTitle: { fontWeight: "900", fontSize: 16 },
  vendorCode: { marginTop: 4, fontWeight: "900", color: "#1166ff" },
  muted: { color: "#666", marginTop: 3 },
  statusLine: { marginTop: 8, color: "#111827", fontWeight: "800" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  smallBtn: { backgroundColor: "#475569", borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10 },
  activateBtn: { backgroundColor: "#16a34a" },
  smallBtnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  terminalRow: { marginTop: 10, borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 8 },
  terminalName: { fontWeight: "800" },
});
