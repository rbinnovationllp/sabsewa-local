import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import BrandHeader from "@/components/BrandHeader";
import { apiUrl } from "@/lib/backend";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

function money(value: unknown, currency = "INR") {
  return `${currency === "INR" ? "Rs" : currency} ${Number(value || 0).toFixed(2)}`;
}

function statusLabel(value: unknown) {
  return String(value || "pending").replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function VendorOnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vendor, setVendor] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [gatewayOrderId, setGatewayOrderId] = useState("");
  const [gatewayPaymentId, setGatewayPaymentId] = useState("");
  const [gatewaySignature, setGatewaySignature] = useState("");

  useEffect(() => {
    loadOnboarding();
  }, [user?.id]);

  async function loadOnboarding() {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: vendorData, error } = await supabase
        .from("vendors")
        .select("*")
        .eq("owner_user_id", user.id)
        .single();
      if (error || !vendorData) throw new Error("Vendor profile was not found.");
      setVendor(vendorData);

      const response = await fetch(apiUrl(`/api/vendor/onboarding/${vendorData.id}/summary`));
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load onboarding summary.");
      setSummary(json.summary || null);
    } catch (error) {
      Alert.alert("Onboarding", error instanceof Error ? error.message : "Unable to load onboarding.");
    } finally {
      setLoading(false);
    }
  }

  async function recordPayment() {
    if (!vendor?.id) return;
    if (!gatewayOrderId.trim() || !gatewayPaymentId.trim()) {
      Alert.alert("Payment reference required", "Enter the verified gateway order id and payment id.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(apiUrl(`/api/vendor/onboarding/${vendor.id}/payment-record`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway_order_id: gatewayOrderId.trim(),
          gateway_payment_id: gatewayPaymentId.trim(),
          gateway_signature: gatewaySignature.trim() || null,
          actor_user_id: user?.id || null,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to record onboarding payment.");
      setSummary(json.summary || null);
      setGatewayOrderId("");
      setGatewayPaymentId("");
      setGatewaySignature("");
      Alert.alert("Payment recorded", "Onboarding payment is recorded. Final activation may require KYC/admin approval.");
      await loadOnboarding();
    } catch (error) {
      Alert.alert("Onboarding payment", error instanceof Error ? error.message : "Unable to record payment.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading onboarding...</Text>
      </View>
    );
  }

  const currency = summary?.currency || "INR";
  const canPublish = Boolean(summary?.can_publish_products);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Vendor onboarding" />
      <Text style={styles.heading}>Onboarding</Text>

      {vendor ? (
        <View style={styles.panel}>
          <Text style={styles.shopName}>{vendor.shop_name || vendor.vendor_name || "Vendor"}</Text>
          <Text style={styles.muted}>{vendor.public_vendor_id || "Vendor ID pending"}</Text>
          <View style={styles.statusGrid}>
            <View style={styles.statusBox}>
              <Text style={styles.statusValue}>{statusLabel(summary?.kyc_status || vendor.kyc_status)}</Text>
              <Text style={styles.statusLabel}>KYC</Text>
            </View>
            <View style={styles.statusBox}>
              <Text style={styles.statusValue}>{statusLabel(summary?.payment_status || vendor.onboarding_payment_status)}</Text>
              <Text style={styles.statusLabel}>Payment</Text>
            </View>
            <View style={styles.statusBox}>
              <Text style={styles.statusValue}>{statusLabel(summary?.vendor_status || vendor.status)}</Text>
              <Text style={styles.statusLabel}>Lifecycle</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>Vendor profile not linked</Text>
          <Text style={styles.warningText}>Complete registration with this account before onboarding payment.</Text>
        </View>
      )}

      <View style={styles.panel}>
        <Text style={styles.section}>Payment Summary</Text>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Business category</Text>
          <Text style={styles.lineValue}>{summary?.category_slug || vendor?.category || "other"}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Onboarding fee</Text>
          <Text style={styles.lineValue}>{money(summary?.onboarding_fee, currency)}</Text>
        </View>
        <Text style={styles.muted}>{summary?.onboarding_fee_refundable ? "Refundable" : "Non-refundable"}</Text>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Security deposit</Text>
          <Text style={styles.lineValue}>{money(summary?.security_deposit, currency)}</Text>
        </View>
        <Text style={styles.muted}>{summary?.security_deposit_refundable === false ? "Not marked refundable" : "Refundable or adjustable as per vendor policy"}</Text>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Tax</Text>
          <Text style={styles.lineValue}>{money(summary?.tax_amount, currency)}</Text>
        </View>
        <View style={[styles.line, styles.totalLine]}>
          <Text style={styles.totalLabel}>Total payable</Text>
          <Text style={styles.totalValue}>{money(summary?.total_payable, currency)}</Text>
        </View>
      </View>

      {!canPublish ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>Onboarding required</Text>
          <Text style={styles.warningText}>Complete your SabSewa Local onboarding to list your store and publish products. Your payable amount includes the category-specific onboarding fee and the Rs 5,000 security deposit.</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push(`/vendor/CatalogueSetup?vendor=${vendor.id}` as any)}>
          <Text style={styles.primaryText}>Open Catalogue Setup</Text>
        </TouchableOpacity>
      )}

      {summary?.payment_status !== "payment_completed" ? (
        <View style={styles.panel}>
          <Text style={styles.section}>Verified Payment Reference</Text>
          <TextInput style={styles.input} value={gatewayOrderId} onChangeText={setGatewayOrderId} placeholder="Gateway order id" autoCapitalize="none" />
          <TextInput style={styles.input} value={gatewayPaymentId} onChangeText={setGatewayPaymentId} placeholder="Gateway payment id" autoCapitalize="none" />
          <TextInput style={styles.input} value={gatewaySignature} onChangeText={setGatewaySignature} placeholder="Gateway signature, if available" autoCapitalize="none" />
          <TouchableOpacity style={[styles.primaryBtn, saving && styles.disabled]} onPress={recordPayment} disabled={saving || !vendor?.id}>
            <Text style={styles.primaryText}>{saving ? "Recording..." : "Record Verified Payment"}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 70, paddingHorizontal: 20, paddingBottom: 48, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  heading: { fontSize: 28, fontWeight: "900", color: "#111827", marginBottom: 14 },
  panel: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 14, backgroundColor: "#fff" },
  shopName: { fontSize: 18, fontWeight: "900", color: "#111827" },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  statusBox: { flex: 1, minWidth: 110, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, backgroundColor: "#f9fafb" },
  statusValue: { fontWeight: "900", color: "#111827" },
  statusLabel: { marginTop: 4, color: "#6b7280", fontSize: 12 },
  section: { fontSize: 18, fontWeight: "900", color: "#111827", marginBottom: 10 },
  line: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  lineLabel: { color: "#374151", fontWeight: "700", flex: 1 },
  lineValue: { color: "#111827", fontWeight: "900" },
  totalLine: { borderBottomWidth: 0, marginTop: 6 },
  totalLabel: { color: "#111827", fontWeight: "900", fontSize: 16 },
  totalValue: { color: "#1166ff", fontWeight: "900", fontSize: 18 },
  muted: { color: "#6b7280", fontSize: 12, lineHeight: 18 },
  warningBox: { borderWidth: 1, borderColor: "#fed7aa", borderRadius: 8, padding: 14, marginBottom: 14, backgroundColor: "#fff7ed" },
  warningTitle: { color: "#9a3412", fontWeight: "900" },
  warningText: { color: "#7c2d12", marginTop: 6, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: "#fff" },
  primaryBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14, marginBottom: 14 },
  primaryText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  disabled: { opacity: 0.6 },
});
