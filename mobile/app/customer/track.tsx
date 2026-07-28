// app/customer/track.tsx
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from "react-native";
import { useLocalSearchParams } from "expo-router";
import CrossPlatformMap from "@/components/CrossPlatformMap";
import { apiUrl } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";

export default function CustomerTrackScreen() {
  const params: any = useLocalSearchParams();
  const orderId = params.order_id as string;
  const { user } = useAuth();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTracking();
    const interval = setInterval(loadTracking, 7000);
    return () => clearInterval(interval);
  }, []);

  async function loadTracking() {
    try {
      const res = await fetch(apiUrl(`/api/rider/customer-tracking?order_id=${orderId}`));
      const json = await res.json();
      if (json.success) setData(json);
    } catch (err) {
      console.log("customer-tracking error:", err);
    } finally {
      setLoading(false);
    }
  }

  async function respondToQuote(accepted: boolean) {
    const response = await fetch(apiUrl("/api/vendor/orders/price-quote-response"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: orderId,
        customer_id: user?.id || data?.order?.customer_id,
        accepted,
        actor_user_id: user?.id,
      }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Quote response failed", json.error || json.message || "Unable to update quote.");
      return;
    }
    Alert.alert(accepted ? "Quote accepted" : "Quote rejected", accepted ? "The vendor can now confirm the order." : "The order will not proceed with this quote.");
    loadTracking();
  }

  if (loading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>Loading live delivery status…</Text>
      </View>
    );
  }

  const { assignment, order } = data;
  const riderLat = assignment.rider_lat;
  const riderLng = assignment.rider_lng;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          Status: {assignment.status?.toUpperCase()}
        </Text>
        <Text style={styles.subText}>{order.delivery_address}</Text>
      </View>

      {order.price_quote_status === "pending_customer_approval" ? (
        <View style={styles.quotePanel}>
          <Text style={styles.quoteTitle}>Vendor Price Quote</Text>
          {(order.vendor_price_quote?.items || []).map((item: any, index: number) => (
            <Text key={`${item.item_id || index}`} style={styles.quoteLine}>
              {item.item_name || "Item"} x {item.qty || 1}: Rs {Number(item.price || 0).toFixed(2)}
            </Text>
          ))}
          <Text style={styles.quoteTotal}>Total: Rs {Number(order.quoted_total_amount || 0).toFixed(2)}</Text>
          <View style={styles.quoteActions}>
            <TouchableOpacity style={styles.acceptQuoteBtn} onPress={() => respondToQuote(true)}>
              <Text style={styles.quoteBtnText}>Approve Quote</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rejectQuoteBtn} onPress={() => respondToQuote(false)}>
              <Text style={styles.quoteBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <CrossPlatformMap
        style={{ flex: 1 }}
        initialRegion={{
          latitude: riderLat || order.delivery_lat,
          longitude: riderLng || order.delivery_lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        markers={[
          ...(riderLat && riderLng
            ? [{
                id: "rider",
                latitude: Number(riderLat),
                longitude: Number(riderLng),
                title: "Delivery Rider",
                pinColor: "blue",
              }]
            : []),
          ...(order.delivery_lat && order.delivery_lng
            ? [{
                id: "delivery",
                latitude: Number(order.delivery_lat),
                longitude: Number(order.delivery_lng),
                title: "Delivery Address",
                pinColor: "green",
              }]
            : []),
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  statusBar: { padding: 10, backgroundColor: "#111827" },
  statusText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  subText: { color: "#d1d5db", marginTop: 4 },
  quotePanel: { padding: 12, backgroundColor: "#fff7ed", borderBottomWidth: 1, borderBottomColor: "#fed7aa" },
  quoteTitle: { fontWeight: "900", color: "#9a3412", marginBottom: 6 },
  quoteLine: { color: "#7c2d12", marginTop: 3 },
  quoteTotal: { color: "#7c2d12", fontWeight: "900", marginTop: 8 },
  quoteActions: { flexDirection: "row", gap: 10, marginTop: 10 },
  acceptQuoteBtn: { flex: 1, backgroundColor: "#16a34a", padding: 10, borderRadius: 8 },
  rejectQuoteBtn: { flex: 1, backgroundColor: "#dc2626", padding: 10, borderRadius: 8 },
  quoteBtnText: { color: "#fff", textAlign: "center", fontWeight: "900" },
});


