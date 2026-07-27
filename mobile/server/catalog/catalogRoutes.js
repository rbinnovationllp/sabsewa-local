import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

/**
 * GET: List all master catalog items
 */
router.get("/list", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("global_catalog")
      .select("*")
      .eq("is_active", true)
      .order("item_name");

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ items: data });

  } catch (err) {
    console.error("Catalog List Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
