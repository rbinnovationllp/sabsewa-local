import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const { vendor_id, terminal_id } = req.query;

  if (!vendor_id || !terminal_id) {
    return res.status(400).json({
      success: false,
      message: "vendor_id and terminal_id are required",
    });
  }

  const { data, error } = await supabase
    .from("delivery_boys")
    .select("*")
    .eq("vendor_id", vendor_id)
    .eq("terminal_id", terminal_id);

  if (error) {
    return res.status(500).json({ success: false, message: error.message });
  }

  res.json({ success: true, riders: data });
});

export default router;
