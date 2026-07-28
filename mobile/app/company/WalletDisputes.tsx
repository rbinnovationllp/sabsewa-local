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
import { apiUrl } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";
import BrandHeader from "@/components/BrandHeader";

export default function CompanyWalletDisputesScreen() {
  const { user } = useAuth();
  const [vendorId, setVendorId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [disputes, setDisputes] = useState<any[]>([]);
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});

  async function searchDisputes() {
    const query = new URLSearchParams();
    if (vendorId.trim()) query.set("vendor_id", vendorId.trim());
    if (orderId.trim()) query.set("order_id", orderId.trim());
    if (transactionId.trim()) query.set("transaction_id", transactionId.trim());

    const response = await fetch(apiUrl(`/api/vendor/security-wallet/admin/disputes?${query.toString()}`));
    const json = await response.json();

    if (!response.ok || !json.success) {
      Alert.alert("Search failed", json.error || "Unable to load wallet disputes.");
      return;
    }

    setDisputes(json.disputes || []);
  }

  async function reviewDispute(dispute: any, action: "reversal" | "reject") {
    const reason = reviewReasons[dispute.id]?.trim();
    if (!reason) {
      Alert.alert("Reason required", "A mandatory review reason is required.");
      return;
    }

    const endpoint =
      action === "reversal"
        ? `/api/vendor/security-wallet/admin/disputes/${dispute.id}/reversal`
        : `/api/vendor/security-wallet/admin/disputes/${dispute.id}/reject`;

    const response = await fetch(apiUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_user_id: user?.id,
        reason,
      }),
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Review failed", json.error || "Unable to update dispute.");
      return;
    }

    Alert.alert("Dispute updated", action === "reversal" ? "Reversal entry created." : "Dispute rejected.");
    await searchDisputes();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Company Master CRM" />
      <Text style={styles.heading}>Wallet Disputes</Text>
      <Text style={styles.subtitle}>
        Search, compare evidence, and approve only documented reversal entries. Original transactions remain unchanged.
      </Text>

      <TextInput style={styles.input} placeholder="Vendor ID" value={vendorId} onChangeText={setVendorId} />
      <TextInput style={styles.input} placeholder="Order ID" value={orderId} onChangeText={setOrderId} />
      <TextInput style={styles.input} placeholder="Transaction ID" value={transactionId} onChangeText={setTransactionId} />

      <TouchableOpacity style={styles.searchBtn} onPress={searchDisputes}>
        <Text style={styles.searchText}>Search Disputes</Text>
      </TouchableOpacity>

      {disputes.map((dispute) => (
        <View key={dispute.id} style={styles.card}>
          <Text style={styles.cardTitle}>Dispute #{String(dispute.id).slice(0, 8)}</Text>
          <Text style={styles.muted}>Status: {dispute.status}</Text>
          <Text style={styles.muted}>Vendor: {dispute.vendor_id}</Text>
          <Text style={styles.muted}>Order: {dispute.order_id || "Not linked"}</Text>
          <Text style={styles.muted}>Transaction: {dispute.wallet_transaction_id}</Text>
          <Text style={styles.complaint}>{dispute.complaint_text}</Text>

          <TextInput
            style={[styles.input, styles.reasonInput]}
            placeholder="Mandatory review reason"
            value={reviewReasons[dispute.id] || ""}
            onChangeText={(text) =>
              setReviewReasons((current) => ({ ...current, [dispute.id]: text }))
            }
          />

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.approveBtn} onPress={() => reviewDispute(dispute, "reversal")}>
              <Text style={styles.actionText}>Approve Reversal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rejectBtn} onPress={() => reviewDispute(dispute, "reject")}>
              <Text style={styles.actionText}>Reject</Text>
            </TouchableOpacity>
          </View>
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
  muted: { color: "#666", marginTop: 3 },
  complaint: { marginTop: 10, lineHeight: 20 },
  reasonInput: { marginTop: 12 },
  actionRow: { flexDirection: "row", gap: 10 },
  approveBtn: { flex: 1, backgroundColor: "#16a34a", borderRadius: 8, padding: 12 },
  rejectBtn: { flex: 1, backgroundColor: "#dc2626", borderRadius: 8, padding: 12 },
  actionText: { color: "#fff", fontWeight: "900", textAlign: "center" },
});
