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

    await assertVendorCanReceiveOrders(vendor_id);

    const { data: terminal, error: terminalError } = await supabase
      .from("vendor_terminals")
      .select("id, vendor_id, status, is_open_today")
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

    const requestedItemIds = items.map((item) => item.item_id).filter(Boolean);
    const { data: availableItems, error: itemError } = await supabase
      .from("vendor_items")
      .select("id, item_name, price, price_display_mode, price_unit_label, is_available, available_today, stock_quantity, daily_stock_quantity, stock_status")
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

      if (!item || item.is_available !== true || item.available_today !== true || item.stock_status === "out_of_stock") {
        return res.status(409).json({
          success: false,
          message: `${requested.item_name || "Requested item"} is not available from this vendor today.`,
        });
      }

      if (effectiveStock != null && requestedQty > effectiveStock) {
        return res.status(409).json({
          success: false,
          message: `${item.item_name} has only ${effectiveStock} available today.`,
        });
      }

      const price = Number(item.price);
      const priceDisplayMode = item.price_display_mode || "show_price";
      const requiresQuote = priceDisplayMode === "hide_price" || priceDisplayMode === "market_price";
      verifiedItems.push({
        item_id: item.id,
        item_name: item.item_name,
        qty: requestedQty,
        price: requiresQuote ? null : price,
        displayed_price_at_order: requiresQuote ? null : price,
        price_display_mode: priceDisplayMode,
        price_unit_label: item.price_unit_label || null,
        price_quote_required: requiresQuote,
        price_label: requiresQuote
          ? priceDisplayMode === "market_price"
            ? "Market Price"
            : "Price on Request"
          : `Rs ${price.toFixed(2)}${item.price_unit_label ? `/${item.price_unit_label}` : ""}`,
        line_total: requiresQuote ? null : price * requestedQty,
      });
    }

    const quoteRequired = verifiedItems.some((item) => item.price_quote_required);
    const total_amount = verifiedItems.reduce((sum, item) => sum + Number(item.line_total || 0), 0);

    if (payment_method === "credit") {
      await assertCreditOrderAllowed({
        vendorId: vendor_id,
        customerId: customer_id,
        orderAmount: total_amount,
      });
    } else if (payment_method !== "prepaid") {
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
          customer_address,
          customer_phone,
          payment_method,
          payment_status: payment_method === "credit" ? "credit_due" : "unpaid",
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
