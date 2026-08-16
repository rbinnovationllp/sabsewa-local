import express from "express";
import { supabase } from "../connection.js";
import { writeOrderAuditLog } from "../audit/orderAudit.js";
import { notifyCustomerOrderDispatched } from "../notifications/dispatchNotificationService.js";
import { recordPartnerCommissionForVendorRevenue } from "../partner/partnerCommissionService.js";

const router = express.Router();

const VENDOR_RESPONSE_EXPIRED_STATUS = "expired_vendor_no_response";

function isVendorResponseExpired(order) {
  if (!order || order.status !== "pending" || !order.vendor_response_deadline_at) return false;
  return new Date(order.vendor_response_deadline_at).getTime() <= Date.now();
}

async function markVendorResponseExpired(order, req = null) {
  if (!order?.id || order.status !== "pending") return order;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("hyperlocal_orders")
    .update({
      status: VENDOR_RESPONSE_EXPIRED_STATUS,
      vendor_response_status: "expired",
      vendor_response_action_at: now,
      updated_at: now,
    })
    .eq("id", order.id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (error) throw error;
  const expired = data || { ...order, status: VENDOR_RESPONSE_EXPIRED_STATUS, vendor_response_status: "expired" };
  await writeOrderAuditLog({
    orderId: order.id,
    vendorId: order.vendor_id,
    action: "vendor_response_window_expired",
    fromStatus: "pending",
    toStatus: VENDOR_RESPONSE_EXPIRED_STATUS,
    metadata: { vendor_response_deadline_at: order.vendor_response_deadline_at },
    req,
  });
  return expired;
}

async function expirePendingVendorResponses({ vendorId, terminalId } = {}, req = null) {
  if (!vendorId) return 0;
  let query = supabase
    .from("hyperlocal_orders")
    .select("id, vendor_id, terminal_id, status, vendor_response_deadline_at")
    .eq("vendor_id", vendorId)
    .eq("status", "pending")
    .not("vendor_response_deadline_at", "is", null)
    .lte("vendor_response_deadline_at", new Date().toISOString())
    .limit(50);
  if (terminalId) query = query.eq("terminal_id", terminalId);
  const { data, error } = await query;
  if (error) throw error;
  for (const order of data || []) await markVendorResponseExpired(order, req);
  return (data || []).length;
}

const FULL_DETAIL_STATUSES = new Set([
  "accepted",
  "packed",
  "out_for_delivery",
  "completed",
]);

function orderItems(order) {
  if (Array.isArray(order.items)) return order.items;
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

function limitedOrderSummary(order) {
  const items = orderItems(order);
  const summaryItems = items.slice(0, 3).map((item) => {
    const qty = Number(item.qty || item.quantity || 1);
    const price = Number(item.price || 0);
    return {
      item_id: item.item_id || item.id || null,
      item_name: item.item_name || item.product_name || item.name || "Item",
      qty,
      price,
      line_total: price * qty,
      price_quote_required: Boolean(item.price_quote_required),
      price_display_mode: item.price_display_mode || "show_price",
      price_label: item.price_label || (item.price_quote_required ? "Ask Vendor" : null),
    };
  });

  return {
    id: order.id,
    vendor_id: order.vendor_id,
    terminal_id: order.terminal_id,
    status: order.status,
    created_at: order.created_at,
    updated_at: order.updated_at,
    total_amount: order.total_amount,
    payment_method: order.payment_method,
    requested_delivery_time: order.requested_delivery_time || null,
    general_delivery_area: order.general_delivery_area || null,
    approx_distance_km: order.approx_distance_km || null,
    safe_order_instructions: order.safe_order_instructions || order.order_instructions || null,
    partial_fulfillment_status: order.partial_fulfillment_status || "none",
    partial_fulfillment_offer: order.partial_fulfillment_offer || null,
    price_quote_required: Boolean(order.price_quote_required),
    price_quote_status: order.price_quote_status || "not_required",
    vendor_price_quote: order.vendor_price_quote || null,
    quoted_total_amount: order.quoted_total_amount || null,
    delivery_charge: order.delivery_charge == null ? 0 : Number(order.delivery_charge),
    delivery_charge_original: order.delivery_charge_original == null ? null : Number(order.delivery_charge_original),
    delivery_charge_override_amount: order.delivery_charge_override_amount == null ? null : Number(order.delivery_charge_override_amount),
    delivery_charge_override_reason: order.delivery_charge_override_reason || null,
    free_delivery_min_order: order.free_delivery_min_order == null ? 0 : Number(order.free_delivery_min_order),
    minimum_delivery_order_value: order.minimum_delivery_order_value == null ? 0 : Number(order.minimum_delivery_order_value),
    item_count: items.reduce((sum, item) => sum + Number(item.qty || item.quantity || 1), 0),
    summary_items: summaryItems,
    has_more_items: items.length > 3,
    locked_fields: [
      "customer_address",
      "customer_phone",
      "customer_contact",
      "invoice",
      "delivery_details",
    ],
    details_unlocked: false,
  };
}

function fullOrderDetails(order) {
  return {
    ...order,
    details_unlocked: true,
  };
}

function firstPlatformCharge(value) {
  if (Array.isArray(value)) return value[0] || null;
  if (Array.isArray(value?.data)) return value.data[0] || null;
  return value || null;
}

function rupeesFromPaise(value) {
  return Number(value || 0) / 100;
}

function vendorOrderView(order) {
  return FULL_DETAIL_STATUSES.has(order.status)
    ? fullOrderDetails(order)
    : limitedOrderSummary(order);
}


router.get("/count", async (req, res) => {
  try {
    const vendorId = req.query.vendor_id;
    const terminalId = req.query.terminal_id;
    if (!vendorId) return res.status(400).json({ success: false, error: "vendor_id is required" });

    await expirePendingVendorResponses({ vendorId, terminalId }, req);

    let orderQuery = supabase
      .from("hyperlocal_orders")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", vendorId)
      .eq("status", "pending");
    if (terminalId) orderQuery = orderQuery.eq("terminal_id", terminalId);
    const { count, error } = await orderQuery;
    if (error) throw error;

    const { count: unreadNotifications, error: notificationError } = await supabase
      .from("vendor_notifications")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", vendorId)
      .is("read_at", null);
    if (notificationError) throw notificationError;

    return res.json({
      success: true,
      pending_orders: count || 0,
      unread_notifications: unreadNotifications || 0,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
router.get("/", async (req, res) => {
  try {
    const vendorId = req.query.vendor_id;
    const terminalId = req.query.terminal_id;
    const actorUserId = req.query.actor_user_id || null;

    if (!vendorId) {
      return res.status(400).json({ success: false, error: "vendor_id is required" });
    }

    await expirePendingVendorResponses({ vendorId, terminalId }, req);

    let query = supabase
      .from("hyperlocal_orders")
      .select("*")
      .eq("vendor_id", vendorId)
      .in("status", ["pending", "accepted", "packed", "out_for_delivery", "completed", "expired_vendor_no_response", "rejected"])
      .order("created_at", { ascending: false });

    if (terminalId) query = query.eq("terminal_id", terminalId);

    const { data, error } = await query;
    if (error) throw error;

    const orders = (data || []).map(vendorOrderView);
    const unlockedCount = orders.filter((order) => order.details_unlocked).length;

    await writeOrderAuditLog({
      vendorId,
      actorUserId,
      action: "vendor_order_list_view",
      metadata: {
        terminal_id: terminalId || null,
        order_count: orders.length,
        unlocked_count: unlockedCount,
        redacted_count: orders.length - unlockedCount,
      },
      req,
    });

    if (unlockedCount > 0) {
      await Promise.all(
        orders
          .filter((order) => order.details_unlocked)
          .map((order) =>
            writeOrderAuditLog({
              orderId: order.id,
              vendorId,
              actorUserId,
              action: "vendor_full_order_details_view",
              metadata: { status: order.status },
              req,
            })
          )
      );
    }

    return res.json({ success: true, orders });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Middleware to validate order exists and vendor owns terminal
 */
async function verifyVendor(req, res, next) {
  try {
    const { order_id, vendor_id } = req.body;

    const { data: order, error } = await supabase
      .from("hyperlocal_orders")
      .select("id, vendor_id, status, total_amount, delivery_charge, partial_fulfillment_status, price_quote_required, price_quote_status, vendor_response_deadline_at, vendor_response_status")
      .eq("id", order_id)
      .single();

    if (error || !order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.vendor_id !== vendor_id) {
      return res.status(403).json({
        success: false,
        message: "Not allowedâ€”Vendor mismatch",
      });
    }

    if (isVendorResponseExpired(order)) {
      const expired = await markVendorResponseExpired(order, req);
      return res.status(409).json({
        success: false,
        message: "This order response window has expired.",
        order: limitedOrderSummary(expired),
      });
    }

    req.order = order;
    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Accept Order
 */
router.post("/accept", verifyVendor, async (req, res) => {
  const { order_id, vendor_comment, actor_user_id, accepted_items } = req.body;

  if (req.order.status !== "pending" && req.order.status !== "accepted") {
    return res.status(400).json({
      success: false,
      message: "Only pending orders can be accepted.",
    });
  }

  if (req.order.partial_fulfillment_status === "pending_customer_confirmation") {
    return res.status(409).json({
      success: false,
      message: "Customer must confirm the revised order before vendor acceptance.",
    });
  }

  if (req.order.price_quote_required && req.order.price_quote_status !== "customer_accepted") {
    return res.status(409).json({
      success: false,
      message: "Customer must approve the quoted price before this order can be accepted.",
    });
  }

  const { data, error } = await supabase.rpc("accept_order_with_wallet_fee", {
    p_order_id: order_id,
    p_vendor_id: req.order.vendor_id,
    p_actor_user_id: actor_user_id || null,
    p_vendor_comment: vendor_comment || null,
    p_accepted_items: accepted_items || null,
  });

  if (error)
    return res.status(500).json({ success: false, error: error.message });

  await supabase
    .from("hyperlocal_orders")
    .update({
      vendor_response_status: "accepted",
      vendor_response_action_at: new Date().toISOString(),
      vendor_response_actor_user_id: actor_user_id || null,
    })
    .eq("id", order_id);

  return res.json({
    success: true,
    message: "Order accepted",
    order: fullOrderDetails(data.order),
    vendor_advance_wallet: data.wallet,
  });
});

router.post("/partial-offer", verifyVendor, async (req, res) => {
  const { order_id, offered_items, vendor_comment, actor_user_id } = req.body;

  if (req.order.status !== "pending") {
    return res.status(400).json({
      success: false,
      message: "Partial fulfilment can be offered only for pending orders.",
    });
  }

  if (!Array.isArray(offered_items) || offered_items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Select at least one available item and quantity for partial fulfilment.",
    });
  }

  const { data, error } = await supabase
    .from("hyperlocal_orders")
    .update({
      partial_fulfillment_offer: { items: offered_items, vendor_comment: vendor_comment || null },
      partial_fulfillment_status: "pending_customer_confirmation",
      partial_fulfillment_offered_at: new Date().toISOString(),
      vendor_comment: vendor_comment || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order_id)
    .select()
    .single();

  if (error) return res.status(500).json({ success: false, error: error.message });

  await writeOrderAuditLog({
    orderId: order_id,
    vendorId: req.order.vendor_id,
    actorUserId: actor_user_id,
    action: "vendor_partial_fulfillment_offer",
    fromStatus: req.order.status,
    toStatus: req.order.status,
    metadata: {
      customer_details_remain_locked: true,
      offered_items,
      vendor_comment: vendor_comment || null,
    },
    req,
  });

  return res.json({
    success: true,
    message: "Partial fulfilment sent to customer for confirmation.",
    order: limitedOrderSummary(data),
  });
});

router.post("/partial-offer-response", async (req, res) => {
  const { order_id, customer_id, accepted, actor_user_id } = req.body;

  if (!order_id || !customer_id || typeof accepted !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "order_id, customer_id and accepted are required.",
    });
  }

  const { data: order, error: orderError } = await supabase
    .from("hyperlocal_orders")
    .select("id, vendor_id, customer_id, status, partial_fulfillment_status")
    .eq("id", order_id)
    .single();

  if (orderError || !order) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }

  if (order.customer_id !== customer_id) {
    return res.status(403).json({ success: false, message: "Not allowed for this customer." });
  }

  if (order.status !== "pending" || order.partial_fulfillment_status !== "pending_customer_confirmation") {
    return res.status(400).json({
      success: false,
      message: "No pending partial fulfilment offer is available for this order.",
    });
  }

  const nextStatus = accepted ? "customer_accepted" : "customer_rejected";
  const { data, error } = await supabase
    .from("hyperlocal_orders")
    .update({
      partial_fulfillment_status: nextStatus,
      partial_fulfillment_confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", order_id)
    .select()
    .single();

  if (error) return res.status(500).json({ success: false, error: error.message });

  await writeOrderAuditLog({
    orderId: order_id,
    vendorId: order.vendor_id,
    actorUserId: actor_user_id || customer_id,
    action: accepted ? "customer_accept_partial_fulfillment" : "customer_reject_partial_fulfillment",
    fromStatus: order.status,
    toStatus: order.status,
    metadata: {
      customer_details_remain_locked: true,
      partial_fulfillment_status: nextStatus,
    },
    req,
  });

  return res.json({ success: true, order: data });
});

router.post("/price-quote", verifyVendor, async (req, res) => {
  try {
    const { order_id, quoted_items, vendor_comment, actor_user_id } = req.body;

    if (req.order.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Prices can be quoted only for pending orders.",
      });
    }

    if (!Array.isArray(quoted_items) || quoted_items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Quoted items and prices are required.",
      });
    }

    const normalizedItems = quoted_items.map((item) => {
      const qty = Number(item.qty || item.quantity || 1);
      const price = Number(item.price);
      if (!Number.isFinite(price) || price < 0) {
        throw new Error("Every quoted item must have a valid price.");
      }
      return {
        ...item,
        qty,
        price,
        vendor_quoted_price: price,
        line_total: price * qty,
        price_quote_required: true,
        price_quote_status: "pending_customer_approval",
      };
    });

    const quotedTotal = normalizedItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0);

    const { data, error } = await supabase
      .from("hyperlocal_orders")
      .update({
        vendor_price_quote: { items: normalizedItems, vendor_comment: vendor_comment || null },
        vendor_price_quoted_at: new Date().toISOString(),
        price_quote_status: "pending_customer_approval",
        quoted_total_amount: quotedTotal,
        vendor_comment: vendor_comment || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order_id)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    await writeOrderAuditLog({
      orderId: order_id,
      vendorId: req.order.vendor_id,
      actorUserId: actor_user_id,
      action: "vendor_submit_price_quote",
      fromStatus: req.order.status,
      toStatus: req.order.status,
      metadata: {
        customer_details_remain_locked: true,
        quoted_total: quotedTotal,
        quoted_items: normalizedItems,
      },
      req,
    });

    return res.json({
      success: true,
      message: "Price quote sent to customer for approval.",
      order: limitedOrderSummary(data),
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.post("/price-quote-response", async (req, res) => {
  const { order_id, customer_id, accepted, actor_user_id } = req.body;

  if (!order_id || !customer_id || typeof accepted !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "order_id, customer_id and accepted are required.",
    });
  }

  const { data: order, error: orderError } = await supabase
    .from("hyperlocal_orders")
    .select("id, vendor_id, customer_id, status, price_quote_status, vendor_price_quote, quoted_total_amount")
    .eq("id", order_id)
    .single();

  if (orderError || !order) {
    return res.status(404).json({ success: false, message: "Order not found" });
  }

  if (order.customer_id !== customer_id) {
    return res.status(403).json({ success: false, message: "Not allowed for this customer." });
  }

  if (order.status !== "pending" || order.price_quote_status !== "pending_customer_approval") {
    return res.status(400).json({
      success: false,
      message: "No pending price quote is available for this order.",
    });
  }

  const now = new Date().toISOString();
  const nextQuoteStatus = accepted ? "customer_accepted" : "customer_rejected";
  const updateData = accepted
    ? {
        price_quote_status: nextQuoteStatus,
        customer_price_quote_responded_at: now,
        items: order.vendor_price_quote?.items || [],
        total_amount: Number(order.quoted_total_amount || 0),
        updated_at: now,
      }
    : {
        price_quote_status: nextQuoteStatus,
        customer_price_quote_responded_at: now,
        updated_at: now,
      };

  const { data, error } = await supabase
    .from("hyperlocal_orders")
    .update(updateData)
    .eq("id", order_id)
    .select()
    .single();

  if (error) return res.status(500).json({ success: false, error: error.message });

  await writeOrderAuditLog({
    orderId: order_id,
    vendorId: order.vendor_id,
    actorUserId: actor_user_id || customer_id,
    actorRole: "customer",
    action: accepted ? "customer_accept_price_quote" : "customer_reject_price_quote",
    fromStatus: order.status,
    toStatus: order.status,
    metadata: {
      customer_details_remain_locked: true,
      quoted_total_amount: order.quoted_total_amount,
    },
    req,
  });

  return res.json({ success: true, order: data });
});

router.post("/delivery-charge-override", verifyVendor, async (req, res) => {
  try {
    const { order_id, override_delivery_charge, override_reason, actor_user_id } = req.body;

    if (!["pending", "accepted", "packed"].includes(req.order.status)) {
      return res.status(400).json({
        success: false,
        message: "Delivery charge can be adjusted only before the order goes out for delivery.",
      });
    }

    const nextCharge = Number(override_delivery_charge);
    if (!Number.isFinite(nextCharge) || nextCharge < 0) {
      return res.status(400).json({ success: false, message: "Enter a valid delivery charge." });
    }

    const originalCharge = Number(req.order.delivery_charge || 0);
    const { data, error } = await supabase
      .from("hyperlocal_orders")
      .update({
        delivery_charge_original: originalCharge,
        delivery_charge: nextCharge,
        delivery_charge_override_amount: nextCharge,
        delivery_charge_override_reason: override_reason || "Vendor delivery charge adjustment",
        delivery_charge_overridden_by: actor_user_id || null,
        delivery_charge_overridden_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order_id)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    await writeOrderAuditLog({
      orderId: order_id,
      vendorId: req.order.vendor_id,
      actorUserId: actor_user_id,
      action: "vendor_delivery_charge_override",
      fromStatus: req.order.status,
      toStatus: req.order.status,
      metadata: {
        previous_delivery_charge: originalCharge,
        new_delivery_charge: nextCharge,
        reason: override_reason || null,
      },
      req,
    });

    return res.json({
      success: true,
      message: "Delivery charge updated for this order.",
      order: vendorOrderView(data),
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Reject Order
 */
router.post("/reject", verifyVendor, async (req, res) => {
  const { order_id, vendor_comment, gemini_customer_message, gemini_audit_log_id, actor_user_id } = req.body;

  if (req.order.status !== "pending") {
    return res.status(400).json({
      success: false,
      message: "Only pending orders can be rejected.",
    });
  }

  if (!vendor_comment?.trim()) {
    return res.status(400).json({
      success: false,
      message: "Rejection reason is required.",
    });
  }

  const { data, error } = await supabase
    .from("hyperlocal_orders")
    .update({
      status: "rejected",
      vendor_comment,
      rejection_reason: vendor_comment,
      vendor_response_status: "rejected",
      vendor_response_action_at: new Date().toISOString(),
      vendor_response_actor_user_id: actor_user_id || null,
      gemini_customer_message,
      gemini_audit_log_id,
      updated_at: new Date(),
    })
    .eq("id", order_id)
    .select()
    .single();

  if (error)
    return res.status(500).json({ success: false, error: error.message });

  await writeOrderAuditLog({
    orderId: order_id,
    vendorId: req.order.vendor_id,
    actorUserId: actor_user_id,
    action: "vendor_reject_order",
    fromStatus: req.order.status,
    toStatus: "rejected",
    metadata: {
      customer_details_were_locked: true,
      rejection_reason: vendor_comment,
      gemini_audit_log_id: gemini_audit_log_id || null,
    },
    req,
  });

  return res.json({ success: true, message: "Order rejected", order: limitedOrderSummary(data) });
});

/**
 * Update Order Status (packed, out_for_delivery, completed)
 */
router.post("/status", verifyVendor, async (req, res) => {
  const { order_id, new_status, actor_user_id } = req.body;

  const allowed = ["packed", "out_for_delivery", "completed"];

  if (!allowed.includes(new_status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status value",
    });
  }

  const { data, error } = await supabase
    .from("hyperlocal_orders")
    .update({
      status: new_status,
      updated_at: new Date(),
    })
    .eq("id", order_id)
    .select()
    .single();

  if (error)
    return res.status(500).json({ success: false, error: error.message });

  let dispatchNotification = null;
  if (new_status === "out_for_delivery") {
    try {
      dispatchNotification = await notifyCustomerOrderDispatched(order_id, {
        actorUserId: actor_user_id || null,
        source: "vendor_status_out_for_delivery",
      });
    } catch (notificationError) {
      dispatchNotification = { error: notificationError.message };
    }
  }

  let platformCharge = null;
  if (new_status === "completed") {
    const { data: chargeData, error: chargeError } = await supabase.rpc("record_platform_order_charge", {
      p_order_id: order_id,
      p_actor_user_id: actor_user_id || null,
    });
    platformCharge = chargeError ? { error: chargeError.message } : chargeData;
    if (!chargeError && chargeData) {
      try {
        const fee = firstPlatformCharge(chargeData);
        const partnerCommission = await recordPartnerCommissionForVendorRevenue({
          vendorId: req.order.vendor_id,
          sourceType: "customer_order_platform_fee",
          sourceId: fee?.id || order_id,
          paymentReference: fee?.id ? `platform_fee:${fee.id}` : `order:${order_id}:completed`,
          grossRevenue: rupeesFromPaise(fee?.base_fee_paise || 0),
          gstAmount: 0,
          metadata: { order_id, platform_fee: fee || chargeData },
        });
        platformCharge = { platform_fee: chargeData, partner_commission: partnerCommission };
      } catch (commissionError) {
        platformCharge = { platform_fee: chargeData, partner_commission_error: commissionError?.message || String(commissionError) };
      }
    }
  }

  await writeOrderAuditLog({
    orderId: order_id,
    vendorId: req.order.vendor_id,
    actorUserId: actor_user_id,
    action: "vendor_order_status_change",
    fromStatus: req.order.status,
    toStatus: new_status,
    metadata: { dispatch_notification: dispatchNotification, platform_charge: platformCharge },
    req,
  });

  return res.json({
    success: true,
    message: `Order marked as ${new_status}`,
    order: data,
    vendor_advance_wallet: null,
    dispatch_notification: dispatchNotification,
    platform_charge: platformCharge,
  });
});

export default router;

