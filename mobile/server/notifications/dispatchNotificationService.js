import crypto from "crypto";
import { supabase } from "../connection.js";

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;

function base64url(input) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function getFirebaseServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PROJECT_ID) {
    return {
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      project_id: process.env.FIREBASE_PROJECT_ID,
    };
  }
  return null;
}

async function getFcmAccessToken(serviceAccount) {
  if (cachedAccessToken && cachedAccessTokenExpiresAt > Date.now() + 60000) return cachedAccessToken;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(serviceAccount.private_key);
  const assertion = `${unsigned}.${base64url(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error_description || json.error || "Unable to obtain FCM access token.");

  cachedAccessToken = json.access_token;
  cachedAccessTokenExpiresAt = Date.now() + Number(json.expires_in || 3600) * 1000;
  return cachedAccessToken;
}

function parseItems(items) {
  if (Array.isArray(items)) return items;
  if (typeof items === "string") {
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function paymentPrepText(method) {
  const value = String(method || "").toLowerCase();
  if (value === "cash") return "Please keep cash ready for delivery.";
  if (value === "vendor_qr") return "Please keep Google Pay, PhonePe, Paytm, BHIM or another compatible UPI app ready to scan the vendor QR.";
  if (value === "bank_transfer") return "Please keep your bank-transfer app/reference ready for vendor confirmation.";
  if (value === "other_digital") return "Please keep your selected digital payment method ready.";
  if (value === "credit") return "This order is marked as vendor-approved credit. Repay later from Repay Credit if a balance remains.";
  return "Please keep your selected payment method ready for delivery.";
}

function buildOrderSummary(order, vendor) {
  const items = parseItems(order.items).map((item) => {
    const qty = Number(item.qty || item.quantity || 1);
    const unitPrice = Number(item.price ?? item.vendor_quoted_price ?? item.displayed_price_at_order ?? 0);
    return {
      item_name: item.item_name || item.product_name || item.name || "Item",
      quantity: qty,
      unit_price: unitPrice,
      line_total: Number(item.line_total ?? unitPrice * qty),
    };
  });
  const amount = Number(order.quoted_total_amount || order.total_amount || 0);
  const orderNumber = order.receipt_number || String(order.id).slice(0, 8).toUpperCase();
  const vendorName = vendor?.shop_name || vendor?.vendor_name || order.shop_name || "SabSewa Local vendor";
  const paymentMethod = order.payment_method || "cash";

  return {
    order_number: orderNumber,
    vendor_name: vendorName,
    items,
    total_amount: amount,
    expected_delivery_time: order.estimated_delivery_window || order.requested_delivery_time || "As confirmed by vendor",
    payment_method: paymentMethod,
    payment_preparation: paymentPrepText(paymentMethod),
  };
}

async function sendFcmToCustomer(customerId, payload) {
  const serviceAccount = getFirebaseServiceAccount();
  if (!serviceAccount) return { sent: 0, skipped: true, reason: "fcm_not_configured" };

  const { data: tokens, error } = await supabase
    .from("device_push_tokens")
    .select("id, token")
    .eq("user_id", customerId)
    .eq("provider", "fcm")
    .eq("consent_status", "granted");
  if (error) throw error;
  if (!tokens?.length) return { sent: 0, skipped: true, reason: "no_fcm_tokens" };

  const accessToken = await getFcmAccessToken(serviceAccount);
  const projectId = serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID;
  let sent = 0;

  for (const row of tokens) {
    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: row.token,
          notification: { title: payload.title, body: payload.body },
          data: Object.fromEntries(Object.entries(payload.data || {}).map(([key, value]) => [key, String(value)])),
        },
      }),
    });
    if (response.ok) {
      sent += 1;
      continue;
    }
    const text = await response.text();
    if (response.status === 404 || text.includes("UNREGISTERED")) {
      await supabase
        .from("device_push_tokens")
        .update({ consent_status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  return { sent, skipped: false, provider: "fcm" };
}

export async function notifyCustomerOrderDispatched(orderId, { actorUserId = null, source = "vendor_dispatch" } = {}) {
  const { data: order, error: orderError } = await supabase
    .from("hyperlocal_orders")
    .select("*")
    .eq("id", orderId)
    .single();
  if (orderError || !order) throw orderError || new Error("Order not found for dispatch notification.");

  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("id, shop_name, vendor_name, public_vendor_id")
    .eq("id", order.vendor_id)
    .maybeSingle();
  if (vendorError) throw vendorError;

  const summary = buildOrderSummary(order, vendor);
  const itemText = summary.items.map((item) => `${item.item_name} x ${item.quantity} @ Rs ${item.unit_price.toFixed(2)}`).join("; ");
  const body = `Order #${summary.order_number} from ${summary.vendor_name} is on the way. ${itemText}. Total Rs ${summary.total_amount.toFixed(2)}. ${summary.payment_preparation}`;
  const payload = {
    title: "Your order is on the way",
    body,
    data: {
      url: `/customer/track?order_id=${order.id}`,
      order_id: order.id,
      notification_type: "order_dispatched_payment_preparation",
    },
  };

  const pushResult = await sendFcmToCustomer(order.customer_id, payload);
  const { data: notification, error: notificationError } = await supabase
    .from("customer_notifications")
    .insert({
      customer_id: order.customer_id,
      vendor_id: order.vendor_id,
      order_id: order.id,
      notification_type: "order_dispatched_payment_preparation",
      title: payload.title,
      body,
      payload: {
        ...summary,
        source,
        actor_user_id: actorUserId,
        notification_policy: "cost_effective_fcm_first_no_twilio_no_sms_for_dispatch",
        push_result: pushResult,
      },
      delivery_channel: pushResult.sent > 0 ? "push" : "in_app",
      delivery_status: pushResult.sent > 0 ? "sent" : "queued",
      sent_at: pushResult.sent > 0 ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (notificationError) throw notificationError;

  return { notification, push_result: pushResult, summary };
}

export async function notifyCustomerPaymentConfirmed(order, {
  paymentMethod,
  amountReceived,
  outstandingAmount,
  paymentStatus,
  actorUserId = null,
} = {}) {
  if (!order?.customer_id || !order?.vendor_id || !order?.id) {
    return { skipped: true, reason: "missing_order_customer_or_vendor" };
  }

  const methodLabel = paymentMethod === "vendor_qr"
    ? "UPI"
    : paymentMethod === "credit"
      ? "Udhaar / Credit"
      : paymentMethod === "cash"
        ? "Cash"
        : "Vendor payment";
  const received = Number(amountReceived || 0);
  const outstanding = Number(outstandingAmount || 0);
  const orderTotal = Number(order.quoted_total_amount || order.total_amount || received + outstanding || 0);
  const isFullPaid = outstanding <= 0 && received >= orderTotal;
  const title = isFullPaid ? "Payment Confirmed" : paymentStatus === "partially_paid" ? "Partial Payment Recorded" : "Credit / Udhaar Recorded";
  const body = isFullPaid
    ? `The vendor has confirmed receipt of Rs ${received.toFixed(2)} by ${methodLabel}. No amount is outstanding against this order.`
    : `The vendor has recorded Rs ${received.toFixed(2)} received by ${methodLabel}. Outstanding Rs ${outstanding.toFixed(2)} has been added to your vendor credit ledger.`;
  const payload = {
    title,
    body,
    data: {
      url: `/customer/OrderHistory`,
      order_id: order.id,
      notification_type: "order_payment_status_updated",
      payment_method: paymentMethod,
      amount_received: received,
      outstanding_amount: outstanding,
      payment_status: paymentStatus,
    },
  };

  const pushResult = await sendFcmToCustomer(order.customer_id, payload);
  const { data: notification, error } = await supabase
    .from("customer_notifications")
    .insert({
      customer_id: order.customer_id,
      vendor_id: order.vendor_id,
      order_id: order.id,
      notification_type: "order_payment_status_updated",
      title,
      body,
      payload: {
        payment_method: paymentMethod,
        amount_received: received,
        outstanding_amount: outstanding,
        order_total: orderTotal,
        actor_user_id: actorUserId,
        push_result: pushResult,
      },
      delivery_channel: pushResult.sent > 0 ? "push" : "in_app",
      delivery_status: pushResult.sent > 0 ? "sent" : "queued",
      sent_at: pushResult.sent > 0 ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (error) throw error;

  return { notification, push_result: pushResult };
}
