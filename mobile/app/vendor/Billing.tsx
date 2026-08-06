import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import BrandHeader from "@/components/BrandHeader";
import { apiUrl, authenticatedFetch } from "@/lib/backend";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

function rupees(paise: unknown) {
  return `Rs ${(Number(paise || 0) / 100).toFixed(2)}`;
}

function daysText(days: unknown) {
  if (days === null || days === undefined) return "Not active";
  return Number(days) >= 0 ? `${days} day(s) remaining` : "Expired";
}

export default function VendorBillingScreen() {
  const params: any = useLocalSearchParams();
  const { user } = useAuth();
  const [vendorId, setVendorId] = useState(params.vendor ? String(params.vendor) : "");
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "quarterly" | "annual">("monthly");

  useEffect(() => {
    resolveAndLoad();
  }, [user?.id, vendorId]);

  async function resolveAndLoad() {
    let nextVendorId = vendorId;
    if (!nextVendorId && user?.id) {
      const { data } = await supabase.from("vendors").select("id").eq("owner_user_id", user.id).single();
      nextVendorId = data?.id || "";
      setVendorId(nextVendorId);
    }
    if (nextVendorId) await loadBilling(nextVendorId);
    else setLoading(false);
  }

  async function loadBilling(nextVendorId = vendorId) {
    setLoading(true);
    try {
      const response = await authenticatedFetch(`/api/vendor/billing/${nextVendorId}/dashboard`);
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load billing.");
      setDashboard(json.dashboard);
    } catch (error) {
      Alert.alert("Billing", error instanceof Error ? error.message : "Unable to load billing.");
    } finally {
      setLoading(false);
    }
  }

  async function pay(chargeType: string, referenceId?: string | null, description = "SabSewa Local platform payment") {
    if (!vendorId) return;
    setPaying(true);
    try {
      const response = await authenticatedFetch(`/api/vendor/billing/${vendorId}/platform-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charge_type: chargeType, reference_id: referenceId || null, billing_cycle: billingCycle }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to create Razorpay order.");

      let RazorpayCheckout: any = null;
      try {
        RazorpayCheckout = require("react-native-razorpay");
      } catch {
        RazorpayCheckout = null;
      }

      if (!RazorpayCheckout) {
        Alert.alert("Razorpay SDK required", `Razorpay order created: ${json.razorpay_order.id}`);
        return;
      }

      const payment = await RazorpayCheckout.open({
        key: json.key_id,
        amount: json.razorpay_order.amount,
        currency: json.razorpay_order.currency || "INR",
        name: "SabSewa Local",
        description,
        order_id: json.razorpay_order.id,
        theme: { color: "#1166ff" },
      });

      const verifyResponse = await authenticatedFetch(`/api/vendor/billing/${vendorId}/verify-platform-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: payment.razorpay_order_id,
          razorpay_payment_id: payment.razorpay_payment_id,
          razorpay_signature: payment.razorpay_signature,
        }),
      });
      const verifyJson = await verifyResponse.json();
      if (!verifyResponse.ok || !verifyJson.success) throw new Error(verifyJson.error || "Payment verification failed.");
      Alert.alert(verifyJson.test_mode ? "Test payment recorded" : "Payment successful", verifyJson.message || "Platform payment was verified.");
      await loadBilling(vendorId);
    } catch (error) {
      Alert.alert("Payment", error instanceof Error ? error.message : "Payment could not be completed.");
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading vendor billing...</Text>
      </View>
    );
  }

  const subscription = dashboard?.current_subscription;
  const onboarding = dashboard?.onboarding;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Vendor billing" />
      <Text style={styles.heading}>Billing & Subscription</Text>
      <Text style={styles.policy}>{dashboard?.customer_payment_policy}</Text>

      <View style={styles.panel}>
        <Text style={styles.section}>Current Subscription</Text>
        <Text style={styles.title}>{subscription?.plan?.plan_name || "No active plan"}</Text>
        <Text style={styles.badge}>{subscription?.subscription_status || "payment_pending"}</Text>
        <Text style={styles.muted}>Cycle: {subscription?.billing_cycle || "N/A"} | {daysText(subscription?.days_remaining)}</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>Onboarding Charges</Text>
        <Text style={styles.muted}>Fee: Rs {Number(onboarding?.onboarding_fee || 0).toFixed(2)} | Deposit: Rs {Number(onboarding?.security_deposit || 0).toFixed(2)} | Tax: Rs {Number(onboarding?.tax_amount || 0).toFixed(2)}</Text>
        <Text style={styles.total}>Total: Rs {Number(onboarding?.total_payable || 0).toFixed(2)}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => pay("onboarding", null, "Vendor onboarding fee and security deposit")} disabled={paying || onboarding?.payment_status === "payment_completed"}>
          <Text style={styles.primaryText}>{onboarding?.payment_status === "payment_completed" ? "Onboarding Paid" : "Pay Onboarding"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>Choose Billing Cycle</Text>
        <View style={styles.row}>
          {(["monthly", "quarterly", "annual"] as const).map((cycle) => (
            <TouchableOpacity key={cycle} style={[styles.chip, billingCycle === cycle && styles.chipActive]} onPress={() => setBillingCycle(cycle)}>
              <Text style={[styles.chipText, billingCycle === cycle && styles.chipTextActive]}>{cycle}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {(dashboard?.available_plans || []).map((plan: any) => {
          const amount = plan[`${billingCycle}_price_paise`];
          return (
            <View key={plan.id} style={styles.card}>
              <Text style={styles.title}>{plan.plan_name}</Text>
              <Text style={styles.muted}>{plan.description}</Text>
              <Text style={styles.total}>{rupees(amount)}</Text>
              <Text style={styles.muted}>Listings: {plan.product_listing_limit || "Custom"} | Storage: {plan.storage_allowance_bytes ? `${Math.round(plan.storage_allowance_bytes / 1048576)} MB` : "Custom"} | AI: {plan.ai_tool_access ? "Yes" : "No"}</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => pay("subscription", plan.id, `${plan.plan_name} subscription`)} disabled={paying}>
                <Text style={styles.secondaryText}>Select Plan</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>Storage Add-ons</Text>
        {(dashboard?.storage_plans || []).map((plan: any) => (
          <View key={plan.id} style={styles.card}>
            <Text style={styles.title}>{plan.title}</Text>
            <Text style={styles.muted}>Adds {Math.round(Number(plan.quota_bytes || 0) / 1073741824)} GB storage</Text>
            <Text style={styles.total}>Rs {Number(plan.price_inr || 0).toFixed(2)}</Text>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => pay("storage_addon", plan.id, `Storage add-on ${plan.title}`)} disabled={paying}>
              <Text style={styles.secondaryText}>Buy Storage</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>Promotions & Premium Services</Text>
        {(dashboard?.billing_products || []).map((product: any) => (
          <View key={product.id} style={styles.card}>
            <Text style={styles.title}>{product.title}</Text>
            <Text style={styles.muted}>{product.description}</Text>
            <Text style={styles.total}>{rupees(product.base_amount_paise)}</Text>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => pay(product.charge_type, product.id, product.title)} disabled={paying}>
              <Text style={styles.secondaryText}>Buy</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>Invoices & Receipts</Text>
        {(dashboard?.invoices || []).length === 0 ? <Text style={styles.muted}>No invoices yet.</Text> : null}
        {(dashboard?.invoices || []).map((invoice: any) => (
          <TouchableOpacity key={invoice.id} style={styles.historyRow} onPress={() => Alert.alert("Receipt link", apiUrl(`/api/vendor/billing/${vendorId}/invoices/${invoice.id}/receipt.txt`))}>
            <Text style={styles.title}>{invoice.invoice_number}</Text>
            <Text style={styles.muted}>{invoice.charge_type} | {rupees(invoice.total_amount_paise)} | {invoice.payment_status}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>Payment History</Text>
        {(dashboard?.payment_history || []).slice(0, 40).map((attempt: any) => (
          <View key={attempt.id} style={styles.historyRow}>
            <Text style={styles.title}>{attempt.charge_type}</Text>
            <Text style={styles.muted}>{rupees(attempt.total_amount_paise)} | {attempt.payment_status} | {attempt.razorpay_payment_id || attempt.razorpay_order_id || "No gateway reference"}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 70, paddingHorizontal: 20, paddingBottom: 48, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  heading: { fontSize: 28, fontWeight: "900", color: "#111827", marginBottom: 12 },
  policy: { color: "#065f46", backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#a7f3d0", borderRadius: 8, padding: 10, marginBottom: 14, lineHeight: 20 },
  panel: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 14, backgroundColor: "#fff" },
  section: { fontSize: 18, fontWeight: "900", color: "#111827", marginBottom: 10 },
  title: { fontWeight: "900", color: "#111827", marginBottom: 4 },
  muted: { color: "#6b7280", fontSize: 12, lineHeight: 18 },
  badge: { alignSelf: "flex-start", backgroundColor: "#eff6ff", color: "#1166ff", fontWeight: "900", paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8, overflow: "hidden", marginVertical: 6 },
  total: { color: "#111827", fontWeight: "900", marginTop: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  chipActive: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  chipText: { color: "#334155", fontWeight: "900" },
  chipTextActive: { color: "#fff" },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: "#f9fafb" },
  primaryBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 13, marginTop: 10 },
  primaryText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  secondaryBtn: { borderWidth: 1, borderColor: "#1166ff", borderRadius: 8, padding: 11, marginTop: 10, backgroundColor: "#fff" },
  secondaryText: { color: "#1166ff", fontWeight: "900", textAlign: "center" },
  historyRow: { borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingVertical: 10 },
});
