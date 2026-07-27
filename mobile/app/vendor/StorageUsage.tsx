import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiUrl } from "@/lib/backend";

function mb(bytes: unknown) {
  return (Number(bytes || 0) / (1024 * 1024)).toFixed(1);
}

export default function VendorStorageUsageScreen() {
  const params: any = useLocalSearchParams();
  const vendorId = params.vendor ? String(params.vendor) : "";
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    loadUsage();
  }, [vendorId]);

  async function loadUsage() {
    if (!vendorId) return;
    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/storage/s3/vendor/${vendorId}/usage`));
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load storage usage.");
      setData(json);
    } catch (error) {
      Alert.alert("Storage usage failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
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
  const percent = Number(usage.quota_bytes || 0)
    ? Math.min(100, Math.round((Number(usage.used_bytes || 0) / Number(usage.quota_bytes)) * 100))
    : 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Storage Usage</Text>
      <Text style={styles.subtitle}>Storage is for compressed product images and essential documents only. Orders, invoices, credit records and wallet entries stay in the database.</Text>

      <View style={styles.card}>
        <Text style={styles.percent}>{percent}% used</Text>
        <Text style={styles.rowText}>{mb(usage.used_bytes)} MB of {mb(usage.quota_bytes)} MB</Text>
        <Text style={styles.muted}>Completed orders counted: {usage.successful_order_count || 0}</Text>
        <Text style={styles.warning}>Warning level: {usage.warning_level || "none"}</Text>
      </View>

      <Text style={styles.section}>Current Rules</Text>
      <Text style={styles.rule}>Start allocation: 100 MB</Text>
      <Text style={styles.rule}>Automatic upgrade only after genuine completed orders</Text>
      <Text style={styles.rule}>Product image target: 100-150 KB</Text>
      <Text style={styles.rule}>Maximum normal ceiling: 2 GB per vendor</Text>
      <Text style={styles.rule}>Videos are not allowed under standard allocation</Text>
      <Text style={styles.rule}>Uploads stop when quota reaches 100%</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  heading: { fontSize: 26, fontWeight: "900" },
  subtitle: { color: "#555", lineHeight: 20, marginTop: 6, marginBottom: 18 },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 16, marginBottom: 18, backgroundColor: "#f8fafc" },
  percent: { fontSize: 32, fontWeight: "900", color: "#1166ff" },
  rowText: { fontSize: 16, fontWeight: "800", marginTop: 6 },
  muted: { color: "#666", marginTop: 6 },
  warning: { marginTop: 8, fontWeight: "900", color: "#c2410c" },
  section: { fontSize: 18, fontWeight: "900", marginBottom: 8 },
  rule: { color: "#444", lineHeight: 22, marginBottom: 4 },
});
