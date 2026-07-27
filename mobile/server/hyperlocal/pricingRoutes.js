import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

router.post("/bulk-update", async (req, res) => {
  try {
    const { vendor_id, terminal_id, updates, actor_user_id } = req.body;

    if (!vendor_id || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: "vendor_id and updates are required.",
      });
    }

    const results = [];
    for (const update of updates) {
      const updateData = {
        price: Number(update.price),
        price_display_mode: update.price_display_mode || "show_price",
        price_unit_label: update.price_unit_label || null,
        previous_price: update.previous_price == null ? null : Number(update.previous_price),
        discount_label: update.discount_label || null,
        price_updated_at: new Date().toISOString(),
        price_updated_by: actor_user_id || null,
      };

      if (!Number.isFinite(updateData.price) || updateData.price < 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid price for item ${update.item_id}.`,
        });
      }

      let query = supabase
        .from("vendor_items")
        .update(updateData)
        .eq("id", update.item_id)
        .eq("vendor_id", vendor_id);

      if (terminal_id) query = query.eq("terminal_id", terminal_id);

      const { data, error } = await query.select().single();
      if (error) throw error;
      results.push(data);
    }

    return res.json({
      success: true,
      updated_count: results.length,
      items: results,
      note: "Price changes apply only to new orders. Existing order item snapshots are not modified.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
