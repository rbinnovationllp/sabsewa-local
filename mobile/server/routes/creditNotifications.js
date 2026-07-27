import express from "express";
import { createClient } from "@supabase/supabase-js";
import { sendCreditIssueSms } from "../services/msg91Client.js";

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// POST /api/credit/sms-on-issue
router.post("/sms-on-issue", async (req, res) => {
  try {
    const { customer_id, vendor_id, terminal_shop_name, phone } = req.body;

    // Get latest ledger entry for this relation
    const { data: ledgerRows, error: ledgerErr } = await supabase
      .from("vendor_ledger")
      .select("*")
      .eq("customer_id", customer_id)
      .eq("vendor_id", vendor_id)
      .eq("terminal_shop_name", terminal_shop_name)
      .order("created_at", { ascending: false })
      .limit(1);

    if (ledgerErr) return res.status(500).json({ error: ledgerErr.message });
    if (!ledgerRows || ledgerRows.length === 0) {
      return res.status(400).json({ error: "No ledger found" });
    }

    const last = ledgerRows[0];

    // only send SMS if this is a credit_issue
    if (last.txn_type !== "credit_issue") {
      return res.json({ success: true, skipped: true });
    }

    // compute due date from terms
    const { data: terms } = await supabase
      .from("vendor_credit_terms")
      .select("payment_due_days")
      .eq("vendor_id", vendor_id)
      .eq("customer_id", customer_id)
      .eq("terminal_shop_name", terminal_shop_name)
      .single();

    const payment_due_days = terms?.payment_due_days || 7;
    const dueDate = new Date(Date.now() + payment_due_days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10); // YYYY-MM-DD

    const { provider_msg_id, message } = await sendCreditIssueSms({
      phone,
      shopName: terminal_shop_name,
      amount: last.amount,
      dueDate
    });

    // log SMS
    await supabase.from("sms_notifications_log").insert({
      customer_id,
      vendor_id,
      terminal_shop_name,
      type: "credit_issue",
      phone,
      message,
      provider_msg_id,
      status: "sent"
    });

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal error" });
  }
});

export default router;
