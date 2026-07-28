import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { apiUrl } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";

function money(value: unknown) {
  return `Rs ${Number(value || 0).toFixed(2)}`;
}

export default function VendorExitAndRefundScreen() {
  const params: any = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const vendorId = params.vendor ? String(params.vendor) : "";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    loadPreview();
  }, [vendorId]);

  async function loadPreview() {
    if (!vendorId) return;
    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/vendor/security-wallet/${vendorId}/closure-preview`));
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to calculate refund.");
      setPreview(json.preview);
    } catch (error) {
      Alert.alert("Refund preview failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function submitClosureRequest() {
    if (!vendorId) return;
    if (!acknowledged) {
      Alert.alert("Acknowledgement required", "Please confirm that you have reviewed the refund calculation.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(apiUrl(`/api/vendor/security-wallet/${vendorId}/closure-request`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requested_by: user?.id || null,
          reason: reason.trim(),
          vendor_acknowledged: acknowledged,
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Closure request failed.");

      Alert.alert("Closure request submitted", "New order receiving has been stopped. The company will review and process the eligible refund.");
      router.replace(`/vendor/SecurityWallet?vendor=${vendorId}` as any);
    } catch (error) {
      Alert.alert("Request failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Calculating refund preview...</Text>
      </View>
    );
  }

  const calculation = preview?.calculation || {};

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Vendor Exit & Refund</Text>
      <Text style={styles.subtitle}>
        Submit this request only if you want to discontinue SabSewa Local. New customer orders will stop after submission.
      </Text>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Refund Preview</Text>
        <View style={styles.row}><Text>Current advance balance</Text><Text style={styles.value}>{money(preview?.balance_at_request)}</Text></View>
        <View style={styles.row}><Text>Activation/service charge deducted at closure</Text><Text style={styles.debit}>- {money(preview?.activation_usage_charge)}</Text></View>
        <View style={styles.row}><Text>Non-refundable activation fee already collected</Text><Text style={styles.value}>{money(preview?.non_refundable_activation_fee_previously_collected || 500)}</Text></View>
        <View style={styles.row}><Text>Unpaid completed-order fees</Text><Text style={styles.debit}>- {money(preview?.unpaid_order_fees)}</Text></View>
        <View style={styles.row}><Text>Other legal adjustments</Text><Text style={styles.debit}>- {money(preview?.legal_adjustments)}</Text></View>
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Estimated refund</Text><Text style={styles.total}>{money(preview?.estimated_refund)}</Text></View>
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>Important</Text>
        <Text style={styles.noticeText}>
          New orders stop when the available advance balance falls below Rs 515. This preserves the operational threshold for platform continuity and one Rs 15 successful-order platform fee.
        </Text>
        <Text style={styles.noticeText}>
          The Rs 500 activation and platform-service charge is collected once during initial activation as part of the Rs 5,500 payment. It is recorded separately, is non-refundable, and is not deducted again at voluntary closure.
        </Text>
        <Text style={styles.noticeText}>
          Suspensions, fraud allegations, NDA violations, confidentiality breaches, or other policy violations require separate investigation, notice, evidence, and reasonable opportunity to respond.
        </Text>
        <Text style={styles.noticeText}>
          Customer order payments are direct between customer and vendor. This refund preview applies only to the SabSewa Local vendor advance balance.
        </Text>
      </View>

      {calculation?.unpaid_completed_order_ids?.length ? (
        <Text style={styles.muted}>
          Uncharged completed orders: {calculation.unpaid_completed_order_ids.join(", ")}
        </Text>
      ) : null}

      <Text style={styles.label}>Reason for leaving</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        multiline
        value={reason}
        onChangeText={setReason}
        placeholder="Optional reason"
      />

      <TouchableOpacity style={styles.checkRow} onPress={() => setAcknowledged((value) => !value)}>
        <View style={[styles.checkbox, acknowledged && styles.checked]}>
          {acknowledged ? <Text style={styles.checkText}>✓</Text> : null}
        </View>
        <Text style={styles.checkLabel}>I have reviewed the refund calculation and understand that new order receiving will stop.</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.submitBtn, (!acknowledged || submitting) && styles.disabled]}
        disabled={!acknowledged || submitting}
        onPress={submitClosureRequest}
      >
        <Text style={styles.submitText}>{submitting ? "Submitting..." : "Submit Closure Request"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  heading: { fontSize: 24, fontWeight: "900" },
  subtitle: { marginTop: 6, marginBottom: 16, color: "#555", lineHeight: 20 },
  muted: { color: "#666", marginTop: 10 },
  panel: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginBottom: 14 },
  panelTitle: { fontWeight: "900", marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  value: { fontWeight: "800" },
  debit: { color: "#dc2626", fontWeight: "800" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 10, marginTop: 4 },
  totalLabel: { fontWeight: "900" },
  total: { color: "#16a34a", fontWeight: "900", fontSize: 18 },
  notice: { backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 10, padding: 12, marginBottom: 14 },
  noticeTitle: { fontWeight: "900", color: "#c2410c", marginBottom: 6 },
  noticeText: { color: "#555", lineHeight: 19, marginBottom: 6 },
  label: { fontWeight: "800", marginBottom: 8, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, marginBottom: 14 },
  textArea: { minHeight: 84, textAlignVertical: "top" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: "#777", borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  checkText: { color: "#fff", fontWeight: "900" },
  checkLabel: { flex: 1, color: "#444", lineHeight: 19 },
  submitBtn: { backgroundColor: "#dc2626", borderRadius: 10, padding: 14, alignItems: "center" },
  disabled: { opacity: 0.55 },
  submitText: { color: "#fff", fontWeight: "900" },
});
