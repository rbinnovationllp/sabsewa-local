import express from "express";
import { customerGotCredit } from "./creditSMSHooks.js";
import { recordSettlementEntry } from "./vendorSettlement.insert.js";
import { supabase } from "../connection.js";

const router = express.Router();

/**
 * Customer confirms receiving goods → Vendor gets money
 */
router.post("/settle", async (req, res) => {
  try {
    const {
      phone,
      shopName,
      amount,
      dueDate,
      vendor_id,
      customer_id,
      billRef
    } = req.body;

    // ============================== //
    // STEP 1: CHECK CREDIT LIMIT     //
    // ============================== //

    // Fetch vendor assigned credit limit
    const { data: vendorCfg, error: vendorErr } = await supabase
      .from("vendor_terminals")
      .select("credit_limit")
      .eq("id", vendor_id)
      .single();

    if (vendorErr) {
      return res.status(500).json({
        success: false,
        message: "Vendor configuration fetch error"
      });
    }

    // Fetch total outstanding balance of this customer for this vendor
    const { data: oldLedger } = await supabase
      .from("vendor_wallet_ledger")
      .select("balance")
      .eq("vendor_id", vendor_id)
      .eq("customer_id", customer_id);

    const existingDue =
      oldLedger?.reduce((sum, x) => sum + Number(x.balance), 0) || 0;

    const newDue = existingDue + (Number(amount) - Number(amount));

    // Since customer is "paying amount fully",
    // actual used logic will apply when deduction wallet is partial
    const creditRequirement = newDue;

    // Validate against vendor credit limit
    if (vendorCfg.credit_limit > 0 && creditRequirement > vendorCfg.credit_limit) {
      return res.status(400).json({
        success: false,
        message:
          "Credit limit exceeded. Please settle previous dues before buying again."
      });
    }

    // ============================== //
    // STEP 2: INSERT LEDGER ENTRY    //
    // ============================== //

    const ledgerSaved = await recordSettlementEntry({
      customer_id,
      vendor_id,
      shopName,
      amount,
      paid: amount,
      billRef
    });

    if (!ledgerSaved) {
      return res.status(500).json({
        success: false,
        message: "Ledger entry could not be recorded."
      });
    }

    // ============================== //
    // STEP 3: SEND SMS NOTIFICATION  //
    // ============================== //

    await customerGotCredit({
      phone,
      shopName,
      amount,
      dueDate
    });

    return res.status(200).json({
      success: true,
      message: "Settlement recorded and SMS sent."
    });

  } catch (err) {
    console.error("Error in settlement:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
