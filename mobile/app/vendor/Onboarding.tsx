import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BrandHeader from "@/components/BrandHeader";
import { apiUrl, authenticatedFetch } from "@/lib/backend";
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
  const [paying, setPaying] = useState(false);
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

      // Persist registered vendor mobile number locally for automatic prefill
      if (vendorData.phone_number || user.phone) {
        await AsyncStorage.setItem("registered_vendor_phone", vendorData.phone_number || user.phone || "");
      }

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

  // Automatic Razorpay Payment Handler (Mobile Native & PWA Web)
  async function payOnboardingWithRazorpay() {
    if (!vendor?.id) return;
    setPaying(true);

    try {
      // 1. Request dynamic Razorpay Order Creation via Platform Billing endpoint
      const response = await authenticatedFetch(`/api/vendor/billing/${vendor.id}/platform-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charge_type: "onboarding" }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to create Razorpay payment order.");

      // 2. Web / PWA Razorpay Modal Handling
      if (Platform.OS === "web") {
        if (typeof window !== "undefined" && !(window as any).Razorpay) {
          throw new Error("Razorpay Web SDK is loading. Please refresh and try again.");
        }

        const options = {
          key: json.key_id,
          amount: json.razorpay_order.amount,
          currency: json.razorpay_order.currency || "INR",
          name: "SabSewa Local",
          description: "Vendor Onboarding Fee & Security Deposit",
          order_id: json.razorpay_order.id,
          handler: async function (response: any) {
            await verifyPaymentAndRefresh(
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature
            );
          },
          theme: { color: "#1166ff" },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.open();
        setPaying(false);
        return;
      }

      // 3. React Native Mobile SDK Handling
      let RazorpayCheckout: any = null;
      try {
        RazorpayCheckout = require("react-native-razorpay").default || require("react-native-razorpay");
      } catch {
        RazorpayCheckout = null;
      }

      if (!RazorpayCheckout) {
        Alert.alert("Razorpay SDK Required", `Order created: ${json.razorpay_order.id}. Use manual reference below if SDK is unlinked.`);
        setGatewayOrderId(json.razorpay_order.id);
        setPaying(false);
        return;
      }

      const payment = await RazorpayCheckout.open({
        key: json.key_id,
        amount: json.razorpay_order.amount,
        currency: json.razorpay_order.currency || "INR",
        name: "SabSewa Local",
        description: "Vendor Onboarding Fee & Security Deposit",
        order_id: json.razorpay_order.id,
        theme: { color: "#1166ff" },
      });

      await verifyPaymentAndRefresh(
        payment.razorpay_order_id,
        payment.razorpay_payment_id,
        payment.razorpay_signature
      );
    } catch (error) {
      Alert.alert("Payment Error", error instanceof Error ? error.message : "Payment checkout failed.");
    } finally {
      setPaying(false);
    }
  }

  // Verifies signature and updates onboarding status
  async function verifyPaymentAndRefresh(orderId: string, paymentId: string, signature: string) {
    try {
      const response = await fetch(apiUrl(`/api/vendor/onboarding/${vendor.id}/payment-record`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateway_order_id: orderId,
          gateway_payment_id: paymentId,
          gateway_signature: signature || null,
          actor_user_id: user?.id || null,
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Payment signature verification failed.");

      Alert.alert("Payment Verified", "Your onboarding payment has been processed. Your shop will be activated upon final admin review.");
      await loadOnboarding();
    } catch (error) {
      Alert.alert("Verification Failed", error instanceof Error ? error.message : "Could not verify payment.");
    }
  }

  // Manual fallback payment entry
  async function recordPayment() {
    if (!vendor?.id) return;
    if (!gatewayOrderId.trim() || !gatewayPaymentId.trim()) {
      Alert.alert("Payment reference required", "Enter the verified gateway order id and payment id.");
      return;
    }

    setSaving(true);
    try {
      await verifyPaymentAndRefresh(gatewayOrderId.trim(), gatewayPaymentId.trim(), gatewaySignature.trim());
      setGatewayOrderId("");
      setGatewayPaymentId("");
      setGatewaySignature("");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1166ff" />
        <Text style={styles.muted}>Loading onboarding...</Text>
      </View>
    );
  }

  const currency = summary?.currency || "INR";
  const canPublish = Boolean(summary?.can_publish_products);
  const isPaymentCompleted = summary?.payment_status === "payment_completed";

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
        <Text style={styles.muted}>
          {summary?.security_deposit_refundable === false ? "Not marked refundable" : "Refundable or adjustable as per vendor policy"}
        </Text>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Tax</Text>
          <Text style={styles.lineValue}>{money(summary?.tax_amount, currency)}</Text>
        </View>
        <View style={[styles.line, styles.totalLine]}>
          <Text style={styles.totalLabel}>Total payable</Text>
          <Text style={styles.totalValue}>{money(summary?.total_payable, currency)}</Text>
        </View>

        {!isPaymentCompleted && (
          <TouchableOpacity
            style={[styles.payNowBtn, paying && styles.disabled]}
            onPress={payOnboardingWithRazorpay}
            disabled={paying || !vendor?.id}
          >
            <Text style={styles.primaryText}>{paying ? "Opening Razorpay..." : "Pay Now with Razorpay"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {!canPublish ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>Onboarding required</Text>
          <Text style={styles.warningText}>
            Complete your SabSewa Local onboarding to list your store and publish products. Your payable amount includes the category-specific onboarding fee and the Rs 5,000 security deposit.
          </Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push(`/vendor/CatalogueSetup?vendor=${vendor.id}` as any)}
        >
          <Text style={styles.primaryText}>Open Catalogue Setup</Text>
        </TouchableOpacity>
      )}

      {!isPaymentCompleted ? (
        <View style={styles.panel}>
          <Text style={styles.section}>Manual Payment Fallback</Text>
          <Text style={styles.muted}>If automatic payment completed but failed to sync, enter reference IDs here:</Text>
          <TextInput
            style={styles.input}
            value={gatewayOrderId}
            onChangeText={setGatewayOrderId}
            placeholder="Gateway order id (e.g. order_P12345)"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={gatewayPaymentId}
            onChangeText={setGatewayPaymentId}
            placeholder="Gateway payment id (e.g. pay_P12345)"
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={gatewaySignature}
            onChangeText={setGatewaySignature}
            placeholder="Gateway signature (required in live mode)"
            autoCapitalize="none"
          />
          <TouchableOpacity
            style={[styles.secondaryBtn, saving && styles.disabled]}
            onPress={recordPayment}
            disabled={saving || !vendor?.id}
          >
            <Text style={styles.secondaryText}>{saving ? "Recording..." : "Verify & Record Reference"}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 48, backgroundColor: "#fff" },
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
  muted: { color: "#6b7280", fontSize: 12, lineHeight: 18, marginBottom: 4 },
  warningBox: { borderWidth: 1, borderColor: "#fed7aa", borderRadius: 8, padding: 14, marginBottom: 14, backgroundColor: "#fff7ed" },
  warningTitle: { color: "#9a3412", fontWeight: "900" },
  warningText: { color: "#7c2d12", marginTop: 6, lineHeight: 20 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginTop: 10, backgroundColor: "#fff" },
  payNowBtn: { backgroundColor: "#16a34a", borderRadius: 8, padding: 14, marginTop: 14 },
  primaryBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14, marginBottom: 14 },
  primaryText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  secondaryBtn: { borderWidth: 1, borderColor: "#1166ff", borderRadius: 8, padding: 12, marginTop: 12, backgroundColor: "#fff" },
  secondaryText: { color: "#1166ff", textAlign: "center", fontWeight: "900" },
  disabled: { opacity: 0.6 },
});