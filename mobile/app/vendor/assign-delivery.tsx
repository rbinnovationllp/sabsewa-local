import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiUrl } from "@/lib/backend";

export default function AssignDelivery() {
  const { vendor_id, terminal_id } = useLocalSearchParams<{ vendor_id?: string; terminal_id?: string }>();
  const [orders, setOrders] = useState<any[]>([]);
  const [riders, setRiders] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    fetchOrders();
    fetchRiders();
    fetchSettings();
  }, [vendor_id, terminal_id]);

  async function fetchOrders() {
    if (!vendor_id) return;
    const params = new URLSearchParams({ vendor_id: String(vendor_id) });
    if (terminal_id) params.set("terminal_id", String(terminal_id));
    const res = await fetch(apiUrl(`/api/orders/pending?${params.toString()}`));
    const json = await res.json();
    if (json.success) setOrders(json.orders || []);
  }

  async function fetchRiders() {
    if (!vendor_id || !terminal_id) return;
    const res = await fetch(apiUrl(`/api/riders?vendor_id=${vendor_id}&terminal_id=${terminal_id}`));
    const json = await res.json();
    if (json.success) setRiders(json.riders || []);
  }

  async function fetchSettings() {
    if (!terminal_id) return;
    const res = await fetch(apiUrl(`/api/vendor/delivery-settings/terminal/${terminal_id}`));
    const json = await res.json();
    if (json.success) setSettings(json.settings || null);
  }

  async function assign(order_id: string, delivery_boy_id?: string, delivery_mode?: string) {
    const res = await fetch(apiUrl("/api/vendor/assign-delivery"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendor_id, terminal_id, order_id, delivery_boy_id, delivery_mode }),
    });

    const json = await res.json();
    if (!res.ok || !json.success) {
      Alert.alert("Assignment failed", json.message || "Unable to assign delivery staff.");
      return;
    }

    Alert.alert(
      delivery_mode === "vendor_self" ? "Self delivery recorded" : "Delivery staff assigned",
      json.rider_link
        ? `Share restricted delivery link only with this staff member:\n${json.rider_link}`
        : "This order is marked for delivery by the vendor/shop owner."
    );
    fetchOrders();
    fetchRiders();
  }

  const deliveryModel = settings?.delivery_model || "multiple_staff";
  const activeRiders = riders.filter((r: any) => r.is_active !== false && r.status !== "inactive");
  const defaultRider =
    activeRiders.find((r: any) => r.id === settings?.default_delivery_boy_id) ||
    (deliveryModel === "single_staff" && activeRiders.length === 1 ? activeRiders[0] : null);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Assign Delivery Staff</Text>
      <Text style={styles.note}>
        Assign delivery only after the vendor has accepted and prepared the order. Delivery staff can view only their assigned deliveries and cannot accept/reject orders, approve credit, update catalogue, access KYC, billing or customer databases.
      </Text>

      {!terminal_id ? (
        <Text style={styles.warning}>Terminal is missing. Open this page from a terminal-linked vendor order or the Delivery Team page.</Text>
      ) : null}
      <View style={styles.modelPanel}>
        <Text style={styles.modelTitle}>Delivery model: {deliveryModel === "vendor_self" ? "Self Delivery" : deliveryModel === "single_staff" ? "One Delivery Staff" : "Multiple Staff"}</Text>
        <Text style={styles.note}>
          {deliveryModel === "vendor_self"
            ? "The vendor/shop owner will deliver orders personally. No staff account is required."
            : deliveryModel === "single_staff"
              ? "This terminal uses one delivery person. Use the recommended one-tap assignment below."
              : "Select the delivery staff member for each order."}
        </Text>
      </View>
      {deliveryModel !== "vendor_self" && activeRiders.length === 0 ? <Text style={styles.note}>No active delivery staff found. Add staff from Vendor Dashboard - Delivery Team or switch Delivery Settings to Self Delivery.</Text> : null}
      {orders.length === 0 ? <Text style={styles.note}>No accepted or packed orders available for assignment.</Text> : null}

      {orders.map((order: any) => (
        <View key={order.id} style={styles.orderCard}>
          <Text style={styles.orderTitle}>Order #{order.order_number || order.id}</Text>
          <Text>Customer: {order.customer_name || "Details protected until acceptance"}</Text>
          <Text>Address: {order.delivery_address || order.customer_address || "Not provided"}</Text>
          <Text>Status: {order.status}</Text>

          {deliveryModel === "vendor_self" ? (
            <>
              <Text style={styles.subheading}>Self Delivery</Text>
              <TouchableOpacity style={styles.selfBtn} onPress={() => assign(order.id, undefined, "vendor_self")}>
                <Text style={styles.riderText}>Vendor / Shop Owner Will Deliver</Text>
                <Text style={styles.riderMeta}>No delivery-staff link will be created.</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {deliveryModel === "single_staff" && defaultRider ? (
            <>
              <Text style={styles.subheading}>Recommended One-Tap Assignment</Text>
              <TouchableOpacity style={styles.recommendedBtn} onPress={() => assign(order.id, defaultRider.id)}>
                <Text style={styles.riderText}>Assign to {defaultRider.name || "Delivery Staff"}</Text>
                <Text style={styles.riderMeta}>{defaultRider.phone || "No phone"} | Status: {defaultRider.status || "available"}</Text>
              </TouchableOpacity>
            </>
          ) : null}

          {deliveryModel !== "vendor_self" ? <Text style={styles.subheading}>Select Delivery Staff</Text> : null}
          {deliveryModel !== "vendor_self" && activeRiders.map((r: any) => {
            const disabled = r.is_active === false || r.status === "inactive";
            return (
              <TouchableOpacity
                key={r.id}
                style={[styles.riderBtn, disabled && styles.disabledBtn]}
                onPress={() => assign(order.id, r.id)}
                disabled={disabled}
              >
                <Text style={styles.riderText}>{r.name || "Delivery Staff"} - {r.phone || "No phone"}</Text>
                <Text style={styles.riderMeta}>{disabled ? "Disabled" : `Status: ${r.status || "available"}`}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 26, fontWeight: "900", marginBottom: 4 },
  note: { color: "#4b5563", lineHeight: 20 },
  warning: { borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", color: "#9a3412", borderRadius: 8, padding: 10 },
  modelPanel: { borderWidth: 1, borderColor: "#bfdbfe", backgroundColor: "#eff6ff", borderRadius: 8, padding: 12 },
  modelTitle: { fontWeight: "900", color: "#1e3a8a", marginBottom: 4 },
  orderCard: { borderWidth: 1, borderColor: "#e5e7eb", padding: 15, borderRadius: 10, marginBottom: 12, backgroundColor: "#fff" },
  orderTitle: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
  subheading: { marginTop: 10, marginBottom: 5, fontWeight: "700" },
  riderBtn: { padding: 12, backgroundColor: "#007AFF", borderRadius: 8, marginTop: 5 },
  recommendedBtn: { padding: 12, backgroundColor: "#0f766e", borderRadius: 8, marginTop: 5 },
  selfBtn: { padding: 12, backgroundColor: "#7c3aed", borderRadius: 8, marginTop: 5 },
  riderText: { color: "white", fontWeight: "700" },
  riderMeta: { color: "white", opacity: 0.9, marginTop: 2 },
  disabledBtn: { backgroundColor: "#94a3b8" },
});
