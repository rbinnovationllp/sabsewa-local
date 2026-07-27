import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

/* -------------------------------
   1. Add Delivery Boy
--------------------------------*/
router.post("/add", async (req, res) => {
  try {
    const { vendor_id, terminal_id, name, phone } = req.body;

    const { error } = await supabase.from("delivery_boys").insert({
      vendor_id,
      terminal_id,
      name,
      phone
    });

    if (error) throw error;

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
});

/* -------------------------------
   2. Assign Delivery Boy to Order
--------------------------------*/
router.post("/assign", async (req, res) => {
  try {
    const { order_id, vendor_id, terminal_id, delivery_boy_id } = req.body;

    const { error } = await supabase.from("delivery_assignments").insert({
      order_id,
      vendor_id,
      terminal_id,
      delivery_boy_id
    });

    if (error) throw error;

    // mark rider busy
    await supabase
      .from("delivery_boys")
      .update({ status: "busy" })
      .eq("id", delivery_boy_id);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/* -------------------------------
   3. Update delivery status
--------------------------------*/
router.post("/status", async (req, res) => {
  try {
    const { assignment_id, status } = req.body;

    const fields = {};
    if (status === "picked_up") fields.picked_at = new Date();
    if (status === "delivered") fields.delivered_at = new Date();

    await supabase
      .from("delivery_assignments")
      .update({ status, ...fields })
      .eq("id", assignment_id);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
