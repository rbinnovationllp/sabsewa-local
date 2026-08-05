import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useAuth } from "@/providers/AuthProvider";
import { apiUrl } from "@/lib/backend";

export default function CustomerCreditLedgerScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    loadCredit();
  }, [user?.id]);

  async function loadCredit() {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/settlement/customer/${user.id}/credit`));
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load credit ledger.");
      setAccounts(json.accounts || []);
      setRequests(json.repayment_requests || []);
    } catch (error) {
      Alert.alert("Credit ledger", error instanceof Error ? error.message : "Unable to load credit ledger.");
    } finally {
      setLoading(false);
    }
  }

  async function submitRepayment(account: any) {
    const enteredAmount = Number(amounts[account.id] || account.outstanding_balance || 0);
    if (!enteredAmount || enteredAmount <= 0) {
      Alert.alert("Amount required", "Enter the amount you paid to the vendor.");
      return;
    }
    setSubmitting(account.id);
    try {
      const response = await fetch(apiUrl(`/api/settlement/customer/${user?.id}/credit/${account.id}/repayment`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: enteredAmount,
          payment_method: "vendor_qr",
          payment_reference: references[account.id]?.trim() || null,
          customer_note: notes[account.id]?.trim() || "Paid directly to vendor QR. Please verify.",
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to submit repayment.");
      Alert.alert("Submitted", "Your repayment reference has been sent to the vendor for confirmation.");
      await loadCredit();
    } catch (error) {
      Alert.alert("Repayment", error instanceof Error ? error.message : "Unable to submit repayment.");
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading outstanding payments...</Text>
      </View>
    );
  }

  const pendingByAccount = new Map(
    requests.filter((request) => request.status === "submitted").map((request) => [request.account_id, request])
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Repay Credit</Text>
      <Text style={styles.subtitle}>Scan the vendor QR and pay the outstanding balance directly to the shop. Submit the reference after payment so the vendor can verify receipt.</Text>

      {accounts.length === 0 ? <Text style={styles.muted}>No outstanding credit balance.</Text> : null}

      {accounts.map((account) => {
        const pending = pendingByAccount.get(account.id);
        return (
          <View key={account.id} style={styles.card}>
            <Text style={styles.vendorName}>{account.vendor?.shop_name || account.vendor?.vendor_name || "Vendor"}</Text>
            <Text style={styles.amount}>Outstanding: Rs {Number(account.outstanding_balance || 0).toFixed(2)}</Text>
            <Text style={styles.muted}>Due date: {account.due_date || "Not set"}</Text>

            {account.qr_code?.public_url ? (
              <View style={styles.qrBox}>
                <Image source={{ uri: account.qr_code.public_url }} style={styles.qrImage} resizeMode="contain" />
                <Text style={styles.muted}>UPI: {account.qr_code.upi_id || account.upi_id || "Vendor UPI"}</Text>
              </View>
            ) : (
              <View style={styles.warningPanel}>
                <Text style={styles.warningText}>This vendor has not uploaded a QR code. Contact the shop or use another approved payment method.</Text>
              </View>
            )}

            {pending ? (
              <View style={styles.pendingPanel}>
                <Text style={styles.pendingTitle}>Repayment submitted</Text>
                <Text style={styles.muted}>Rs {Number(pending.amount || 0).toFixed(2)} is awaiting vendor verification.</Text>
              </View>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={amounts[account.id] ?? String(Number(account.outstanding_balance || 0).toFixed(2))}
                  onChangeText={(text) => setAmounts((current) => ({ ...current, [account.id]: text }))}
                  placeholder="Amount paid"
                />
                <TextInput
                  style={styles.input}
                  value={references[account.id] || ""}
                  onChangeText={(text) => setReferences((current) => ({ ...current, [account.id]: text }))}
                  placeholder="UPI reference / UTR / transaction note"
                />
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={notes[account.id] || ""}
                  onChangeText={(text) => setNotes((current) => ({ ...current, [account.id]: text }))}
                  placeholder="Optional note to vendor"
                  multiline
                />
                <TouchableOpacity style={styles.submitBtn} onPress={() => submitRepayment(account)} disabled={submitting === account.id}>
                  <Text style={styles.btnText}>{submitting === account.id ? "Submitting..." : "Mark Payment Completed"}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  heading: { fontSize: 26, fontWeight: "900", color: "#111827" },
  subtitle: { color: "#555", lineHeight: 20, marginTop: 6, marginBottom: 18 },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 16, backgroundColor: "#fff" },
  vendorName: { fontSize: 18, fontWeight: "900", color: "#111827" },
  amount: { fontSize: 20, fontWeight: "900", color: "#166534", marginTop: 8 },
  muted: { color: "#6b7280", marginTop: 5 },
  qrBox: { alignItems: "center", backgroundColor: "#ecfdf5", borderRadius: 8, padding: 12, marginVertical: 12 },
  qrImage: { width: 220, height: 220, backgroundColor: "#fff" },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, padding: 12, marginTop: 10 },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  submitBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14, marginTop: 12 },
  btnText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  warningPanel: { borderWidth: 1, borderColor: "#fed7aa", borderRadius: 8, padding: 12, backgroundColor: "#fff7ed", marginVertical: 12 },
  warningText: { color: "#7c2d12", lineHeight: 19 },
  pendingPanel: { borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 8, padding: 12, backgroundColor: "#eff6ff", marginTop: 12 },
  pendingTitle: { color: "#1d4ed8", fontWeight: "900" },
});
