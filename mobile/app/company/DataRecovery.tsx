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

export default function CompanyDataRecoveryScreen() {
  const { user } = useAuth();
  const [vendorId, setVendorId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [statementMonth, setStatementMonth] = useState("");
  const [orderId, setOrderId] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [reason, setReason] = useState("");
  const [records, setRecords] = useState<any[]>([]);

  async function recoverWalletTransactions(restoreToActiveView = false) {
    if (!reason.trim()) {
      Alert.alert("Reason required", "Enter why this recovery is needed.");
      return;
    }

    const response = await fetch(apiUrl("/api/vendor/security-wallet/admin/recovery/wallet-transactions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_user_id: user?.id,
        reason,
        vendor_id: vendorId || undefined,
        customer_id: customerId || undefined,
        statement_month: statementMonth || undefined,
        order_id: orderId || undefined,
        transaction_id: transactionId || undefined,
        restore_to_active_view: restoreToActiveView,
      }),
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Recovery failed", json.error || "Unable to recover wallet records.");
      return;
    }

    setRecords(json.records || []);
    Alert.alert("Recovery logged", `${json.records?.length || 0} wallet records found.`);
  }

  async function recoverCreditAccounts(restoreToActiveView = false) {
    if (!reason.trim()) {
      Alert.alert("Reason required", "Enter why this recovery is needed.");
      return;
    }

    const response = await fetch(apiUrl("/api/vendor/credit/admin/recovery/credit-accounts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_user_id: user?.id,
        reason,
        vendor_id: vendorId || undefined,
        customer_id: customerId || undefined,
        restore_to_active_view: restoreToActiveView,
      }),
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Recovery failed", json.error || "Unable to recover credit records.");
      return;
    }

    setRecords(json.records || []);
    Alert.alert("Recovery logged", `${json.records?.length || 0} credit records found.`);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Data Recovery</Text>
      <Text style={styles.subtitle}>
        Recover only required archived or soft-deleted records within the approved six-month window. Every search is audit logged.
      </Text>

      <TextInput style={styles.input} placeholder="Vendor ID" value={vendorId} onChangeText={setVendorId} />
      <TextInput style={styles.input} placeholder="Customer ID" value={customerId} onChangeText={setCustomerId} />
      <TextInput style={styles.input} placeholder="Statement month, YYYY-MM-01" value={statementMonth} onChangeText={setStatementMonth} />
      <TextInput style={styles.input} placeholder="Order ID" value={orderId} onChangeText={setOrderId} />
      <TextInput style={styles.input} placeholder="Transaction ID" value={transactionId} onChangeText={setTransactionId} />
      <TextInput
        style={[styles.input, styles.reasonInput]}
        placeholder="Mandatory recovery reason"
        value={reason}
        onChangeText={setReason}
        multiline
      />

      <TouchableOpacity style={styles.primaryBtn} onPress={() => recoverWalletTransactions(false)}>
        <Text style={styles.btnText}>Recover Wallet Evidence Read-Only</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => recoverWalletTransactions(true)}>
        <Text style={styles.btnText}>Restore Wallet Records To Active View</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.primaryBtn} onPress={() => recoverCreditAccounts(false)}>
        <Text style={styles.btnText}>Recover Credit Records Read-Only</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => recoverCreditAccounts(true)}>
        <Text style={styles.btnText}>Restore Credit Records To Active View</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Recovered Records</Text>
      {records.map((record) => (
        <View key={record.id} style={styles.card}>
          <Text style={styles.cardTitle}>Record #{String(record.id).slice(0, 8)}</Text>
          <Text style={styles.muted}>Vendor: {record.vendor_id || "N/A"}</Text>
          <Text style={styles.muted}>Order: {record.order_id || "N/A"}</Text>
          <Text style={styles.muted}>Archived: {record.archived_at || "No"}</Text>
          <Text style={styles.muted}>Recoverable until: {record.recoverable_until || "Subject to legal policy"}</Text>
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
  reasonInput: { minHeight: 86, textAlignVertical: "top" },
  primaryBtn: { backgroundColor: "#1166ff", borderRadius: 10, padding: 14, marginBottom: 10 },
  secondaryBtn: { backgroundColor: "#0f766e", borderRadius: 10, padding: 14, marginBottom: 10 },
  btnText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  sectionTitle: { fontSize: 18, fontWeight: "900", marginTop: 14, marginBottom: 10 },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, marginBottom: 10 },
  cardTitle: { fontWeight: "900" },
  muted: { color: "#666", marginTop: 3 },
});
