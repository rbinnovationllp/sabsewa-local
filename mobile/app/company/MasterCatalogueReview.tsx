import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";

export default function MasterCatalogueReviewScreen() {
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<any[]>([]);

  const loadQueue = async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/gemini/inventory/review-queue");
      const data = await res.json();
      if (res.ok && data.success) setQueue(data.items || []);
    } catch (err: any) {
      Alert.alert("Review Queue", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleAction = async (id: string, action: "APPROVED" | "REJECTED") => {
    try {
      const res = await authenticatedFetch(`/api/gemini/inventory/review-queue/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Action failed.");
      Alert.alert("Success", `Product proposal ${action.toLowerCase()} successfully.`);
      loadQueue();
    } catch (err: any) {
      Alert.alert("Action Failed", err.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Master Catalogue Governance" />
      <Text style={styles.heading}>Master Catalogue Review Queue</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#1166ff" />
      ) : queue.length === 0 ? (
        <Text style={styles.muted}>No pending product proposals in queue.</Text>
      ) : (
        queue.map((item) => (
          <View key={item.id} style={styles.card}>
            <Text style={styles.title}>{item.suggested_name}</Text>
            <Text style={styles.subText}>
              Category: {item.suggested_category} | Unit: {item.suggested_unit} | Source: {item.raw_source_type}
            </Text>
            {item.suggested_hindi_name && (
              <Text style={styles.subText}>Hindi/Regional: {item.suggested_hindi_name}</Text>
            )}

            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.btn, styles.approveBtn]}
                onPress={() => handleAction(item.id, "APPROVED")}
              >
                <Text style={styles.btnText}>Approve to Master</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.rejectBtn]}
                onPress={() => handleAction(item.id, "REJECTED")}
              >
                <Text style={styles.btnText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#ffffff" },
  heading: { fontSize: 24, fontWeight: "900", color: "#111827", marginBottom: 14 },
  muted: { color: "#64748b", fontSize: 14 },
  card: { padding: 14, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, marginBottom: 12, backgroundColor: "#f8fafc" },
  title: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  subText: { fontSize: 13, color: "#475569", marginTop: 2 },
  row: { flexDirection: "row", gap: 10, marginTop: 12 },
  btn: { flex: 1, padding: 10, borderRadius: 6, alignItems: "center" },
  approveBtn: { backgroundColor: "#16a34a" },
  rejectBtn: { backgroundColor: "#dc2626" },
  btnText: { color: "#ffffff", fontWeight: "700" },
});