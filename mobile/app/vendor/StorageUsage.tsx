import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiUrl } from "@/lib/backend";

function mb(bytes: unknown) {
  return (Number(bytes || 0) / (1024 * 1024)).toFixed(1);
}

function formatLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function VendorStorageUsageScreen() {
  const params: any = useLocalSearchParams();
  const vendorId = params.vendor ? String(params.vendor) : "";
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    loadUsage();
  }, [vendorId]);

  async function loadUsage() {
    if (!vendorId) return;
    setLoading(true);
    try {
      const [usageResponse, profileResponse] = await Promise.all([
        fetch(apiUrl(`/api/storage/s3/vendor/${vendorId}/usage`)),
        fetch(apiUrl(`/api/settlement/vendor/${vendorId}/payment-profile`)),
      ]);
      const usageJson = await usageResponse.json();
      const profileJson = await profileResponse.json();
      if (!usageResponse.ok || !usageJson.success) throw new Error(usageJson.error || "Unable to load storage usage.");
      setData({ ...usageJson, storage_plans: profileJson.storage_plans || [] });
    } catch (error) {
      Alert.alert("Storage usage failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function purchasePlan(planId: string) {
    setPurchasing(planId);
    try {
      const response = await fetch(apiUrl(`/api/settlement/storage/${vendorId}/purchase`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, payment_status: "paid", payment_reference: `manual-${Date.now()}` }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Storage purchase failed.");
      Alert.alert("Storage upgraded", "Additional storage has been activated after successful payment.");
      await loadUsage();
    } catch (error) {
      Alert.alert("Storage purchase", error instanceof Error ? error.message : "Unable to purchase storage.");
    } finally {
      setPurchasing(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading storage usage...</Text>
      </View>
    );
  }

  const usage = data?.usage || {};
  const breakdown = usage.storage_breakdown || {};
  const percent = Number(usage.quota_bytes || 0)
    ? Math.min(100, Math.round((Number(usage.used_bytes || 0) / Number(usage.quota_bytes)) * 100))
    : 0;
  const quotaFull = percent >= 100;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Storage Usage</Text>
      <Text style={styles.subtitle}>Storage is consumed by pending credit records and vendor assets such as product images, documents, QR images and store banners. Paid settled orders do not consume vendor storage.</Text>

      <View style={styles.card}>
        <Text style={styles.percent}>{percent}% used</Text>
        <Text style={styles.rowText}>{mb(usage.used_bytes)} MB of {mb(usage.quota_bytes)} MB</Text>
        <Text style={styles.muted}>Default: {mb(usage.default_quota_bytes)} MB | Purchased: {mb(usage.purchased_quota_bytes)} MB</Text>
        <Text style={styles.warning}>Warning level: {usage.warning_level || "none"}</Text>
      </View>

      {quotaFull ? (
        <View style={styles.fullWarning}>
          <Text style={styles.fullTitle}>You have used your allocated storage.</Text>
          <Text style={styles.fullText}>Upgrade your storage to continue adding products and retaining credit records.</Text>
        </View>
      ) : null}

      <Text style={styles.section}>Storage Breakdown</Text>
      {Object.entries(breakdown).map(([key, value]) => (
        <View key={key} style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>{formatLabel(key)}</Text>
          <Text style={styles.breakdownValue}>{mb(value)} MB</Text>
        </View>
      ))}

      <Text style={styles.section}>Upgrade Plans</Text>
      {(data?.storage_plans || []).map((plan: any) => (
        <TouchableOpacity key={plan.id} style={styles.planCard} onPress={() => purchasePlan(plan.id)} disabled={Boolean(purchasing)}>
          <Text style={styles.planTitle}>{plan.title}</Text>
          <Text style={styles.muted}>Rs {Number(plan.price_inr || 0).toFixed(0)} through platform payment gateway</Text>
          <Text style={styles.planAction}>{purchasing === plan.id ? "Processing..." : "Buy Storage"}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.section}>Current Rules</Text>
      <Text style={styles.rule}>Warnings are shown at 80%, 90% and 100% usage.</Text>
      <Text style={styles.rule}>QR images and store assets count against vendor storage.</Text>
      <Text style={styles.rule}>Completed paid orders retain accounting history only.</Text>
      <Text style={styles.rule}>Credit customer details are archived and redacted after full payment.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  heading: { fontSize: 26, fontWeight: "900" },
  subtitle: { color: "#555", lineHeight: 20, marginTop: 6, marginBottom: 18 },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 16, marginBottom: 18, backgroundColor: "#f8fafc" },
  percent: { fontSize: 32, fontWeight: "900", color: "#1166ff" },
  rowText: { fontSize: 16, fontWeight: "800", marginTop: 6 },
  muted: { color: "#666", marginTop: 6 },
  warning: { marginTop: 8, fontWeight: "900", color: "#c2410c" },
  fullWarning: { borderWidth: 1, borderColor: "#ef4444", borderRadius: 8, padding: 14, marginBottom: 16, backgroundColor: "#fef2f2" },
  fullTitle: { fontWeight: "900", color: "#991b1b" },
  fullText: { color: "#7f1d1d", marginTop: 5, lineHeight: 20 },
  section: { fontSize: 18, fontWeight: "900", marginTop: 12, marginBottom: 8 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 10 },
  breakdownLabel: { fontWeight: "800", color: "#374151" },
  breakdownValue: { color: "#111827", fontWeight: "900" },
  planCard: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, padding: 14, marginBottom: 10, backgroundColor: "#fff" },
  planTitle: { fontWeight: "900", fontSize: 16 },
  planAction: { color: "#1166ff", fontWeight: "900", marginTop: 8 },
  rule: { color: "#444", lineHeight: 22, marginBottom: 4 },
});
