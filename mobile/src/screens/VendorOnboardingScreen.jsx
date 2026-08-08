import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import axios from "axios";

export default function VendorOnboardingScreen({ route, navigation }) {
  const { vendorId } = route.params;
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`https://api.sabsewa.in/api/vendor/onboarding/${vendorId}/summary`);
      if (res.data.success) {
        setSummary(res.data.summary);
      }
    } catch (err) {
      Alert.alert("Error", "Failed to load onboarding status.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" style={{ flex: 1 }} />;

  const isKycDone = summary.kyc_status === "kyc_verified";
  const isPaymentDone = summary.payment_status === "payment_completed";

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Onboarding Step-by-Step</Text>

      {/* CARD 1: KYC (Mandatory Step 1) */}
      <TouchableOpacity
        style={[styles.card, styles.kycCard]}
        onPress={() => navigation.navigate("VendorKycUploadScreen", { vendorId, category: summary.canonical_category_id })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>1. Owner & Business KYC</Text>
          <Ionicons
            name={isKycDone ? "checkmark-circle" : "alert-circle"}
            size={24}
            color={isKycDone ? "#2E7D32" : "#E65100"}
          />
        </View>
        <Text style={styles.cardSub}>
          {summary.kyc_status === "kyc_verified"
            ? "Approved"
            : summary.kyc_status === "kyc_submitted"
            ? "Under Verification"
            : "Action Required – Upload Documents"}
        </Text>
      </TouchableOpacity>

      {/* CARD 2: PAYMENT (Locked until KYC is approved) */}
      <TouchableOpacity
        style={[styles.card, !isKycDone && styles.lockedCard]}
        disabled={!isKycDone}
        onPress={() => navigation.navigate("VendorPaymentCheckoutScreen", { vendorId })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>2. Onboarding Fee Payment</Text>
          <Ionicons
            name={isPaymentDone ? "checkmark-circle" : !isKycDone ? "lock-closed" : "card"}
            size={24}
            color={isPaymentDone ? "#2E7D32" : !isKycDone ? "#999" : "#0288D1"}
          />
        </View>
        <Text style={styles.cardSub}>
          {!isKycDone
            ? "Locked – Complete KYC First"
            : isPaymentDone
            ? "Paid & Verified"
            : "Payment Pending – Tap to Pay"}
        </Text>
      </TouchableOpacity>

      {/* CARD 3: LIFECYCLE / ACTIVATION STATUS */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>3. Shop Activation</Text>
          <Ionicons
            name={summary.lifecycle_status === "active" ? "checkmark-circle" : "hourglass"}
            size={24}
            color={summary.lifecycle_status === "active" ? "#2E7D32" : "#F57C00"}
          />
        </View>
        <Text style={styles.cardSub}>
          {summary.lifecycle_status === "active"
            ? "Active / Onboarding Completed"
            : "Pending KYC Approval & Payment"}
        </Text>
      </View>

      {/* PAYMENT SUMMARY BREAKDOWN */}
      <View style={styles.summaryContainer}>
        <Text style={styles.summaryHeader}>Payment Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.label}>Business category</Text>
          <Text style={styles.val}>{summary.business_category_display}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.label}>Onboarding fee (Non-refundable)</Text>
          <Text style={styles.val}>₹ {summary.pricing.onboarding_fee.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.label}>Security deposit (Refundable)</Text>
          <Text style={styles.val}>₹ {summary.pricing.security_deposit.toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.label}>Tax (GST @ {summary.pricing.tax_rate_percent}%)</Text>
          <Text style={styles.val}>₹ {summary.pricing.tax_amount.toFixed(2)}</Text>
        </View>
        <View style={[styles.summaryRow, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total payable</Text>
          <Text style={styles.totalVal}>₹ {summary.pricing.total_payable.toFixed(2)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#F9F9F9" },
  headerTitle: { fontSize: 20, fontWeight: "bold", marginBottom: 16 },
  card: { backgroundColor: "#FFF", padding: 16, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: "#E0E0E0" },
  lockedCard: { backgroundColor: "#F0F0F0", borderColor: "#CCC" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 16, fontWeight: "bold" },
  cardSub: { fontSize: 13, color: "#666", marginTop: 4 },
  summaryContainer: { backgroundColor: "#FFF", padding: 16, borderRadius: 8, marginTop: 12, borderWidth: 1, borderColor: "#E0E0E0" },
  summaryHeader: { fontSize: 18, fontWeight: "bold", marginBottom: 12 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: 6 },
  label: { fontSize: 14, color: "#555" },
  val: { fontSize: 14, fontWeight: "600" },
  totalRow: { borderTopWidth: 1, borderColor: "#EEE", paddingTop: 10, marginTop: 8 },
  totalLabel: { fontSize: 16, fontWeight: "bold" },
  totalVal: { fontSize: 16, fontWeight: "bold", color: "#0288D1" }
});