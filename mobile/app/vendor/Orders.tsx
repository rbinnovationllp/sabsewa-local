import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Alert } from "react-native";
import { useLocalSearchParams, Link } from "expo-router";
import { apiUrl } from "@/lib/backend";
import * as Haptics from "expo-haptics";
import { createSmartRejectionMessage } from "@/services/gemini";
import { useAuth } from "@/providers/AuthProvider";

const VENDOR_ORDER_ALERT_REPEAT_MS = 15000;
const VENDOR_ORDER_VIBRATION_PATTERN = [700, 250, 700, 250, 700];
const REJECTION_REASON_OPTIONS = [
  "Requested products unavailable",
  "Shop is temporarily busy",
  "Delivery not available right now",
  "Insufficient stock",
  "Shop closing soon",
  "Other reason",
];

async function ringVendorOrderAlert() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {}

  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try { navigator.vibrate?.(VENDOR_ORDER_VIBRATION_PATTERN); } catch {}
  }

  if (typeof window !== "undefined") {
    try {
      const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      const context = new AudioContextCtor();
      const now = context.currentTime;
      [0, 0.55, 1.1].forEach((offset, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(index % 2 === 0 ? 880 : 1040, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.32);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.34);
      });
      setTimeout(() => context.close?.(), 1800);
    } catch {}
  }
}

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
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [paymentReferences, setPaymentReferences] = useState<Record<string, string>>({});
  const [deliverySettingsByTerminal, setDeliverySettingsByTerminal] = useState<Record<string, any>>({});
  const alertLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    fetchOrders();

    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchOrders, 10000);
    const clock = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      clearInterval(interval);
      clearInterval(clock);
      stopVendorAlertLoop();
    };
  }, []);

  function stopVendorAlertLoop() {
    if (alertLoopRef.current) {
      clearInterval(alertLoopRef.current);
      alertLoopRef.current = null;
    }
  }

  function startVendorAlertLoop() {
    if (alertLoopRef.current) return;
    ringVendorOrderAlert();
    alertLoopRef.current = setInterval(() => {
      ringVendorOrderAlert();
    }, VENDOR_ORDER_ALERT_REPEAT_MS);
  }

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
    loadDeliverySettingsForOrders(nextOrders);
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
    if (pendingIds.length > 0) {
      startVendorAlertLoop();
    } else {
      stopVendorAlertLoop();
    }

    setLastPendingOrderIds(pendingIds);
    setNewOrderCount(pendingIds.length);
    setOrders(nextOrders);
  }

  async function loadDeliverySettingsForOrders(nextOrders: any[]) {
    const terminalIds = Array.from(new Set(nextOrders.map((order: any) => order.terminal_id).filter(Boolean)));
    const missingIds = terminalIds.filter((id: any) => !deliverySettingsByTerminal[String(id)]);
    if (!missingIds.length) return;

    const loaded: Record<string, any> = {};
    await Promise.all(
      missingIds.map(async (id: any) => {
        try {
          const response = await fetch(apiUrl(`/api/vendor/delivery-settings/terminal/${id}`));
          const json = await response.json();
          if (json.success && json.settings) loaded[String(id)] = json.settings;
        } catch {}
      })
    );
    if (Object.keys(loaded).length > 0) {
      setDeliverySettingsByTerminal((current) => ({ ...current, ...loaded }));
    }
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

    stopVendorAlertLoop();
    fetchOrders();
  }

  function responseCountdown(order: any) {
    if (!order.vendor_response_deadline_at || order.status !== "pending") return null;
    const remaining = new Date(order.vendor_response_deadline_at).getTime() - nowMs;
    if (remaining <= 0) return "Response window expired";
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `Respond within ${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function confirmAccept(order: any) {
    Alert.alert(
      "Accept order?",
      "Customer contact and full delivery details unlock after acceptance. The platform fee applies only after acceptance.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Accept", onPress: () => updateStatus(order.id, "accepted") },
      ]
    );
  }

  async function offerVisibleItems(order: any) {
    const items = orderItems(order).map((item: any) => ({
      item_id: item.item_id || item.id || null,
      item_name: item.item_name || item.product_name || item.name || "Item",
      qty: Number(item.qty || item.quantity || 1),
      price: item.price == null ? null : Number(item.price),
    })).filter((item: any) => item.item_id || item.item_name);

    if (!items.length) {
      Alert.alert("Partial fulfilment", "No visible items are available to offer.");
      return;
    }

    const response = await fetch(apiUrl("/api/vendor/orders/partial-offer"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id: order.id,
        vendor_id: vendorId,
        actor_user_id: user?.id,
        offered_items: items,
        vendor_comment: "Vendor can fulfil the listed available items.",
      }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Partial offer failed", json.error || json.message || "Unable to send partial offer.");
      return;
    }
    Alert.alert("Partial offer sent", "Customer must confirm before final acceptance.");
    stopVendorAlertLoop();
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

  function finalOrderAmount(order: any) {
    return Number(order.quoted_total_amount || order.total_amount || 0);
  }

  function paymentStatusLabel(order: any) {
    const status = String(order.payment_status || "unpaid");
    if (status === "paid") return "FULLY PAID";
    if (status === "partially_paid") return "PARTIALLY PAID";
    if (status === "credit_due" || status === "pending_payment") return "ON CREDIT / UDHAAR";
    return status.toUpperCase();
  }

  function canCompleteOrder(order: any) {
    return ["paid", "partially_paid", "credit_due", "pending_payment"].includes(String(order.payment_status || ""));
  }

  function completeOrder(order: any) {
    if (!canCompleteOrder(order)) {
      Alert.alert("Record payment first", "Please choose Fully Paid, Partially Paid, On Credit/Udhaar or Unpaid before completing this order. Unpaid orders cannot be completed until the payment position is recorded.");
      return;
    }
    updateStatus(order.id, "completed");
  }

  function methodLabel(method: string) {
    if (method === "cash") return "Cash";
    if (method === "vendor_qr") return "UPI";
    if (method === "credit") return "Credit / Udhaar";
    if (method === "unpaid") return "Unpaid";
    return method || "Not selected";
  }

  function deliveryModelForOrder(order: any) {
    return deliverySettingsByTerminal[String(order.terminal_id || "")]?.delivery_model || "multiple_staff";
  }

  function assignDeliveryLabel(order: any) {
    const model = deliveryModelForOrder(order);
    if (model === "vendor_self") return "Record Self Delivery";
    if (model === "single_staff") return "Assign One Delivery Staff";
    return "Assign Delivery Staff";
  }

  function outForDeliveryLabel(order: any) {
    return deliveryModelForOrder(order) === "vendor_self" ? "Start Self Delivery" : "Out for Delivery";
  }

  async function settleOrder(order: any, paymentMethod: "cash" | "vendor_qr" | "credit" | "unpaid", amountOverride?: number) {
    const total = finalOrderAmount(order);
    const amountReceived = amountOverride == null
      ? paymentMethod === "credit" || paymentMethod === "unpaid"
        ? 0
        : total
      : amountOverride;

    if (!Number.isFinite(amountReceived) || amountReceived < 0 || amountReceived > total) {
      Alert.alert("Payment amount", "Enter an amount between 0 and the order total.");
      return;
    }

    const response = await fetch(apiUrl(`/api/settlement/orders/${order.id}/settle`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payment_method: paymentMethod,
        amount_received: amountReceived,
        payment_reference: paymentReferences[order.id]?.trim() || null,
        confirmed_by: "vendor",
        actor_user_id: user?.id,
        credit_notes: amountReceived < total ? "Vendor recorded unpaid balance as customer credit / udhaar." : null,
      }),
    });

    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Payment update failed", json.error || "Unable to update payment status.");
      return;
    }

    const summary = json.payment_summary;
    Alert.alert(
      "Payment updated",
      summary
        ? `Status: ${summary.status}\nOrder Amount: Rs ${Number(summary.order_amount || 0).toFixed(2)}\nAmount Received: Rs ${Number(summary.amount_received || 0).toFixed(2)}\nOutstanding: Rs ${Number(summary.outstanding_amount || 0).toFixed(2)}`
        : "Customer account and vendor ledger were updated."
    );
    setPaymentAmounts((current) => ({ ...current, [order.id]: "" }));
    setPaymentReferences((current) => ({ ...current, [order.id]: "" }));
    fetchOrders();
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

    stopVendorAlertLoop();
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
    stopVendorAlertLoop();
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
    stopVendorAlertLoop();
    fetchOrders();
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Incoming Orders 📦</Text>

      <View style={styles.counterCard}>
        <Text style={styles.counterValue}>New Orders ({newOrderCount})</Text>
        <Text style={styles.counterText}>This page refreshes every 10 seconds while open. Push notification opens this order page when permitted. Bell/vibration alert repeats until pending orders are accepted, rejected, partially offered, or expired.</Text>
      </View>

      {orders.length === 0 && (
        <Text style={{ marginTop: 40, fontSize: 18 }}>No orders yet…</Text>
      )}

      {orders.map((order: any) => (
        <View key={order.id} style={styles.orderCard}>
          <Text style={styles.orderId}>Order #{order.id.slice(0, 8)}</Text>
          {responseCountdown(order) ? (
            <Text style={responseCountdown(order) === "Response window expired" ? styles.deadlineExpired : styles.deadlineText}>
              {responseCountdown(order)}
            </Text>
          ) : null}
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
                <View style={styles.reasonChipRow}>
                  {REJECTION_REASON_OPTIONS.map((reason) => (
                    <TouchableOpacity
                      key={`${order.id}-${reason}`}
                      style={styles.reasonChip}
                      onPress={() => setRejectionReasons((current) => ({ ...current, [order.id]: reason }))}
                    >
                      <Text style={styles.reasonChipText}>{reason}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
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
          {order.details_unlocked ? (
            <View style={styles.paymentPanel}>
              <Text style={styles.paymentTitle}>Customer Payment / Udhaar</Text>
              <Text style={styles.paymentLine}>Payment Method: {methodLabel(order.payment_method)}</Text>
              <Text style={styles.paymentLine}>Order Amount: Rs {finalOrderAmount(order).toFixed(2)}</Text>
              <Text style={styles.paymentLine}>Status: {paymentStatusLabel(order)}</Text>
              <Text style={styles.lockedText}>Vendor records what was actually received. The customer app and credit ledger are updated from this confirmation.</Text>
              <TextInput
                style={styles.reasonInput}
                placeholder="Partial amount received, e.g. 500"
                keyboardType="numeric"
                value={paymentAmounts[order.id] || ""}
                onChangeText={(text) => setPaymentAmounts((current) => ({ ...current, [order.id]: text }))}
              />
              <TextInput
                style={styles.reasonInput}
                placeholder="Payment reference / note, optional"
                value={paymentReferences[order.id] || ""}
                onChangeText={(text) => setPaymentReferences((current) => ({ ...current, [order.id]: text }))}
              />
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.cashPaidBtn} onPress={() => settleOrder(order, "cash")}>
                  <Text style={styles.btnTxt}>Fully Paid - Cash</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.upiPaidBtn} onPress={() => settleOrder(order, "vendor_qr")}>
                  <Text style={styles.btnTxt}>Fully Paid - UPI</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.partialPaidBtn}
                  onPress={() => settleOrder(order, "cash", Number(paymentAmounts[order.id] || 0))}
                >
                  <Text style={styles.btnTxt}>Partially Paid</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.creditBtn} onPress={() => settleOrder(order, "credit")}>
                  <Text style={styles.btnTxt}>On Credit / Udhaar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.unpaidBtn} onPress={() => settleOrder(order, "unpaid")}>
                  <Text style={styles.btnTxt}>Unpaid</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

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

          {["accepted", "packed", "out_for_delivery"].includes(order.status) && (
            <Link
              href={{
                pathname: "/vendor/assign-delivery",
                params: {
                  vendor_id: vendorId,
                  terminal_id: order.terminal_id || "",
                },
              }}
              style={styles.trackBtn}
            >
              <Text style={{ color: "white", textAlign: "center" }}>
                {assignDeliveryLabel(order)}
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
                  onPress={() => confirmAccept(order)}
                >
                  <Text style={styles.btnTxt}>Accept</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quoteBtn}
                  onPress={() => offerVisibleItems(order)}
                >
                  <Text style={styles.btnTxt}>Offer Available Items</Text>
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
                <Text style={styles.btnTxt}>{outForDeliveryLabel(order)}</Text>
              </TouchableOpacity>
            )}

            {order.status === "out_for_delivery" && (
              <TouchableOpacity
                style={[styles.completeBtn, !canCompleteOrder(order) && styles.disabledBtn]}
                onPress={() => completeOrder(order)}
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
  deadlineText: { color: "#b45309", fontWeight: "900", marginBottom: 8 },
  deadlineExpired: { color: "#991b1b", fontWeight: "900", marginBottom: 8 },
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
  paymentPanel: {
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#86efac",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    marginBottom: 8,
  },
  paymentTitle: { fontWeight: "900", color: "#166534", marginBottom: 4 },
  paymentLine: { color: "#14532d", fontWeight: "700", marginTop: 2 },

  btnRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  reasonChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6, width: "100%" },
  reasonChip: { borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#eff6ff" },
  reasonChipText: { color: "#1d4ed8", fontWeight: "700", fontSize: 12 },
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
  cashPaidBtn: { backgroundColor: "#15803d", padding: 10, borderRadius: 8 },
  upiPaidBtn: { backgroundColor: "#2563eb", padding: 10, borderRadius: 8 },
  partialPaidBtn: { backgroundColor: "#b45309", padding: 10, borderRadius: 8 },
  creditBtn: { backgroundColor: "#7c3aed", padding: 10, borderRadius: 8 },
  unpaidBtn: { backgroundColor: "#6b7280", padding: 10, borderRadius: 8 },
  disabledBtn: { opacity: 0.55 },

  trackBtn: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#007bff",
  },

  btnTxt: { color: "white", fontWeight: "700" },
});


