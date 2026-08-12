import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";

function hoursText(vendor: any) {
  const value = vendor?.kyc_sla?.hours_pending;
  if (value == null) return "Not submitted";
  return `${Number(value).toFixed(1)} hours`;
}

export default function KycReviewQueueScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const { user } = useAuth();
  const [vendors, setVendors] = useState<any[]>([]);
  const filter = String(params.filter || "pending_review");

  useEffect(() => { loadQueue(); }, [filter]);

  async function loadQueue() {
    const response = await authenticatedFetch(`/api/company/kyc/queue?filter=${encodeURIComponent(filter)}`);
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("KYC queue unavailable", json.error || "Unable to load KYC queue.");
      return;
    }
    setVendors(json.vendors || []);
  }

  function askReviewText(label: string, required = false) {
    const promptFn = (globalThis as any).prompt;
    const value = promptFn ? String(promptFn(label) || "").trim() : "";
    if (required && !value) {
      Alert.alert("KYC review", label);
      return null;
    }
    return value;
  }

  function confirmReview(message: string) {
    const confirmFn = (globalThis as any).confirm;
    return confirmFn ? Boolean(confirmFn(message)) : true;
  }

  async function updateKyc(vendorId: string, status: string, options: any = {}) {
    let reason = "";
    let admin_remarks = "";
    let required_information = "";
    let follow_up_date = "";

    if (options.reasonRequired) {
      reason = askReviewText(options.reasonPrompt || "Enter reason for this KYC decision", true) || "";
      if (!reason) return;
    }
    if (options.requestInfo) {
      required_information = askReviewText("What information/documents should the vendor submit?", true) || "";
      if (!required_information) return;
    }
    if (options.remarks) admin_remarks = askReviewText("Admin remarks, if any") || "";
    if (options.followUp) follow_up_date = askReviewText("Optional follow-up date (YYYY-MM-DD)") || "";
    if (!confirmReview(options.confirm || "Are you sure you want to update this KYC case?")) return;

    const response = await authenticatedFetch(`/api/vendor/onboarding/${vendorId}/kyc-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, actor_user_id: user?.id || null, reason, admin_remarks, required_information, follow_up_date }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("KYC update failed", json.error || "Unable to update KYC.");
      return;
    }
    Alert.alert("KYC review", "Vendor KYC record updated.");
    await loadQueue();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Company Master CRM" />
      <Text style={styles.heading}>KYC Review Queue</Text>
      <Text style={styles.subtitle}>Oldest submitted KYC cases are shown first. Open the vendor KYC record before approving.</Text>

      {vendors.length === 0 ? <Text style={styles.empty}>No vendors in this queue.</Text> : null}
      {vendors.map((vendor) => (
        <View key={vendor.id} style={[styles.card, vendor.kyc_sla?.is_overdue && styles.overdueCard, vendor.kyc_sla?.is_approaching_deadline && styles.warnCard]}>
          <Text style={styles.shop}>{vendor.shop_name || "Unnamed shop"}</Text>
          <Text style={styles.meta}>Vendor ID: {vendor.public_vendor_id || vendor.id}</Text>
          <Text style={styles.meta}>Category: {vendor.category || "N/A"}</Text>
          <Text style={styles.meta}>Submitted: {vendor.kyc_submitted_at || "Not submitted"}</Text>
          <Text style={styles.meta}>Time pending: {hoursText(vendor)}</Text>
          <Text style={styles.status}>KYC: {String(vendor.kyc_status || "").replace(/_/g, " ")}</Text>
          {vendor.kyc_sla?.is_overdue ? <Text style={styles.danger}>48-hour review deadline exceeded.</Text> : null}
          {vendor.kyc_sla?.is_approaching_deadline ? <Text style={styles.warn}>Approaching 48-hour review deadline.</Text> : null}
          <View style={styles.row}>
            <TouchableOpacity style={styles.btn} onPress={() => router.push(`/vendor/KYC?vendor=${vendor.id}` as any)}>
              <Text style={styles.btnText}>Review KYC</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.approveBtn} onPress={() => updateKyc(vendor.id, "kyc_verified", { remarks: true, confirm: "Are you sure you want to verify this vendor KYC?" })}>
              <Text style={styles.btnText}>Approve / Verify KYC</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.holdBtn} onPress={() => updateKyc(vendor.id, "additional_information_required", { reasonRequired: true, requestInfo: true, followUp: true, confirm: "Request additional information from this vendor?" })}>
              <Text style={styles.btnText}>Request Further Information</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => updateKyc(vendor.id, "kyc_rejected", { reasonRequired: true, remarks: true, confirm: "Are you sure you want to reject this vendor KYC?" })}>
              <Text style={styles.btnText}>Reject KYC</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40, backgroundColor: "#fff" },
  heading: { fontSize: 24, fontWeight: "900", color: "#111827" },
  subtitle: { color: "#64748b", marginTop: 6, marginBottom: 16, lineHeight: 20 },
  empty: { color: "#64748b", marginTop: 20 },
  card: { borderWidth: 1, borderColor: "#dbeafe", backgroundColor: "#eff6ff", borderRadius: 8, padding: 14, marginBottom: 12 },
  warnCard: { borderColor: "#fdba74", backgroundColor: "#fff7ed" },
  overdueCard: { borderColor: "#fca5a5", backgroundColor: "#fef2f2" },
  shop: { fontWeight: "900", fontSize: 17, color: "#0f172a" },
  meta: { color: "#334155", marginTop: 3 },
  status: { marginTop: 8, fontWeight: "900", color: "#1166ff" },
  danger: { color: "#991b1b", fontWeight: "900", marginTop: 6 },
  warn: { color: "#9a3412", fontWeight: "900", marginTop: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  btn: { backgroundColor: "#475569", borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10 },
  approveBtn: { backgroundColor: "#16a34a", borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10 },
  holdBtn: { backgroundColor: "#f59e0b", borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10 },
  rejectBtn: { backgroundColor: "#dc2626", borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10 },
  btnText: { color: "#fff", fontWeight: "900", fontSize: 12 },
});