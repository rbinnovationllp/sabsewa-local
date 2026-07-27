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
import { apiUrl } from "@/lib/backend";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

export default function VendorSecurityWalletScreen() {
  const params: any = useLocalSearchParams();
  const { user } = useAuth();

  const [vendorId, setVendorId] = useState<string | null>(
    params.vendor ? String(params.vendor) : null
  );
  const [walletData, setWalletData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("5000");
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [disputeText, setDisputeText] = useState<Record<string, string>>({});
  const [showArchive, setShowArchive] = useState(false);

  const wallet = walletData?.wallet;

  const statusText = useMemo(() => {
    switch (wallet?.eligibility_status) {
      case "eligible":
        return "Eligible to receive orders";
      case "low_balance":
        return "Eligible, top-up reminder active";
      case "final_warning":
        return "Final warning, top up immediately";
      case "orders_stopped":
        return "Orders stopped until top-up";
      case "security_deposit_required":
        return "Rs 5,000 advance balance required";
      default:
        return "Checking status";
    }
  }, [wallet?.eligibility_status]);

  useEffect(() => {
    resolveVendorAndLoad();
  }, [params.vendor, user?.id]);

  async function resolveVendorAndLoad() {
    setLoading(true);
    let resolvedVendorId = params.vendor ? String(params.vendor) : null;

    if (!resolvedVendorId && user?.id) {
      const { data: vendor } = await supabase
        .from("vendors")
        .select("id")
        .eq("owner_user_id", user.id)
        .single();

      resolvedVendorId = vendor?.id || null;
    }

    setVendorId(resolvedVendorId);
    if (resolvedVendorId) await loadWallet(resolvedVendorId);
    setLoading(false);
  }

  async function loadWallet(nextVendorId = vendorId, includeArchive = showArchive) {
    if (!nextVendorId) return;

    const response = await fetch(apiUrl(`/api/vendor/security-wallet/${nextVendorId}?include_archive=${includeArchive ? "true" : "false"}`));
    const json = await response.json();

    if (!response.ok || !json.success) {
      Alert.alert("Wallet error", json.error || "Unable to load wallet");
      setWalletData(null);
      return;
    }

    setWalletData(json);
  }

  function startTopUpReview() {
    Alert.alert(
      "Review wallet first",
      "Have you reviewed your previous wallet transactions and are you satisfied that all order-fee deductions and adjustments are correct?",
      [
        { text: "Review transactions", onPress: () => setShowArchive(true) },
        { text: "Report a disputed deduction", onPress: () => Alert.alert("Choose a deduction", "Open the relevant Rs 15 transaction below, enter your complaint, and tap Raise Dispute.") },
        { text: "Yes, continue with top-up", onPress: topUpWithRazorpay },
      ]
    );
  }

  async function topUpWithRazorpay() {
    if (!vendorId) {
      Alert.alert("Vendor missing", "Vendor profile is required.");
      return;
    }

    const topUpAmount = Number(amount);
    if (!topUpAmount || topUpAmount <= 0) {
      Alert.alert("Invalid amount", "Enter a valid top-up amount.");
      return;
    }

    setCreatingOrder(true);

    try {
      const response = await fetch(apiUrl(`/api/vendor/security-wallet/${vendorId}/topup-order`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: topUpAmount }),
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Could not create Razorpay order");
      }

      let RazorpayCheckout: any = null;
      try {
        RazorpayCheckout = require("react-native-razorpay");
      } catch {
        RazorpayCheckout = null;
      }

      if (!RazorpayCheckout) {
        Alert.alert(
          "Razorpay SDK required",
          `Razorpay order created: ${json.razorpay_order.id}. Install and configure react-native-razorpay to complete in-app payment.`
        );
        return;
      }

      const payment = await RazorpayCheckout.open({
        key: json.key_id,
        amount: json.razorpay_order.amount,
        currency: "INR",
        name: "SabSewa Local",
        description: "Vendor Advance Balance Top-up",
        order_id: json.razorpay_order.id,
        theme: { color: "#1166ff" },
      });

      const verifyResponse = await fetch(apiUrl(`/api/vendor/security-wallet/${vendorId}/verify-topup`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: payment.razorpay_order_id,
          razorpay_payment_id: payment.razorpay_payment_id,
          razorpay_signature: payment.razorpay_signature,
        }),
      });

      const verifyJson = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyJson.success) {
        throw new Error(verifyJson.error || "Payment verification failed");
      }

      Alert.alert("Top-up successful", "Vendor advance balance updated.");
      await loadWallet(vendorId);
    } catch (error) {
      Alert.alert("Top-up failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setCreatingOrder(false);
    }
  }

  async function viewEvidence(tx: any) {
    if (!vendorId) return;

    const response = await fetch(apiUrl(`/api/vendor/security-wallet/${vendorId}/transactions/${tx.id}/evidence`));
    const json = await response.json();

    if (!response.ok || !json.success) {
      Alert.alert("Evidence unavailable", json.error || "Unable to load transaction evidence.");
      return;
    }

    const summary = json.evidence?.evidence_summary || {};
    Alert.alert(
      "Transaction Evidence",
      [
        `Transaction: ${summary.transaction_id}`,
        `Vendor ID: ${summary.public_vendor_id || "Not assigned"}`,
        `Terminal ID: ${summary.public_terminal_id || "Not assigned"}`,
        `Order: ${summary.related_order_id || "Not linked"}`,
        `Deduction: Rs ${Number(summary.amount_deducted || 0).toFixed(2)}`,
        `Balance: Rs ${summary.balance_before} to Rs ${summary.balance_after}`,
        `Acceptance: ${summary.vendor_acceptance_action ? "Recorded" : "Not found"}`,
        `Idempotency: ${summary.idempotency_key || "Not set"}`,
      ].join("\n")
    );
  }

  async function raiseDispute(tx: any) {
    if (!vendorId) return;
    const complaint = disputeText[tx.id]?.trim();

    if (!complaint) {
      Alert.alert("Complaint required", "Please write the issue with this wallet deduction.");
      return;
    }

    const response = await fetch(apiUrl(`/api/vendor/security-wallet/${vendorId}/transactions/${tx.id}/dispute`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        complaint_text: complaint,
        raised_by_user_id: user?.id,
      }),
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Dispute failed", json.error || "Unable to raise dispute.");
      return;
    }

    Alert.alert("Dispute raised", "Company staff can now review the transaction evidence.");
    setDisputeText((current) => ({ ...current, [tx.id]: "" }));
    await loadWallet(vendorId);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading Vendor Advance Balance...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>SabSewa Local Vendor Advance Balance</Text>
      <Text style={styles.subtitle}>
        Minimum Rs 5,000 advance balance is required to receive customer orders. New orders stop below Rs 515, preserving Rs 500 activation/usage fee plus one Rs 15 order-acceptance platform fee.
      </Text>

      {!wallet ? (
        <Text style={styles.muted}>Wallet not available.</Text>
      ) : (
        <>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Order Eligibility</Text>
            <Text style={styles.statusText}>{statusText}</Text>
            <Text style={styles.balance}>Rs {Number(wallet.current_balance || 0).toFixed(2)}</Text>
            <Text style={styles.muted}>Opening balance: Rs {Number(wallet.opening_balance || 0).toFixed(2)}</Text>
            <Text style={styles.muted}>Operational minimum: Rs {Number(wallet.stop_orders_threshold || 515).toFixed(2)}</Text>
          </View>

          {(walletData?.warnings || []).slice(0, 3).map((warning: any) => (
            <View key={warning.id} style={styles.warningCard}>
              <Text style={styles.warningLevel}>{warning.warning_level}</Text>
              <Text>{warning.message}</Text>
            </View>
          ))}

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Deposit / Top-up With Razorpay</Text>
            <Text style={styles.muted}>
              Pay the company using UPI, credit/debit card, netbanking, or other Razorpay-enabled methods. Customer order payments remain direct between customer and vendor.
            </Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              placeholder="Amount"
            />
            <TouchableOpacity style={styles.topupBtn} onPress={startTopUpReview} disabled={creatingOrder}>
              <Text style={styles.topupText}>
                {creatingOrder ? "Creating Razorpay Order..." : "Pay with UPI or Card"}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Transactions</Text>
          <TouchableOpacity
            style={styles.archiveToggle}
            onPress={() => {
              const next = !showArchive;
              setShowArchive(next);
              if (vendorId) loadWallet(vendorId, next);
            }}
          >
            <Text style={styles.archiveToggleText}>
              {showArchive ? "Show Active Transactions" : "Search / Review Archived Transactions"}
            </Text>
          </TouchableOpacity>
          {(walletData?.transactions || []).map((tx: any) => (
            <View key={tx.id} style={styles.txCard}>
              <View style={styles.txRow}>
                <Text style={styles.txType}>{tx.transaction_type}</Text>
                <Text style={Number(tx.amount) < 0 ? styles.debit : styles.credit}>
                  Rs {Number(tx.amount).toFixed(2)}
                </Text>
              </View>
              {tx.order_id ? <Text style={styles.muted}>Order: {tx.order_id}</Text> : null}
              {tx.payment_reference ? <Text style={styles.muted}>Ref: {tx.payment_reference}</Text> : null}
              {tx.idempotency_key ? <Text style={styles.muted}>Idempotency: {tx.idempotency_key}</Text> : null}
              <Text style={styles.muted}>Balance: Rs {Number(tx.balance_after || 0).toFixed(2)}</Text>
              <Text style={styles.muted}>{new Date(tx.created_at).toLocaleString()}</Text>
              {tx.transaction_type === "order_fee" ? (
                <View style={styles.disputePanel}>
                  <TouchableOpacity style={styles.evidenceBtn} onPress={() => viewEvidence(tx)}>
                    <Text style={styles.evidenceText}>View Evidence</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.disputeInput}
                    placeholder="Explain incorrect deduction, if any"
                    value={disputeText[tx.id] || ""}
                    onChangeText={(text) =>
                      setDisputeText((current) => ({ ...current, [tx.id]: text }))
                    }
                  />
                  <TouchableOpacity style={styles.disputeBtn} onPress={() => raiseDispute(tx)}>
                    <Text style={styles.disputeText}>Raise Dispute</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  heading: { fontSize: 24, fontWeight: "900" },
  subtitle: { marginTop: 6, marginBottom: 16, color: "#555", lineHeight: 20 },
  muted: { color: "#666", marginTop: 3 },
  statusCard: { padding: 16, borderRadius: 12, backgroundColor: "#eef6ff", marginBottom: 14 },
  statusLabel: { fontWeight: "700", color: "#1d4ed8" },
  statusText: { fontWeight: "900", fontSize: 16, marginTop: 4 },
  balance: { fontWeight: "900", fontSize: 28, marginTop: 8 },
  warningCard: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    marginBottom: 10,
  },
  warningLevel: { fontWeight: "900", color: "#c2410c", marginBottom: 4 },
  panel: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 14, marginTop: 6, marginBottom: 18 },
  panelTitle: { fontWeight: "900", marginBottom: 10 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, marginBottom: 12 },
  topupBtn: { backgroundColor: "#1166ff", padding: 14, borderRadius: 10 },
  topupText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  sectionTitle: { fontSize: 18, fontWeight: "900", marginBottom: 10 },
  archiveToggle: { borderWidth: 1, borderColor: "#1166ff", borderRadius: 8, padding: 10, marginBottom: 10 },
  archiveToggleText: { color: "#1166ff", fontWeight: "900", textAlign: "center" },
  txCard: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12, marginBottom: 10 },
  txRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  txType: { fontWeight: "900" },
  credit: { color: "#16a34a", fontWeight: "900" },
  debit: { color: "#dc2626", fontWeight: "900" },
  disputePanel: { marginTop: 10, gap: 8 },
  evidenceBtn: { borderWidth: 1, borderColor: "#1166ff", borderRadius: 8, padding: 10 },
  evidenceText: { color: "#1166ff", fontWeight: "900", textAlign: "center" },
  disputeInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10 },
  disputeBtn: { backgroundColor: "#7c2d12", borderRadius: 8, padding: 10 },
  disputeText: { color: "#fff", fontWeight: "900", textAlign: "center" },
});
