import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

// GET /api/order/history/:customer_id
router.get("/history/:customer_id", async (req, res) => {
  try {
    const { customer_id } = req.params;

    const { data, error } = await supabase
      .from("hyperlocal_orders")
      .select("*")
      .eq("customer_id", customer_id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ success: true, orders: data });
  } catch (err) {
    console.error("ORDER HISTORY ERROR:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
