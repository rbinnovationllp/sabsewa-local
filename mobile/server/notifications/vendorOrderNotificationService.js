import webpush from "web-push";
import { supabase } from "../connection.js";

let configured = false;

function configureWebPush() {
  if (configured) return true;
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.WEB_PUSH_VAPID_SUBJECT || "mailto:support@sabsewa.in",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

function orderTitle(order) {
  return "New SabSewa Order Received";
}

function orderItemCount(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((sum, item) => sum + Number(item.qty || item.quantity || 1), 0);
}

function orderBody(order) {
  const number = String(order.receipt_number || order.id || "").slice(0, 8).toUpperCase();
  const itemCount = orderItemCount(order);
  const area = order.general_delivery_area ? ` near ${order.general_delivery_area}` : "";
  const distance = order.approx_distance_km != null ? ` (${Number(order.approx_distance_km).toFixed(1)} km approx.)` : "";
  return `Order #${number}: ${itemCount || "New"} item(s)${area}${distance}. Respond within 10 minutes.`;
}

async function sendWebPushToVendor(ownerUserId, payload) {
  if (!configureWebPush()) return { sent: 0, skipped: true, reason: "web_push_vapid_not_configured" };
  if (!ownerUserId) return { sent: 0, skipped: true, reason: "vendor_owner_missing" };

  const { data: subscriptions, error } = await supabase
    .from("web_push_subscriptions")
    .select("id, subscription")
    .eq("user_id", ownerUserId)
    .eq("consent_status", "granted");
  if (error) throw error;
  if (!subscriptions?.length) return { sent: 0, skipped: true, reason: "no_web_push_subscription" };

  let sent = 0;
  for (const row of subscriptions) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify(payload));
      sent += 1;
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await supabase
          .from("web_push_subscriptions")
          .update({ consent_status: "revoked", revoked_at: new Date().toISOString() })
          .eq("id", row.id);
      } else {
        console.error("Vendor web push failed", { subscription_id: row.id, message: error.message });
      }
    }
  }
  return { sent, skipped: false, provider: "web_push" };
}

async function sendFcmToVendor(ownerUserId, payload) {
  // FCM token storage exists in the project, but Firebase service-account dispatch is currently customer-oriented.
  // This result is still recorded so operations can see whether FCM remains unconfigured.
  const { data: tokens, error } = await supabase
    .from("device_push_tokens")
    .select("id")
    .eq("user_id", ownerUserId)
    .eq("provider", "fcm")
    .eq("consent_status", "granted");
  if (error) throw error;
  return { sent: 0, skipped: true, provider: "fcm", reason: tokens?.length ? "fcm_dispatch_not_enabled_for_vendor" : "no_fcm_token" };
}

export async function notifyVendorNewHyperlocalOrder(order) {
  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("id, owner_user_id, shop_name, public_vendor_id")
    .eq("id", order.vendor_id)
    .maybeSingle();
  if (vendorError) throw vendorError;
  if (!vendor?.owner_user_id) return { skipped: true, reason: "vendor_owner_missing" };

  const payload = {
    title: orderTitle(order),
    body: orderBody(order),
    data: {
      url: `/vendor/Orders?vendor=${order.vendor_id}&order=${order.id}`,
      order_id: order.id,
      vendor_id: order.vendor_id,
      notification_type: "vendor_new_order",
      response_deadline_at: order.vendor_response_deadline_at || null,
      privacy: "customer_details_locked_until_vendor_acceptance",
    },
  };

  const [webPushResult, fcmResult] = await Promise.all([
    sendWebPushToVendor(vendor.owner_user_id, payload),
    sendFcmToVendor(vendor.owner_user_id, payload),
  ]);

  const deliveryStatus = webPushResult.sent > 0 || fcmResult.sent > 0 ? "sent" : "queued";
  const deliveryChannel = webPushResult.sent > 0 ? "web_push" : fcmResult.sent > 0 ? "fcm" : "in_app";

  const { data: notification, error } = await supabase
    .from("vendor_notifications")
    .insert({
      vendor_id: order.vendor_id,
      owner_user_id: vendor.owner_user_id,
      order_id: order.id,
      notification_type: "vendor_new_order",
      title: payload.title,
      body: payload.body,
      payload: { ...payload.data, web_push_result: webPushResult, fcm_result: fcmResult },
      delivery_channel: deliveryChannel,
      delivery_status: deliveryStatus,
      sent_at: deliveryStatus === "sent" ? new Date().toISOString() : null,
      expires_at: order.vendor_response_deadline_at || null,
    })
    .select()
    .single();
  if (error) throw error;
  return { notification, web_push_result: webPushResult, fcm_result: fcmResult };
}