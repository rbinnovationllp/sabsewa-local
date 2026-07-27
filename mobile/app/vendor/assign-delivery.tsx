import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiUrl } from "@/lib/backend";

export default function AssignDelivery() {
  const { vendor_id, terminal_id } = useLocalSearchParams();

  const [orders, setOrders] = useState([]);
  const [riders, setRiders] = useState([]);

  useEffect(() => {
    fetchOrders();
    fetchRiders();
  }, []);

  async function fetchOrders() {
    const res = await fetch(apiUrl(`/api/orders/pending?vendor_id=${vendor_id}`));
    const json = await res.json();
    if (json.success) setOrders(json.orders);
  }

  async function fetchRiders() {
    const res = await fetch(apiUrl(`/api/riders?vendor_id=${vendor_id}&terminal_id=${terminal_id}`));
    const json = await res.json();
    if (json.success) setRiders(json.riders);
  }

  async function assign(order_id: string, delivery_boy_id: string) {
    const res = await fetch(apiUrl("/api/vendor/assign-delivery"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendor_id,
        terminal_id,
        order_id,
        delivery_boy_id,
      }),
    });

    const json = await res.json();
    if (json.success) {
      alert(`Assigned! Share Rider Link:\n${json.rider_link}`);
      fetchOrders(); // reload list
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Assign Delivery Boy</Text>

      {orders.map((order: any) => (
        <View key={order.id} style={styles.orderCard}>
          <Text style={styles.orderTitle}>Order #{order.id}</Text>
          <Text>Customer: {order.customer_name}</Text>
          <Text>Address: {order.delivery_address}</Text>

          <Text style={styles.subheading}>Select Rider:</Text>

          {riders.map((r: any) => (
            <TouchableOpacity
              key={r.id}
              style={styles.riderBtn}
              onPress={() => assign(order.id, r.id)}
            >
              <Text style={styles.riderText}>{r.name} — {r.phone}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60 },
  title: { fontSize: 26, fontWeight: "900", marginBottom: 15 },
  orderCard: {
    borderWidth: 1,
    padding: 15,
    borderRadius: 10,
    marginBottom: 25,
  },
  orderTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  subheading: { marginTop: 10, marginBottom: 5, fontWeight: "700" },
  riderBtn: {
    padding: 12,
    backgroundColor: "#007AFF",
    borderRadius: 8,
    marginTop: 5,
  },
  riderText: { color: "white", fontWeight: "600" },
});


