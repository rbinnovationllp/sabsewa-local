import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

router.get("/pending", async (req, res) => {
  try {
    const vendor_id = req.query.vendor_id;
    const terminal_id = req.query.terminal_id;

    if (!vendor_id) {
      return res.status(400).json({ success: false, error: "vendor_id is required" });
    }

    let query = supabase
      .from("hyperlocal_orders")
      .select("*")
      .eq("vendor_id", vendor_id)
      .in("status", ["accepted", "packed"]);

    if (terminal_id) query = query.eq("terminal_id", terminal_id);

    const { data, error } = await query;

    if (error) throw error;

    return res.json({ success: true, orders: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
