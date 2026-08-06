const { supabaseAdmin } = require("../lib/supabaseAdmin");
const { Expo } = require("expo-server-sdk");
const expo = new Expo();

const VENDOR_RESPONSE_TIMEOUT_MS = 5 * 60 * 1000; // 5 Minutes
const SMS_FALLBACK_DELAY_MS = 3 * 60 * 1000;      // 3 Minutes

// 1. Send Initial Push & In-App Notification
async function notifyVendorNewOrder(order) {
  try {
    const { data: vendor } = await supabaseAdmin
      .from("vendors")
      .select("owner_user_id, phone_number, expo_push_token")
      .eq("id", order.vendor_id)
      .single();

    // In-App Notification Entry
    await supabaseAdmin.from("notifications").insert({
      user_id: vendor.owner_user_id,
      title: "New Order Received!",
      body: `Order #${order.id.slice(0, 8)} totaling ₹${order.total_amount} is awaiting your acceptance.`,
      type: "new_order",
      metadata: { order_id: order.id },
    });

    // Primary: Expo Push Notification
    if (vendor?.expo_push_token && Expo.isExpoPushToken(vendor.expo_push_token)) {
      await expo.sendPushNotificationsAsync([{
        to: vendor.expo_push_token,
        sound: "default",
        title: "⚡ New Order Received!",
        body: `Order #${order.id.slice(0, 8)} worth ₹${order.total_amount}. Tap to accept.`,
        data: { orderId: order.id },
        priority: "high",
      }]);
    }
  } catch (err) {
    console.error("Failed to execute primary push notification:", err);
  }
}

// 2. Background Escalation Worker (Run every 60 seconds)
async function processOrderEscalations() {
  const now = new Date();

  // Fetch pending unacknowledged orders
  const { data: pendingOrders } = await supabaseAdmin
    .from("orders")
    .select("*, vendors(phone_number, owner_user_id)")
    .eq("status", "pending");

  if (!pendingOrders) return;

  for (const order of pendingOrders) {
    const createdAt = new Date(order.created_at);
    const elapsedMs = now - createdAt;

    // Trigger Configurable SMS Fallback if Push unanswered after threshold
    if (elapsedMs >= SMS_FALLBACK_DELAY_MS && !order.sms_fallback_sent) {
      await sendSmsFallback(order.vendors.phone_number);
      await supabaseAdmin
        .from("orders")
        .update({ sms_fallback_sent: true })
        .eq("id", order.id);
    }

    // Auto-timeout order if unanswered after max response window
    if (elapsedMs >= VENDOR_RESPONSE_TIMEOUT_MS) {
      await handleOrderTimeout(order);
    }
  }
}

async function sendSmsFallback(phoneNumber) {
  console.log(`[SMS Fallback Triggered] Sending alert to ${phoneNumber}`);
  // MSG91 / SMS Gateway Integration
  // Text: "You have received a new order on SabSewa Local. Please open the app to accept or decline the order."
}

async function handleOrderTimeout(order) {
  // Update order status to timed out
  await supabaseAdmin
    .from("orders")
    .update({ status: "timed_out", cancellation_reason: "Vendor response timeout" })
    .eq("id", order.id);

  // Notify Customer
  await supabaseAdmin.from("notifications").insert({
    user_id: order.customer_id,
    title: "Vendor Unavailable",
    body: "The selected vendor did not respond in time. Tap to view alternative nearby vendors for your cart.",
    type: "order_timed_out",
    metadata: { order_id: order.id, category: order.category, locality: order.locality },
  });
}

module.exports = { notifyVendorNewOrder, processOrderEscalations };