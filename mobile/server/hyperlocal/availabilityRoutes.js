import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

const ORDERABLE_STATUSES = new Set(["available", "limited_stock", "available_on_request"]);
const STATUS_TO_STOCK = {
  available: "in_stock",
  limited_stock: "low_stock",
  available_on_request: "low_stock",
  temporarily_unavailable: "out_of_stock",
  out_of_stock: "out_of_stock",
};

function normalizeStatus(status) {
  if (!status) return "available";
  const normalized = String(status).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(STATUS_TO_STOCK, normalized)) return null;
  return normalized;
}

router.get("/items", async (req, res) => {
  try {
    const { vendor_id, terminal_id, search } = req.query;
    if (!vendor_id) return res.status(400).json({ success: false, error: "vendor_id is required." });

    let query = supabase
      .from("vendor_items")
      .select("id, vendor_id, terminal_id, item_name, category, generic_product_name, brand_name, variant_name, pack_size, pack_unit, price, price_display_mode, price_unit_label, is_available, available_today, stock_status, daily_availability_status, daily_stock_quantity, stock_quantity, daily_availability_reason, expected_restock_at, availability_review_policy, availability_reviewed_at")
      .eq("vendor_id", vendor_id)
      .order("item_name");

    if (terminal_id) query = query.eq("terminal_id", terminal_id);

    const { data, error } = await query;
    if (error) throw error;

    const term = String(search || "").trim().toLowerCase();
    const items = term
      ? (data || []).filter((item) =>
          [item.item_name, item.generic_product_name, item.brand_name, item.variant_name, item.category]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(term)
        )
      : data || [];

    return res.json({ success: true, items });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/bulk-update", async (req, res) => {
  try {
    const { vendor_id, terminal_id, updates, actor_user_id, device_id } = req.body;
    if (!vendor_id || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, error: "vendor_id and updates are required." });
    }

    const changedItems = [];
    for (const update of updates) {
      const status = normalizeStatus(update.status);
      if (!status) {
        return res.status(400).json({ success: false, error: `Invalid availability status for item ${update.item_id}.` });
      }

      let existingQuery = supabase
        .from("vendor_items")
        .select("id, vendor_id, terminal_id, daily_availability_status, available_today, daily_stock_quantity, stock_quantity, price")
        .eq("id", update.item_id)
        .eq("vendor_id", vendor_id);
      if (terminal_id) existingQuery = existingQuery.eq("terminal_id", terminal_id);

      const { data: existing, error: existingError } = await existingQuery.single();
      if (existingError || !existing) {
        return res.status(404).json({ success: false, error: `Item ${update.item_id} was not found for this vendor.` });
      }

      const quantity = update.quantity === "" || update.quantity == null ? null : Number(update.quantity);
      if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) {
        return res.status(400).json({ success: false, error: `Invalid quantity for item ${update.item_id}.` });
      }

      const updateData = {
        daily_availability_status: status,
        stock_status: STATUS_TO_STOCK[status],
        available_today: ORDERABLE_STATUSES.has(status),
        is_available: status !== "out_of_stock" && status !== "temporarily_unavailable",
        daily_availability_reason: update.reason || null,
        expected_restock_at: update.expected_restock_at || null,
        availability_review_policy: update.availability_review_policy || "keep_last_confirmed",
        availability_reviewed_at: new Date().toISOString(),
        availability_reviewed_by: actor_user_id || null,
        daily_availability_updated_at: new Date().toISOString(),
      };

      if (quantity != null) updateData.daily_stock_quantity = quantity;
      if (update.price !== "" && update.price != null) {
        const price = Number(update.price);
        if (!Number.isFinite(price) || price < 0) {
          return res.status(400).json({ success: false, error: `Invalid price for item ${update.item_id}.` });
        }
        updateData.price = price;
        updateData.price_updated_at = new Date().toISOString();
        updateData.price_updated_by = actor_user_id || null;
      }

      const { data: saved, error: saveError } = await supabase
        .from("vendor_items")
        .update(updateData)
        .eq("id", update.item_id)
        .eq("vendor_id", vendor_id)
        .select()
        .single();
      if (saveError) throw saveError;

      const { error: auditError } = await supabase.from("vendor_item_availability_audit").insert({
        vendor_id,
        terminal_id: existing.terminal_id,
        vendor_item_id: existing.id,
        previous_status: existing.daily_availability_status || existing.stock_status,
        new_status: status,
        previous_available_today: existing.available_today !== false,
        new_available_today: ORDERABLE_STATUSES.has(status),
        previous_quantity: existing.daily_stock_quantity ?? existing.stock_quantity ?? null,
        new_quantity: quantity,
        reason: update.reason || null,
        effective_at: new Date().toISOString(),
        expected_restock_at: update.expected_restock_at || null,
        changed_by: actor_user_id || null,
        device_id: device_id || null,
      });
      if (auditError) throw auditError;

      changedItems.push(saved);
    }

    return res.json({ success: true, updated_count: changedItems.length, items: changedItems });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
