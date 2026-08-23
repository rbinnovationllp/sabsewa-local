import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";

const filters = ["pending", "approved", "rejected", "more_information_required", "all"];

export default function VendorProfileChangeRequestsScreen() {
  const [filter, setFilter] = useState("pending");
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    loadRequests();
  }, [filter]);

  async function loadRequests() {
    const response = await authenticatedFetch(`/api/company/vendor-profile-change-requests?status=${encodeURIComponent(filter)}`);
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Profile requests unavailable", json.error || "Unable to load vendor profile change requests.");
      return;
    }
    setRequests(json.requests || []);
  }

  function promptReason(defaultText = "") {
    const promptFn = (globalThis as any).prompt;
    return promptFn ? String(promptFn("Enter review reason / remarks", defaultText) || "").trim() : defaultText;
  }

  async function decide(id: string, decision: string) {
    const reason = decision === "approved" ? promptReason("Approved after Company review.") : promptReason("");
    if (decision !== "approved" && !reason) {
      Alert.alert("Reason required", "Please enter a reason for this decision.");
      return;
    }
    const response = await authenticatedFetch(`/api/company/vendor-profile-change-requests/${id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Decision failed", json.error || "Unable to update profile change request.");
      return;
    }
    await loadRequests();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Company Master CRM" />
      <Text style={styles.heading}>Vendor Profile Change Requests</Text>
      <View style={styles.filterRow}>
        {filters.map((item) => (
          <TouchableOpacity key={item} style={[styles.filterBtn, filter === item && styles.filterActive]} onPress={() => setFilter(item)}>
            <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item.replace(/_/g, " ")}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {requests.length ? requests.map((request) => {
        const vendor = request.vendors || {};
        const proposed = request.field_changes?.proposed_masked || request.field_changes || {};
        return (
          <View key={request.id} style={styles.card}>
            <Text style={styles.title}>{vendor.shop_name || vendor.vendor_name || "Vendor"}</Text>
            <Text style={styles.line}>Owner: {vendor.owner_name || "Not recorded"} | Phone: {vendor.phone_number || vendor.phone || "Not recorded"}</Text>
            <Text style={styles.line}>Category: {request.change_category} | Status: {request.review_status}</Text>
            <Text style={styles.line}>Verification: {request.verification_status}</Text>
            <Text style={styles.line}>Submitted: {request.submitted_at ? new Date(request.submitted_at).toLocaleString() : "Not recorded"}</Text>
            <Text style={styles.subTitle}>Proposed masked details</Text>
            {Object.entries(proposed).map(([key, value]) => (
              <Text key={key} style={styles.line}>{key}: {String(value)}</Text>
            ))}
            {request.review_status === "pending" ? (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.approveBtn} onPress={() => decide(request.id, "approved")}>
                  <Text style={styles.approveText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.warnBtn} onPress={() => decide(request.id, "more_information_required")}>
                  <Text style={styles.warnText}>Further Enquiry</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.rejectBtn} onPress={() => decide(request.id, "rejected")}>
                  <Text style={styles.rejectText}>Reject</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        );
      }) : <Text style={styles.empty}>No vendor profile change requests found.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 70, paddingBottom: 50, backgroundColor: "#fff" },
  heading: { fontSize: 26, fontWeight: "900", marginBottom: 14 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  filterBtn: { borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  filterActive: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  filterText: { color: "#1166ff", fontWeight: "800", textTransform: "capitalize" },
  filterTextActive: { color: "#fff" },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 12, backgroundColor: "#fff" },
  title: { fontSize: 18, fontWeight: "900", color: "#111827" },
  subTitle: { fontWeight: "900", marginTop: 10, color: "#334155" },
  line: { color: "#475569", marginTop: 4 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  approveBtn: { borderWidth: 1, borderColor: "#22c55e", borderRadius: 8, padding: 10 },
  approveText: { color: "#15803d", fontWeight: "900" },
  warnBtn: { borderWidth: 1, borderColor: "#f59e0b", borderRadius: 8, padding: 10 },
  warnText: { color: "#9a3412", fontWeight: "900" },
  rejectBtn: { borderWidth: 1, borderColor: "#ef4444", borderRadius: 8, padding: 10 },
  rejectText: { color: "#b91c1c", fontWeight: "900" },
  empty: { color: "#64748b", marginTop: 20 },
});
