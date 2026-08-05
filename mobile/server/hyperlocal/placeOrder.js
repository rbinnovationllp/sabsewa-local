import express from "express";
import { supabase } from "../connection.js";
import { assertVendorCanReceiveOrders } from "../securityWallet/securityWalletService.js";
import {
  assertCreditOrderAllowed,
  recordCreditPurchase,
} from "../credit/vendorCreditService.js";

const router = express.Router();

/**
 * POST /api/order/place
 * Body:
 * {
 *   customer_id,
 *   terminal_id,
 *   vendor_id,
 *   items: [{ item_id, qty, price }],
 *   customer_address,
 *   customer_phone
 * }
 */
router.post("/place", async (req, res) => {
  try {
    const {
      customer_id,
      terminal_id,
      vendor_id,
      items,
      customer_address,
      customer_phone,
      payment_method = "prepaid",
      requested_delivery_time = null,
      delivery_charge = null,
      free_delivery_min_order = null,
      minimum_delivery_order_value = null,
      estimated_delivery_window = null,
      delivery_provider_type = "vendor",
      order_instructions = null,
      safe_order_instructions = null,
      general_delivery_area = null,
      approx_distance_km = null,
    } = req.body;

    if (!customer_id || !terminal_id || !vendor_id || !items?.length) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("*")
      .eq("id", vendor_id)
      .single();

    if (vendorError || !vendor) {
      return res.status(404).json({
        success: false,
        message: "Selected shop was not found.",
      });
    }

    if (vendor.status !== "approved") {
      return res.status(409).json({
        success: false,
        message: "This shop is not verified or active for customer orders.",
      });
    }

    if (vendor.verification_status && !["approved", "verified"].includes(String(vendor.verification_status))) {
      return res.status(409).json({
        success: false,
        message: "This shop has not completed business verification.",
      });
    }

    await assertVendorCanReceiveOrders(vendor_id);

    const { data: terminal, error: terminalError } = await supabase
      .from("vendor_terminals")
      .select("id, vendor_id, status, is_open_today, delivery_available, free_delivery_min_order, delivery_fee_below_min, minimum_delivery_order_value, estimated_delivery_min_minutes, estimated_delivery_max_minutes, delivery_provider_type")
      .eq("id", terminal_id)
      .eq("vendor_id", vendor_id)
      .single();

    if (terminalError || !terminal) {
      return res.status(404).json({
        success: false,
        message: "Selected vendor terminal was not found.",
      });
    }

    if (terminal.status !== "active" || terminal.is_open_today === false) {
      return res.status(409).json({
        success: false,
        message: "This shop is not accepting orders right now.",
      });
    }
    if (terminal.delivery_available === false) {
      return res.status(409).json({
        success: false,
        message: "This shop is not accepting delivery orders right now. Pickup may be available if enabled by the vendor.",
      });
    }

    const requestedItemIds = items.map((item) => item.item_id).filter(Boolean);
    const { data: availableItems, error: itemError } = await supabase
      .from("vendor_items")
      .select("id, item_name, price, price_display_mode, price_unit_label, is_available, available_today, stock_quantity, daily_stock_quantity, stock_status, daily_availability_status, expected_restock_at, master_product_id, product_brand_id, product_variant_id, generic_product_name, brand_name, manufacturer, variant_name, pack_size, pack_unit, mrp, mrp_pricing_policy, mrp_discount_percent, barcode, sku, ean, substitution_policy")
      .eq("vendor_id", vendor_id)
      .eq("terminal_id", terminal_id)
      .in("id", requestedItemIds);

    if (itemError) throw itemError;

    const availableById = new Map((availableItems || []).map((item) => [item.id, item]));
    const verifiedItems = [];

    for (const requested of items) {
      const item = availableById.get(requested.item_id);
      const requestedQty = Number(requested.qty || requested.quantity || 1);
      const dailyStock = item?.daily_stock_quantity == null ? null : Number(item.daily_stock_quantity);
      const stockQuantity = item?.stock_quantity == null ? null : Number(item.stock_quantity);
      const effectiveStock = dailyStock ?? stockQuantity;

      const dailyStatus = item?.daily_availability_status || "available";
      const orderableDailyStatus = ["available", "limited_stock", "available_on_request"].includes(dailyStatus);

      if (!item || item.is_available !== true || item.available_today !== true || item.stock_status === "out_of_stock" || !orderableDailyStatus) {
        return res.status(409).json({
          success: false,
          message: `${requested.item_name || "Requested item"} is not available from this vendor today.${item?.expected_restock_at ? ` Expected back: ${item.expected_restock_at}.` : ""}`,
        });
      }

      if (effectiveStock != null && requestedQty > effectiveStock) {
        return res.status(409).json({
          success: false,
          message: `${item.item_name} has only ${effectiveStock} available today.`,
        });
      }

      const price = Number(item.price);
      if (requested.product_variant_id && item.product_variant_id !== requested.product_variant_id) {
        return res.status(409).json({
          success: false,
          message: `${item.item_name} does not match the selected brand or pack-size variant.`,
        });
      }

      const priceDisplayMode = item.price_display_mode || "show_price";
      const requiresQuote = priceDisplayMode === "hide_price" || priceDisplayMode === "market_price" || dailyStatus === "available_on_request";
      verifiedItems.push({
        item_id: item.id,
        item_name: item.item_name,
        generic_product_name: item.generic_product_name || item.item_name,
        brand_name: item.brand_name || null,
        manufacturer: item.manufacturer || null,
        variant_name: item.variant_name || null,
        pack_size: item.pack_size || null,
        pack_unit: item.pack_unit || null,
        mrp: item.mrp == null ? null : Number(item.mrp),
        mrp_pricing_policy: item.mrp_pricing_policy || "manual",
        mrp_discount_percent: item.mrp_discount_percent == null ? 0 : Number(item.mrp_discount_percent),
        barcode: item.barcode || item.ean || item.sku || null,
        master_product_id: item.master_product_id || null,
        product_brand_id: item.product_brand_id || null,
        product_variant_id: item.product_variant_id || null,
        substitution_policy: item.substitution_policy || "customer_approval_required",
        daily_availability_status: dailyStatus,
        qty: requestedQty,
        price: requiresQuote ? null : price,
        displayed_price_at_order: requiresQuote ? null : price,
        price_display_mode: priceDisplayMode,
        price_unit_label: item.price_unit_label || null,
        price_quote_required: requiresQuote,
        price_label: requiresQuote
          ? "Price confirmation required from vendor"
          : `Rs ${price.toFixed(2)}${item.price_unit_label ? `/${item.price_unit_label}` : ""}`,
        line_total: requiresQuote ? null : price * requestedQty,
      });
    }

    const quoteRequired = verifiedItems.some((item) => item.price_quote_required);
    const total_amount = verifiedItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
    const deliveryThresholdSnapshot = Number(free_delivery_min_order ?? terminal.free_delivery_min_order ?? 0);
    const minimumDeliveryOrderSnapshot = Number(minimum_delivery_order_value ?? terminal.minimum_delivery_order_value ?? 0);
    if (minimumDeliveryOrderSnapshot > 0 && total_amount < minimumDeliveryOrderSnapshot) {
      return res.status(409).json({
        success: false,
        message: `This vendor accepts delivery orders from Rs ${minimumDeliveryOrderSnapshot.toFixed(2)}. Please add Rs ${(minimumDeliveryOrderSnapshot - total_amount).toFixed(2)} more.`,
      });
    }
    const deliveryChargeSnapshot = delivery_charge == null
      ? (total_amount >= deliveryThresholdSnapshot ? 0 : Number(terminal.delivery_fee_below_min || 0))
      : Number(delivery_charge);
    const estimatedDeliveryWindowSnapshot =
      estimated_delivery_window ||
      `${terminal.estimated_delivery_min_minutes || 30}-${terminal.estimated_delivery_max_minutes || 60} minutes`;
    const deliveryProviderSnapshot = delivery_provider_type || terminal.delivery_provider_type || "vendor";

    const allowedPaymentMethods = new Set(["prepaid", "cash", "vendor_qr", "bank_transfer", "other_digital", "credit"]);
    if (payment_method === "credit") {
      await assertCreditOrderAllowed({
        vendorId: vendor_id,
        customerId: customer_id,
        orderAmount: total_amount,
      });
    } else if (!allowedPaymentMethods.has(payment_method)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method.",
      });
    }

    // Insert into hyperlocal_orders
    const { data, error } = await supabase
      .from("hyperlocal_orders")
      .insert([
        {
          customer_id,
          terminal_id,
          vendor_id,
          items: verifiedItems,
          total_amount,
          delivery_charge: deliveryChargeSnapshot,
          delivery_charge_original: deliveryChargeSnapshot,
          free_delivery_min_order: deliveryThresholdSnapshot,
          minimum_delivery_order_value: minimumDeliveryOrderSnapshot,
          estimated_delivery_window: estimatedDeliveryWindowSnapshot,
          delivery_provider_type: deliveryProviderSnapshot,
          customer_address,
          customer_phone,
          payment_method,
          payment_status: payment_method === "credit" ? "credit_due" : "unpaid",
          settlement_status: payment_method === "credit" ? "credit_pending" : "pending",
          price_quote_required: quoteRequired,
          price_quote_status: quoteRequired ? "pending_vendor_quote" : "not_required",
          requested_delivery_time,
          order_instructions,
          safe_order_instructions: safe_order_instructions || order_instructions,
          general_delivery_area,
          approx_distance_km,
          status: "pending",
        },
      ])
      .select()
      .single();

    if (error) throw error;

    if (payment_method === "credit") {
      await recordCreditPurchase({
        vendorId: vendor_id,
        customerId: customer_id,
        orderId: data.id,
        amount: total_amount,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Order placed successfully",
      order: data,
    });
  } catch (err) {
    console.error("PLACE ORDER ERROR:", err);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
      wallet: err.wallet,
    });
  }
});

export default router;


