import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert } from "react-native";
import { useLocalSearchParams, Link } from "expo-router";
import { apiUrl } from "@/lib/backend";
import * as Haptics from "expo-haptics";
import { createSmartRejectionMessage } from "@/services/gemini";
import { useAuth } from "@/providers/AuthProvider";

export default function VendorOrdersScreen() {
  const params: any = useLocalSearchParams();
  const vendorId = params.vendor;
  const terminalId = params.terminal;
  const { user } = useAuth();

  const [orders, setOrders] = useState([]);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [lastPendingOrderIds, setLastPendingOrderIds] = useState<string[]>([]);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [quotePrices, setQuotePrices] = useState<Record<string, Record<string, string>>>({});
  const [deliveryOverrides, setDeliveryOverrides] = useState<Record<string, string>>({});
  const [deliveryOverrideReasons, setDeliveryOverrideReasons] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchOrders();

    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchOrders() {
    if (!vendorId) return;

    const query = new URLSearchParams({ vendor_id: String(vendorId) });
    if (terminalId) query.set("terminal_id", String(terminalId));
    if (user?.id) query.set("actor_user_id", user.id);

    const response = await fetch(apiUrl(`/api/vendor/orders?${query.toString()}`));
    const json = await response.json();

    if (!response.ok || !json.success) {
      Alert.alert("Orders unavailable", json.error || "Unable to load vendor orders.");
      return;
    }

    const nextOrders = json.orders || [];
    const pendingIds = nextOrders.filter((order: any) => order.status === "pending").map((order: any) => String(order.id));
    const hasNewPending = pendingIds.some((id: string) => !lastPendingOrderIds.includes(id));
    if (hasNewPending && lastPendingOrderIds.length > 0) {
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate?.([200, 100, 200]); } catch {}
      }
    }
    setLastPendingOrderIds(pendingIds);
    setNewOrderCount(pendingIds.length);
    setOrders(nextOrders);
  }

  async function updateStatus(orderId: string, status: string) {
    const endpoint =
      status === "accepted"
        ? "/api/vendor/orders/accept"
        : "/api/vendor/orders/status";

    const body =
      status === "accepted"
        ? { order_id: orderId, vendor_id: vendorId, actor_user_id: user?.id }
        : { order_id: orderId, vendor_id: vendorId, new_status: status, actor_user_id: user?.id };

    const response = await fetch(apiUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Order update failed", json.error || json.message || "Unable to update order.");
      return;
    }

    fetchOrders();
  }

  function orderItems(order: any) {
    if (Array.isArray(order.items)) return order.items;
    if (Array.isArray(order.summary_items)) return order.summary_items;
    if (typeof order.items === "string") {
      try {
        const parsed = JSON.parse(order.items);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  async function rejectOrder(order: any) {
    const orderId = order.id;
    const reason = rejectionReasons[orderId]?.trim();

    if (!reason) {
      Alert.alert("Reason required", "Please enter why this order is being rejected.");
      return;
    }

    let geminiMessage = null;
    let auditLogId = null;
    try {
      const unavailableItems = orderItems(order).map((item: any) =>
        item.item_name || item.product_name || item.name || item.item_id || "Item"
      );
      const gemini = await createSmartRejectionMessage({
        orderId,
        vendorId: String(vendorId),
        vendorReason: reason,
        customerLanguage: "en",
        unavailableItems,
      });
      if (gemini.success) {
        geminiMessage = gemini.data?.customer_message || null;
        auditLogId = gemini.audit_log_id || null;
      }
    } catch {
      geminiMessage = null;
    }

    const response = await fetch(apiUrl("/api/vendor/orders/reject"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: orderId,
        vendor_id: vendorId,
        actor_user_id: user?.id,
        vendor_comment: reason,
        gemini_customer_message: geminiMessage,
        gemini_audit_log_id: auditLogId,
      }),
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Reject failed", json.error || json.message || "Unable to reject order.");
      return;
    }

    if (geminiMessage) {
      Alert.alert("Order rejected", geminiMessage);
    }

    fetchOrders();
  }

  async function submitPriceQuote(order: any) {
    const items = orderItems(order);
    const quotedItems = items.map((item: any, index: number) => {
      const key = item.item_id || item.id || `${index}`;
      const price = quotePrices[order.id]?.[key];
      return {
        ...item,
        price: Number(price),
      };
    });

    if (quotedItems.some((item: any) => !Number.isFinite(Number(item.price)) || Number(item.price) < 0)) {
      Alert.alert("Quote required", "Enter a valid price for every quote item.");
      return;
    }

    const response = await fetch(apiUrl("/api/vendor/orders/price-quote"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: order.id,
        vendor_id: vendorId,
        actor_user_id: user?.id,
        quoted_items: quotedItems,
      }),
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Quote failed", json.error || json.message || "Unable to send price quote.");
      return;
    }

    Alert.alert("Quote sent", "Customer must approve the quoted price before acceptance.");
    fetchOrders();
  }

  async function overrideDeliveryCharge(order: any) {
    const value = deliveryOverrides[order.id];
    const nextCharge = Number(value);

    if (!Number.isFinite(nextCharge) || nextCharge < 0) {
      Alert.alert("Delivery charge", "Enter a valid delivery charge amount. Use 0 to waive delivery.");
      return;
    }

    const response = await fetch(apiUrl("/api/vendor/orders/delivery-charge-override"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: order.id,
        vendor_id: vendorId,
        actor_user_id: user?.id,
        override_delivery_charge: nextCharge,
        override_reason: deliveryOverrideReasons[order.id] || "Vendor goodwill adjustment",
      }),
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Override failed", json.error || json.message || "Unable to update delivery charge.");
      return;
    }

    Alert.alert("Delivery charge updated", "The order delivery charge has been adjusted.");
    setDeliveryOverrides((current) => ({ ...current, [order.id]: "" }));
    setDeliveryOverrideReasons((current) => ({ ...current, [order.id]: "" }));
    fetchOrders();
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Incoming Orders 📦</Text>

      <View style={styles.counterCard}>
        <Text style={styles.counterValue}>New Orders ({newOrderCount})</Text>
        <Text style={styles.counterText}>This page refreshes every 10 seconds while open. Push notification opens this order page when permitted.</Text>
      </View>

      {orders.length === 0 && (
        <Text style={{ marginTop: 40, fontSize: 18 }}>No orders yet…</Text>
      )}

      {orders.map((order: any) => (
        <View key={order.id} style={styles.orderCard}>
          <Text style={styles.orderId}>Order #{order.id.slice(0, 8)}</Text>
          {order.details_unlocked ? (
            <>
              <Text>Customer Phone: {order.customer_phone || order.customer?.phone || "Not provided"}</Text>
              <Text>Delivery Address: {order.customer_address || order.delivery_address || "Not provided"}</Text>
              <Text style={styles.unlockedText}>Full order and invoice details unlocked after acceptance.</Text>
            </>
          ) : (
            <View style={styles.lockedPanel}>
              <Text style={styles.lockedTitle}>Customer details locked</Text>
              <Text style={styles.lockedText}>
                Address, contact, invoice, and detailed delivery information unlock only after acceptance.
              </Text>
              <Text style={styles.lockedText}>Locked: {(order.locked_fields || []).join(", ")}</Text>
            </View>
          )}

          <View style={styles.itemsList}>
            {(order.details_unlocked ? orderItems(order) : order.summary_items || []).map((item: any, index: number) => (
              <View key={`${order.id}-${index}`} style={styles.itemRow}>
                <Text style={styles.itemName}>
                  {item.item_name || item.product_name || item.name || item.item_id || "Item"}
                </Text>
                <Text style={styles.itemMeta}>
                  Qty {item.qty || item.quantity || 1}
                  {item.price_quote_required ? " | Quote required" : order.details_unlocked ? ` x Rs ${Number(item.price || 0).toFixed(2)}` : item.price != null ? ` x Rs ${Number(item.price || 0).toFixed(2)}` : ""}
                </Text>
                {!order.details_unlocked && (item.price_quote_required || order.price_quote_required) ? (
                  <TextInput
                    style={styles.quoteInput}
                    placeholder="Quote price"
                    keyboardType="numeric"
                    value={quotePrices[order.id]?.[item.item_id || item.id || `${index}`] || ""}
                    onChangeText={(text) =>
                      setQuotePrices((current) => ({
                        ...current,
                        [order.id]: {
                          ...(current[order.id] || {}),
                          [item.item_id || item.id || `${index}`]: text,
                        },
                      }))
                    }
                  />
                ) : null}
              </View>
            ))}
          </View>
          {order.details_unlocked ? (

          <Text style={styles.amount}>Total: ₹{order.total_amount}</Text>
          ) : null}
          {!order.details_unlocked && order.has_more_items ? (
            <Text style={styles.lockedText}>More items are hidden in the locked invoice.</Text>
          ) : null}
          {order.details_unlocked ? null : (
            <Text style={styles.amount}>Items: {order.item_count || 0}</Text>
          )}

          <View style={styles.deliveryPanel}>
            <Text style={styles.deliveryTitle}>Delivery charge</Text>
            <Text style={styles.lockedText}>
              Current: Rs {Number(order.delivery_charge || 0).toFixed(2)}
              {order.delivery_charge_override_amount != null
                ? ` | Vendor adjusted from Rs ${Number(order.delivery_charge_original || 0).toFixed(2)}`
                : ""}
            </Text>
            {["pending", "accepted", "packed"].includes(order.status) ? (
              <>
                <TextInput
                  style={styles.reasonInput}
                  placeholder="New delivery charge, use 0 to waive"
                  keyboardType="numeric"
                  value={deliveryOverrides[order.id] || ""}
                  onChangeText={(text) =>
                    setDeliveryOverrides((current) => ({ ...current, [order.id]: text }))
                  }
                />
                <TextInput
                  style={styles.reasonInput}
                  placeholder="Reason, optional"
                  value={deliveryOverrideReasons[order.id] || ""}
                  onChangeText={(text) =>
                    setDeliveryOverrideReasons((current) => ({ ...current, [order.id]: text }))
                  }
                />
                <TouchableOpacity
                  style={styles.overrideBtn}
                  onPress={() => overrideDeliveryCharge(order)}
                >
                  <Text style={styles.btnTxt}>Update Delivery Charge</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
          <Text>Status: {order.status}</Text>

          {/* TRACK RIDER BUTTON */}
          {order.status === "out_for_delivery" && (
            <Link
              href={{
                pathname: "/vendor/track-rider",
                params: {
                  order_id: order.id,
                  customer_lat: order.customer_lat,
                  customer_lng: order.customer_lng,
                },
              }}
              style={styles.trackBtn}
            >
              <Text style={{ color: "white", textAlign: "center" }}>
                Track Rider 🚴‍♂️
              </Text>
            </Link>
          )}

          {/* ACTION BUTTONS */}
          <View style={styles.btnRow}>
            {order.status === "pending" && (
              <>
                {order.price_quote_required && order.price_quote_status !== "customer_accepted" ? (
                  <TouchableOpacity
                    style={styles.quoteBtn}
                    onPress={() => submitPriceQuote(order)}
                  >
                    <Text style={styles.btnTxt}>Send Price Quote</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => updateStatus(order.id, "accepted")}
                >
                  <Text style={styles.btnTxt}>Accept</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => rejectOrder(order)}
                >
                  <Text style={styles.btnTxt}>Reject</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.reasonInput}
                  placeholder="Reason for rejection"
                  value={rejectionReasons[order.id] || ""}
                  onChangeText={(text) =>
                    setRejectionReasons((current) => ({ ...current, [order.id]: text }))
                  }
                />
              </>
            )}

            {order.status === "accepted" && (
              <TouchableOpacity
                style={styles.packedBtn}
                onPress={() => updateStatus(order.id, "packed")}
              >
                <Text style={styles.btnTxt}>Mark Packed</Text>
              </TouchableOpacity>
            )}

            {order.status === "packed" && (
              <TouchableOpacity
                style={styles.outBtn}
                onPress={() => updateStatus(order.id, "out_for_delivery")}
              >
                <Text style={styles.btnTxt}>Out for Delivery</Text>
              </TouchableOpacity>
            )}

            {order.status === "out_for_delivery" && (
              <TouchableOpacity
                style={styles.completeBtn}
                onPress={() => updateStatus(order.id, "completed")}
              >
                <Text style={styles.btnTxt}>Complete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 40 },
  heading: { fontSize: 26, fontWeight: "900", marginBottom: 20 },
  counterCard: { backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 10, padding: 12, marginBottom: 14 },
  counterValue: { color: "#1166ff", fontWeight: "900", fontSize: 18 },
  counterText: { color: "#334155", marginTop: 4, lineHeight: 18 },

  orderCard: {
    padding: 15,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    backgroundColor: "#fff",
    marginBottom: 20,
  },

  orderId: { fontSize: 18, fontWeight: "700", marginBottom: 5 },
  lockedPanel: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  lockedTitle: { fontWeight: "900", color: "#9a3412", marginBottom: 4 },
  lockedText: { color: "#7c2d12", fontSize: 12, lineHeight: 18 },
  unlockedText: { color: "#166534", fontSize: 12, marginTop: 4 },
  itemsList: { marginVertical: 8, gap: 6 },
  itemRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  itemName: { fontWeight: "700" },
  itemMeta: { color: "#555", marginTop: 2 },

  amount: { fontSize: 18, fontWeight: "900", marginVertical: 5 },
  deliveryPanel: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    marginBottom: 8,
  },
  deliveryTitle: { fontWeight: "900", color: "#0f172a", marginBottom: 4 },

  btnRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  reasonInput: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  quoteInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },

  acceptBtn: { backgroundColor: "green", padding: 10, borderRadius: 8 },
  quoteBtn: { backgroundColor: "#0f766e", padding: 10, borderRadius: 8 },
  overrideBtn: { backgroundColor: "#0ea5e9", padding: 10, borderRadius: 8, marginTop: 6, alignItems: "center" },
  rejectBtn: { backgroundColor: "red", padding: 10, borderRadius: 8 },
  packedBtn: { backgroundColor: "#005bbb", padding: 10, borderRadius: 8 },
  outBtn: { backgroundColor: "#f5a623", padding: 10, borderRadius: 8 },
  completeBtn: { backgroundColor: "purple", padding: 10, borderRadius: 8 },

  trackBtn: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#007bff",
  },

  btnTxt: { color: "white", fontWeight: "700" },
});


