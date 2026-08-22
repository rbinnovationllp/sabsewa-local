import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { apiUrl } from "@/lib/backend";

export default function CustomerOrderHistoryScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    loadOrders();
  }, [user?.id]);

  async function loadOrders() {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/order/history/${user.id}`));
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load order history.");
      setOrders(json.orders || []);
    } catch (error) {
      Alert.alert("Order history", error instanceof Error ? error.message : "Unable to load order history.");
    } finally {
      setLoading(false);
    }
  }

  function paymentText(order: any) {
    const status = String(order.payment_status || "unpaid");
    const method = String(order.payment_method || "");
    if (status === "paid") return method === "cash" ? "FULLY PAID - Cash" : method === "vendor_qr" ? "FULLY PAID - UPI" : "FULLY PAID";
    if (status === "partially_paid") return "PARTIALLY PAID - Balance in Udhaar/Credit";
    if (status === "credit_due" || status === "pending_payment" || method === "credit") return "ON CREDIT / UDHAAR";
    return "UNPAID";
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading order history...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Order History</Text>
      {orders.length === 0 ? <Text style={styles.muted}>No orders yet.</Text> : null}
      {orders.map((order) => {
        const isCredit = order.payment_method === "credit" || ["credit_due", "pending_payment", "partially_paid"].includes(order.payment_status);
        return (
          <View key={order.id} style={styles.card}>
            <Text style={styles.orderId}>Order #{String(order.receipt_number || order.id).slice(0, 12)}</Text>
            <Text style={styles.amount}>Rs {Number(order.quoted_total_amount || order.total_amount || 0).toFixed(2)}</Text>
            <Text style={styles.muted}>Status: {order.status}</Text>
            <Text style={styles.paymentStatus}>Payment: {paymentText(order)}</Text>
            {order.payment_status === "paid" ? (
              <Text style={styles.paidNote}>Vendor confirmed receipt. Outstanding: Rs 0.00</Text>
            ) : null}
            {isCredit ? (
              <TouchableOpacity style={styles.repayBtn} onPress={() => router.push("/customer/CreditLedger" as any)}>
                <Text style={styles.btnText}>Repay Credit</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  heading: { fontSize: 26, fontWeight: "900", color: "#111827", marginBottom: 16 },
  muted: { color: "#6b7280", marginTop: 4 },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 12, backgroundColor: "#fff" },
  orderId: { fontWeight: "900", color: "#111827" },
  amount: { fontSize: 18, fontWeight: "900", color: "#166534", marginTop: 6 },
  paymentStatus: { color: "#111827", fontWeight: "900", marginTop: 6 },
  paidNote: { color: "#166534", marginTop: 4, fontWeight: "700" },
  repayBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 12, marginTop: 12 },
  btnText: { color: "#fff", textAlign: "center", fontWeight: "900" },
});
