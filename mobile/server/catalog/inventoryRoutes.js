import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

/**
 * Vendor adds item from global catalog to their inventory
 */
router.post("/add", async (req, res) => {
  try {
    const { vendor_id, terminal_id, catalog_id, price, stock } = req.body;

    const { data: catalog, error: catalogError } = await supabase
      .from("global_catalog")
      .select("*")
      .eq("id", catalog_id)
      .single();

    if (catalogError || !catalog)
      return res.status(400).json({ error: "Invalid catalog_id" });

    const { error } = await supabase
      .from("vendor_inventory")
      .insert({
        vendor_id,
        terminal_id,
        catalog_id,
        item_name: catalog.item_name,
        item_photo: catalog.photo_url,
        unit: catalog.default_unit,
        approx_allowed: catalog.approx_allowed,
        price,
        stock_available: stock,
        auto_carry_forward: true
      });

    if (error) return res.status(500).json({ error: error.message });

    return res.json({
      success: true,
      message: "Item added to vendor inventory"
    });

  } catch (err) {
    console.error("Inventory Add Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Customer fetches items available in vendor inventory
 */
router.get("/:terminal_id", async (req, res) => {
  try {
    const terminal_id = req.params.terminal_id;

    const { data, error } = await supabase
      .from("vendor_inventory")
      .select("*")
      .eq("terminal_id", terminal_id)
      .order("item_name");

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ items: data });

  } catch (err) {
    console.error("Inventory Fetch Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
