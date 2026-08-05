import express from "express";
import { supabase } from "../connection.js";
import {
  recordCreditPayment,
  suspendCredit,
  upsertCreditAccount,
} from "./vendorCreditService.js";

const router = express.Router();

router.get("/:vendor_id", async (req, res) => {
  try {
    const vendorId = req.params.vendor_id;
    const includeArchive = req.query.include_archive === "true";

    let accountQuery = supabase
      .from("vendor_credit_accounts")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("updated_at", { ascending: false });

    if (!includeArchive) accountQuery = accountQuery.is("archived_at", null);

    const { data: accounts, error: accountError } = await accountQuery;

    if (accountError) throw accountError;

    const { data: transactions, error: txError } = await supabase
      .from("vendor_credit_transactions")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (txError) throw txError;

    const { data: repaymentRequests, error: repaymentError } = await supabase
      .from("vendor_credit_repayment_requests")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("submitted_at", { ascending: false })
      .limit(100);

    if (repaymentError) throw repaymentError;

    return res.json({ success: true, accounts: accounts || [], transactions: transactions || [], repayment_requests: repaymentRequests || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/account", async (req, res) => {
  try {
    const account = await upsertCreditAccount({
      vendorId: req.params.vendor_id,
      customerId: req.body.customer_id,
      creditLimit: req.body.credit_limit,
      paymentDueDays: req.body.payment_due_days,
      status: req.body.status || "active",
      vendorUserId: req.body.vendor_user_id,
      notes: req.body.notes,
      customerName: req.body.customer_name,
      customerMobile: req.body.customer_mobile,
      customerAddress: req.body.customer_address,
      creditNotes: req.body.credit_notes,
    });

    return res.json({ success: true, account });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/payment", async (req, res) => {
  try {
    const account = await recordCreditPayment({
      vendorId: req.params.vendor_id,
      customerId: req.body.customer_id,
      amount: req.body.amount,
      vendorUserId: req.body.vendor_user_id,
      notes: req.body.notes,
      customerName: req.body.customer_name,
      customerMobile: req.body.customer_mobile,
      customerAddress: req.body.customer_address,
      creditNotes: req.body.credit_notes,
    });

    return res.json({ success: true, account });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/suspend", async (req, res) => {
  try {
    const account = await suspendCredit({
      vendorId: req.params.vendor_id,
      customerId: req.body.customer_id,
      vendorUserId: req.body.vendor_user_id,
      reason: req.body.reason,
    });

    return res.json({ success: true, account });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/:vendor_id/settle", async (req, res) => {
  try {
    const { customer_id, settlement_amount, acknowledgement } = req.body;

    if (!customer_id || !Number(settlement_amount)) {
      return res.status(400).json({ success: false, error: "Customer and settlement amount are required." });
    }

    const { data: account, error } = await supabase
      .from("vendor_credit_accounts")
      .update({
        outstanding_balance: 0,
        status: "settled",
        settlement_status: "settled",
        settled_at: new Date().toISOString(),
        settlement_amount: Number(settlement_amount),
        settlement_acknowledgement: acknowledgement || null,
        archived_at: new Date().toISOString(),
        archive_reason: "Credit account settled and moved to read-only archive; transaction history retained.",
        updated_at: new Date().toISOString(),
      })
      .eq("vendor_id", req.params.vendor_id)
      .eq("customer_id", customer_id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, account });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post("/admin/recovery/credit-accounts", async (req, res) => {
  try {
    const {
      admin_user_id,
      reason,
      vendor_id,
      customer_id,
      restore_to_active_view = false,
    } = req.body;

    if (!admin_user_id || !reason?.trim()) {
      return res.status(400).json({ success: false, error: "Admin user and mandatory recovery reason are required." });
    }

    let query = supabase
      .from("vendor_credit_accounts")
      .select("*")
      .or("archived_at.not.is.null,soft_deleted_at.not.is.null");

    if (vendor_id) query = query.eq("vendor_id", vendor_id);
    if (customer_id) query = query.eq("customer_id", customer_id);

    const { data: records, error } = await query.order("updated_at", { ascending: false }).limit(500);
    if (error) throw error;

    if (restore_to_active_view && records?.length) {
      const ids = records.map((record) => record.id);
      const { error: restoreError } = await supabase
        .from("vendor_credit_accounts")
        .update({
          archived_at: null,
          recovered_at: new Date().toISOString(),
          recovered_by: admin_user_id,
          recovery_reason: reason,
        })
        .in("id", ids);

      if (restoreError) throw restoreError;
    }

    const { error: auditError } = await supabase.from("company_data_recovery_audit").insert({
      admin_user_id,
      target_table: "vendor_credit_accounts",
      vendor_id: vendor_id || null,
      customer_id: customer_id || null,
      recovery_scope: restore_to_active_view ? "restore_to_active_view" : "read_only_lookup",
      reason,
      result_count: records?.length || 0,
      filters: { vendor_id, customer_id },
      metadata: {
        vendor_notification_required: Boolean(vendor_id),
        retention_note: "Credit history remains read-only unless a separate authorised correction is approved.",
      },
    });

    if (auditError) throw auditError;

    return res.json({
      success: true,
      records: records || [],
      read_only: !restore_to_active_view,
      recovered_to_active_view: Boolean(restore_to_active_view),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;


