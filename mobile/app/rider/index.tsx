// app/rider/index.tsx
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { apiUrl } from "@/lib/backend";

export default function RiderHomeScreen() {
  const router = useRouter();
  const params: any = useLocalSearchParams();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const token = params.token as string | undefined;
  const activeCount = assignments.filter((item: any) => item.status !== "delivered").length;
  const deliveredToday = assignments.filter((item: any) => item.status === "delivered").length;

  useEffect(() => {
    if (!token) return;
    loadAssignments();
    const interval = setInterval(loadAssignments, 10000);
    return () => clearInterval(interval);
  }, [token]);

  async function loadAssignments() {
    try {
      const res = await fetch(apiUrl("/api/rider/assignments"), {
        headers: { "x-rider-token": String(token) },
      });
      const json = await res.json();
      if (json.success) setAssignments(json.assignments);
    } catch (err) {
      console.log("loadAssignments error:", err);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <View style={styles.center}>
        <Text>Invalid or missing rider token. Ask vendor to resend link.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Delivery Staff Terminal</Text>
      <Text style={styles.subtitle}>Restricted to deliveries assigned by your vendor.</Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{activeCount}</Text>
          <Text style={styles.summaryLabel}>Active</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{deliveredToday}</Text>
          <Text style={styles.summaryLabel}>Delivered today</Text>
        </View>
      </View>

      {loading && <Text>Loading...</Text>}

      {assignments.length === 0 && !loading && (
        <Text>No active assignments.</Text>
      )}

      {assignments.map((a) => (
        <TouchableOpacity
          key={a.id}
          style={styles.card}
          onPress={() =>
            router.push({
              pathname: "/rider/order",
              params: { token, assignment_id: a.id, order_id: a.order_id },
            })
          }
        >
          <Text style={styles.cardTitle}>Order #{a.hyperlocal_order?.order_number || a.order_id}</Text>
          <Text>
            Address: {a.hyperlocal_order?.delivery_address || "N/A"}
          </Text>
          <Text>Status: {String(a.status || "assigned").replace(/_/g, " ")}</Text>
          {a.cash_handover_status === "pending_vendor_reconciliation" ? (
            <Text style={styles.cashPending}>Cash handover pending vendor reconciliation</Text>
          ) : null}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, gap: 15 },
  title: { fontSize: 24, fontWeight: "900", marginBottom: 10 },
  subtitle: { color: "#4b5563", marginTop: -8, marginBottom: 4 },
  summaryRow: { flexDirection: "row", gap: 10 },
  summaryCard: { flex: 1, borderWidth: 1, borderColor: "#dbeafe", backgroundColor: "#eff6ff", borderRadius: 10, padding: 12 },
  summaryValue: { color: "#1166ff", fontSize: 24, fontWeight: "900" },
  summaryLabel: { color: "#1f2937", fontWeight: "800" },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    backgroundColor: "#fff",
  },
  cardTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  cashPending: { color: "#9a3412", fontWeight: "800", marginTop: 4 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});



