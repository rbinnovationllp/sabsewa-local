import { useEffect, useMemo, useState } from "react";
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
import { useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { apiUrl } from "@/lib/backend";

type LedgerEntry = {
  id: string;
  vendor_id: string;
  customer_id: string;
  order_id?: string | null;
  transaction_type: string;
  amount: number;
  balance_after: number;
  notes?: string | null;
  created_at: string;
};

type CreditAccount = {
  customer_id: string;
  customer_name?: string | null;
  customer_mobile?: string | null;
  credit_limit: number;
  outstanding_balance: number;
  available_credit: number;
  due_date?: string | null;
  status: string;
};

export default function CreditListScreen() {
  const params: any = useLocalSearchParams();
  const { user } = useAuth();

  const vendorParam = params.vendor as string | undefined;

  const [vendorId, setVendorId] = useState<string | null>(vendorParam || null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [repaymentRequests, setRepaymentRequests] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<CreditAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerId, setCustomerId] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [paymentDueDays, setPaymentDueDays] = useState("7");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const balances = useMemo(
    () => [...accounts].sort((a, b) => Number(b.outstanding_balance) - Number(a.outstanding_balance)),
    [accounts]
  );
  const filteredBalances = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return balances;
    return balances.filter((account) =>
      [
        account.customer_id,
        account.customer_name,
        account.customer_mobile,
        account.status,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [balances, search]);

  const creditSummary = useMemo(() => {
    const totalOutstanding = balances.reduce((sum, account) => sum + Number(account.outstanding_balance || 0), 0);
    const totalLimit = balances.reduce((sum, account) => sum + Number(account.credit_limit || 0), 0);
    const customersDue = balances.filter((account) => Number(account.outstanding_balance || 0) > 0).length;
    const recovered = entries
      .filter((entry) => entry.transaction_type === "payment_recorded")
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const creditGiven = entries
      .filter((entry) => entry.transaction_type === "credit_purchase")
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

    return { totalOutstanding, totalLimit, customersDue, recovered, creditGiven };
  }, [balances, entries]);

  const ageing = useMemo(() => {
    const buckets = [
      { key: "0_7", label: "Outstanding 0-7 Days", min: 0, max: 7, amount: 0, count: 0 },
      { key: "8_15", label: "8-15 Days", min: 8, max: 15, amount: 0, count: 0 },
      { key: "16_30", label: "16-30 Days", min: 16, max: 30, amount: 0, count: 0 },
      { key: "31_60", label: "31-60 Days", min: 31, max: 60, amount: 0, count: 0 },
      { key: "60_plus", label: "60+ Days", min: 61, max: Infinity, amount: 0, count: 0 },
    ];
    const today = new Date();
    balances.forEach((account) => {
      const due = Number(account.outstanding_balance || 0);
      if (due <= 0) return;
      const dueDate = account.due_date ? new Date(account.due_date) : today;
      const ageDays = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000)));
      const bucket = buckets.find((item) => ageDays >= item.min && ageDays <= item.max) || buckets[0];
      bucket.amount += due;
      bucket.count += 1;
    });
    return buckets;
  }, [balances]);

  useEffect(() => {
    resolveVendorAndLoad();
  }, [vendorParam, user?.id]);

  async function resolveVendorAndLoad() {
    setLoading(true);
    let resolvedVendorId = vendorParam || null;

    if (!resolvedVendorId && user?.id) {
      const { data } = await supabase
        .from("vendors")
        .select("id")
        .eq("owner_user_id", user.id)
        .single();

      resolvedVendorId = data?.id || null;
    }

    setVendorId(resolvedVendorId);
    if (resolvedVendorId) await loadLedger(resolvedVendorId);
    setLoading(false);
  }

  async function loadLedger(nextVendorId = vendorId) {
    if (!nextVendorId) return;

    const response = await fetch(apiUrl(`/api/vendor/credit/${nextVendorId}`));
    const json = await response.json();

    if (!response.ok || !json.success) {
      Alert.alert("Credit ledger error", json.error || "Unable to load credit ledger.");
      setEntries([]);
      setAccounts([]);
      return;
    }

    setAccounts((json.accounts || []).map((account: any) => ({
      ...account,
      credit_limit: Number(account.credit_limit || 0),
      outstanding_balance: Number(account.outstanding_balance || 0),
      available_credit: Number(account.available_credit || 0),
    })));
    setEntries((json.transactions || []).map((entry: any) => ({
      ...entry,
      amount: Number(entry.amount),
      balance_after: Number(entry.balance_after || 0),
    })));
    setRepaymentRequests(json.repayment_requests || []);
  }

  async function approveLimit() {
    if (!vendorId) return Alert.alert("Vendor not found", "Please complete vendor setup first.");
    const limit = Number(creditLimit);
    if (!customerId.trim() || !Number.isFinite(limit) || limit < 0) {
      Alert.alert("Missing details", "Enter customer ID and credit limit.");
      return;
    }

    setSaving(true);
    const response = await fetch(apiUrl(`/api/vendor/credit/${vendorId}/account`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId.trim(),
        credit_limit: limit,
        payment_due_days: Number(paymentDueDays || 7),
        vendor_user_id: user?.id,
        notes: notes.trim() || "Vendor approved customer credit limit.",
      }),
    });
    const json = await response.json();
    setSaving(false);

    if (!response.ok || !json.success) {
      Alert.alert("Credit limit not saved", json.error || "Unable to save credit limit.");
      return;
    }

    setCreditLimit("");
    setNotes("");
    await loadLedger(vendorId);
  }

  async function recordPayment() {
    if (!vendorId) {
      Alert.alert("Vendor not found", "Please complete vendor setup first.");
      return;
    }

    const paymentAmount = Number(amount);
    if (!customerId.trim() || !paymentAmount || paymentAmount <= 0) {
      Alert.alert("Missing details", "Enter customer ID and payment amount.");
      return;
    }

    setSaving(true);
    const response = await fetch(apiUrl(`/api/vendor/credit/${vendorId}/payment`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId.trim(),
        amount: paymentAmount,
        vendor_user_id: user?.id,
        notes: notes.trim() || `Payment received: Rs ${paymentAmount}`,
      }),
    });
    const json = await response.json();

    setSaving(false);

    if (!response.ok || !json.success) {
      Alert.alert("Payment not saved", json.error || "Unable to record payment.");
      return;
    }

    setCustomerId("");
    setAmount("");
    setNotes("");
    await loadLedger(vendorId);
  }

  async function suspendCustomerCredit(nextCustomerId: string) {
    if (!vendorId) return;
    const response = await fetch(apiUrl(`/api/vendor/credit/${vendorId}/suspend`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_id: nextCustomerId,
        vendor_user_id: user?.id,
        reason: "Suspended by vendor from mobile app.",
      }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Suspend failed", json.error || "Unable to suspend credit.");
      return;
    }
    await loadLedger(vendorId);
  }


  async function verifyRepayment(requestId: string, approved: boolean) {
    if (!vendorId) return;
    const response = await fetch(apiUrl(`/api/settlement/vendor/${vendorId}/repayments/${requestId}/verify`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        approved,
        vendor_user_id: user?.id,
        vendor_note: approved ? "Payment receipt verified by vendor." : "Payment reference rejected by vendor.",
      }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Repayment review failed", json.error || "Unable to review repayment.");
      return;
    }
    await loadLedger(vendorId);
  }

  async function requestPayment(nextCustomerId: string) {
    if (!vendorId) return;
    const response = await fetch(apiUrl(`/api/vendor/credit/${vendorId}/reminder`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customer_id: nextCustomerId, reminder_type: "due_soon" }),
    });
    const json = await response.json();
    Alert.alert(response.ok && json.success ? "Reminder queued" : "Reminder failed", json.message || json.error || "Unable to queue reminder.");
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading credit ledger...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Customer Credit Ledger</Text>
      <Text style={styles.subtitle}>
        Vendor-owned customer credit ledger. SabSewa Local records limits, purchases, payments, due dates, and balances only. The vendor alone decides credit and handles recovery.
      </Text>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>Rs {creditSummary.creditGiven.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Total Credit Sales</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>Rs {creditSummary.recovered.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Credit Recovered</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>Rs {creditSummary.totalOutstanding.toFixed(2)}</Text>
          <Text style={styles.summaryLabel}>Current Outstanding</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{creditSummary.customersDue}</Text>
          <Text style={styles.summaryLabel}>Customers With Dues</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Credit Ageing</Text>
        {ageing.map((bucket) => (
          <View key={bucket.key} style={styles.ageRow}>
            <Text style={styles.ageLabel}>{bucket.label}</Text>
            <Text style={styles.ageValue}>Rs {bucket.amount.toFixed(2)} | {bucket.count} customer(s)</Text>
          </View>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Approve / Update Customer Credit</Text>
        <TextInput
          style={styles.input}
          value={customerId}
          onChangeText={setCustomerId}
          placeholder="Customer ID"
        />
        <TextInput
          style={styles.input}
          value={creditLimit}
          onChangeText={setCreditLimit}
          keyboardType="numeric"
          placeholder="Credit limit approved by vendor"
        />
        <TextInput
          style={styles.input}
          value={paymentDueDays}
          onChangeText={setPaymentDueDays}
          keyboardType="numeric"
          placeholder="Payment due days"
        />
        <TouchableOpacity style={styles.limitBtn} onPress={approveLimit} disabled={saving}>
          <Text style={styles.saveText}>{saving ? "Saving..." : "Save Vendor Credit Limit"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Record Payment Received</Text>
        <TextInput
          style={styles.input}
          value={customerId}
          onChangeText={setCustomerId}
          placeholder="Customer ID"
        />
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="Amount received"
        />
        <TextInput
          style={styles.input}
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes"
        />
        <TouchableOpacity style={styles.saveBtn} onPress={recordPayment} disabled={saving}>
          <Text style={styles.saveText}>{saving ? "Saving..." : "Record Payment"}</Text>
        </TouchableOpacity>
      </View>


      <Text style={styles.sectionTitle}>Repayment Requests</Text>
      {repaymentRequests.filter((request) => request.status === "submitted").length === 0 ? (
        <Text style={styles.muted}>No customer repayment references awaiting verification.</Text>
      ) : null}
      {repaymentRequests.filter((request) => request.status === "submitted").map((request) => (
        <View key={request.id} style={styles.entryCard}>
          <Text style={styles.entryType}>Customer marked repayment</Text>
          <Text>Customer: {request.customer_id}</Text>
          <Text>Amount: Rs {Number(request.amount || 0).toFixed(2)}</Text>
          <Text>Method: {request.payment_method}</Text>
          <Text>Reference: {request.payment_reference || "Not provided"}</Text>
          {request.customer_note ? <Text style={styles.muted}>{request.customer_note}</Text> : null}
          <View style={styles.requestActions}>
            <TouchableOpacity style={styles.saveBtn} onPress={() => verifyRepayment(request.id, true)}>
              <Text style={styles.saveText}>Confirm Received</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.suspendBtn} onPress={() => verifyRepayment(request.id, false)}>
              <Text style={styles.saveText}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <Text style={styles.sectionTitle}>Customer Balances</Text>
      <TextInput
        style={styles.input}
        value={search}
        onChangeText={setSearch}
        placeholder="Search customer name, mobile, customer ID or status"
      />
      {balances.length === 0 ? (
        <Text style={styles.muted}>No credit entries yet.</Text>
      ) : (
        filteredBalances.map((balance) => (
          <View key={balance.customer_id} style={styles.balanceCard}>
            <Text style={styles.customerId}>Customer: {balance.customer_name || balance.customer_id}</Text>
            {balance.customer_mobile ? <Text>Mobile: {balance.customer_mobile}</Text> : null}
            <Text>Customer ID: {balance.customer_id}</Text>
            <Text>Limit: Rs {balance.credit_limit.toFixed(2)}</Text>
            <Text>Available: Rs {balance.available_credit.toFixed(2)}</Text>
            <Text>Due Date: {balance.due_date || "No dues"}</Text>
            <Text>Status: {balance.status}</Text>
            <Text
              style={[
                styles.balance,
                balance.outstanding_balance > 0 ? styles.due : styles.advance,
              ]}
            >
              {balance.outstanding_balance > 0
                ? `Due: Rs ${balance.outstanding_balance.toFixed(2)}`
                : "Settled"}
            </Text>
            <TouchableOpacity style={styles.suspendBtn} onPress={() => suspendCustomerCredit(balance.customer_id)}>
              <Text style={styles.saveText}>Suspend Credit</Text>
            </TouchableOpacity>
            {balance.outstanding_balance > 0 ? (
              <TouchableOpacity style={styles.reminderBtn} onPress={() => requestPayment(balance.customer_id)}>
                <Text style={styles.saveText}>Request Payment</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Recent Transactions</Text>
      {entries.map((entry) => (
        <View key={entry.id} style={styles.entryCard}>
          <Text style={styles.entryType}>{entry.transaction_type}</Text>
          <Text>Customer: {entry.customer_id}</Text>
          <Text>Amount: Rs {entry.amount.toFixed(2)}</Text>
          <Text>Balance After: Rs {entry.balance_after.toFixed(2)}</Text>
          {entry.notes ? <Text style={styles.muted}>{entry.notes}</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  heading: { fontSize: 26, fontWeight: "900" },
  subtitle: { color: "#555", marginTop: 6, marginBottom: 18, lineHeight: 20 },
  muted: { color: "#666" },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    width: "48%",
    minWidth: 150,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#f8fbff",
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: "900",
    color: "#0f172a",
  },
  summaryLabel: {
    color: "#475569",
    fontWeight: "800",
    marginTop: 4,
  },
  panel: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    marginBottom: 22,
  },
  panelTitle: { fontSize: 16, fontWeight: "900", marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  saveBtn: { backgroundColor: "#16a34a", padding: 13, borderRadius: 10 },
  limitBtn: { backgroundColor: "#2563eb", padding: 13, borderRadius: 10, marginTop: 2 },
  suspendBtn: { backgroundColor: "#dc2626", padding: 10, borderRadius: 10, marginTop: 10 },
  reminderBtn: { backgroundColor: "#0f766e", padding: 10, borderRadius: 10, marginTop: 8 },
  saveText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  sectionTitle: { fontSize: 18, fontWeight: "900", marginTop: 8, marginBottom: 10 },
  balanceCard: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  customerId: { fontWeight: "800" },
  ageRow: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingVertical: 9,
  },
  ageLabel: { fontWeight: "900", color: "#111827" },
  ageValue: { color: "#475569", marginTop: 2 },
  balance: { marginTop: 4, fontWeight: "900" },
  due: { color: "#dc2626" },
  advance: { color: "#16a34a" },
  entryCard: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    marginBottom: 10,
  },
  entryType: { fontWeight: "900", marginBottom: 4 },
  requestActions: { flexDirection: "row", gap: 8, marginTop: 10 },
});

