import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";

function rupees(paise: unknown) {
  return `Rs ${(Number(paise || 0) / 100).toFixed(2)}`;
}

export default function CompanyBillingScreen() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    loadBilling();
  }, []);

  async function loadBilling() {
    setLoading(true);
    try {
      const response = await authenticatedFetch("/api/vendor/billing/admin/overview");
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load billing overview.");
      setData(json);
    } catch (error) {
      Alert.alert("Billing", error instanceof Error ? error.message : "Unable to load billing overview.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading billing portal...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Company billing" />
      <Text style={styles.heading}>Billing Portal</Text>
      <TouchableOpacity style={styles.refreshBtn} onPress={loadBilling}>
        <Text style={styles.refreshText}>Refresh</Text>
      </TouchableOpacity>

      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}><Text style={styles.summaryValue}>{data?.attempts?.length || 0}</Text><Text style={styles.muted}>Payments</Text></View>
        <View style={styles.summaryCard}><Text style={styles.summaryValue}>{data?.invoices?.length || 0}</Text><Text style={styles.muted}>Invoices</Text></View>
        <View style={styles.summaryCard}><Text style={styles.summaryValue}>{data?.subscriptions?.length || 0}</Text><Text style={styles.muted}>Subscriptions</Text></View>
        <View style={styles.summaryCard}><Text style={styles.summaryValue}>{data?.webhook_events?.length || 0}</Text><Text style={styles.muted}>Webhook logs</Text></View>
      </View>

      <Text style={styles.section}>Recent Platform Payments</Text>
      {(data?.attempts || []).map((attempt: any) => (
        <View key={attempt.id} style={styles.row}>
          <Text style={styles.title}>{attempt.charge_type}</Text>
          <Text style={styles.muted}>{attempt.vendor_id} | {rupees(attempt.total_amount_paise)} | {attempt.payment_status}</Text>
          <Text style={styles.muted}>{attempt.razorpay_order_id || "No order"} | {attempt.razorpay_payment_id || "No payment"}</Text>
        </View>
      ))}

      <Text style={styles.section}>Invoices</Text>
      {(data?.invoices || []).slice(0, 80).map((invoice: any) => (
        <View key={invoice.id} style={styles.row}>
          <Text style={styles.title}>{invoice.invoice_number}</Text>
          <Text style={styles.muted}>{invoice.shop_name || invoice.vendor_id} | {invoice.charge_type} | {rupees(invoice.total_amount_paise)}</Text>
        </View>
      ))}

      <Text style={styles.section}>Subscriptions</Text>
      {(data?.subscriptions || []).slice(0, 80).map((subscription: any) => (
        <View key={subscription.id} style={styles.row}>
          <Text style={styles.title}>{subscription.plan?.plan_name || "Plan"}</Text>
          <Text style={styles.muted}>{subscription.vendor_id} | {subscription.subscription_status} | expires {subscription.expires_at || "N/A"}</Text>
        </View>
      ))}

      <Text style={styles.section}>Webhook Events</Text>
      {(data?.webhook_events || []).slice(0, 80).map((event: any) => (
        <View key={event.id || event.event_id} style={styles.row}>
          <Text style={styles.title}>{event.event_type}</Text>
          <Text style={styles.muted}>{event.processing_status} | {event.razorpay_order_id || "No order"} | {event.processing_error || "No error"}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 70, paddingHorizontal: 20, paddingBottom: 48, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  heading: { fontSize: 28, fontWeight: "900", color: "#111827", marginBottom: 12 },
  refreshBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 12, marginBottom: 14 },
  refreshText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  summaryCard: { flex: 1, minWidth: 140, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, backgroundColor: "#f9fafb" },
  summaryValue: { fontSize: 22, fontWeight: "900", color: "#111827" },
  section: { fontSize: 18, fontWeight: "900", color: "#111827", marginTop: 12, marginBottom: 8 },
  row: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, marginBottom: 8, backgroundColor: "#fff" },
  title: { fontWeight: "900", color: "#111827" },
  muted: { color: "#6b7280", fontSize: 12, lineHeight: 18, marginTop: 3 },
});
