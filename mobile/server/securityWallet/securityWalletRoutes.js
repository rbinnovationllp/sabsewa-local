import express from "express";
import {
  OPERATIONAL_MINIMUM_BALANCE,
  SECURITY_DEPOSIT_MINIMUM,
  ACTIVATION_USAGE_CHARGE,
  INITIAL_VENDOR_PAYMENT,
  STANDARD_WALLET_TOPUP,
  applyWalletCredit,
  calculateVendorExitPreview,
  createRazorpayOrder,
  getRazorpayPayment,
  recordTestPaymentAttempt,
  getOrCreateSecurityWallet,
  requestVendorClosure,
  verifyRazorpaySignature,
} from "./securityWalletService.js";
import { supabase } from "../connection.js";
import { getPaymentReadiness } from "../payments/paymentEnvironment.js";

const router = express.Router();

function escapeCsv(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function getTransactionEvidence({ vendorId, transactionId }) {
  const { data: transaction, error: txError } = await supabase
    .from("vendor_security_wallet_transactions")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("id", transactionId)
    .single();

  if (txError || !transaction) {
    const error = new Error("Wallet transaction not found.");
    error.statusCode = 404;
    throw error;
  }

  const [{ data: order }, { data: vendor }, { data: terminal }, { data: auditLogs }, { data: reversals }, { data: disputes }] =
    await Promise.all([
      transaction.order_id
        ? supabase.from("hyperlocal_orders").select("*").eq("id", transaction.order_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("vendors")
        .select("id, public_vendor_id, shop_name, owner_name, phone, city_code, locality_code")
        .eq("id", vendorId)
        .maybeSingle(),
      transaction.terminal_id
        ? supabase
            .from("vendor_terminals")
            .select("id, public_terminal_id, terminal_name, city, phone")
            .eq("id", transaction.terminal_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("order_audit_logs")
        .select("*")
        .eq("order_id", transaction.order_id || "00000000-0000-0000-0000-000000000000")
        .order("created_at", { ascending: true }),
      supabase
        .from("vendor_security_wallet_transactions")
        .select("*")
        .eq("reversal_of_transaction_id", transactionId)
        .order("created_at", { ascending: true }),
      supabase
        .from("wallet_transaction_disputes")
        .select("*")
        .eq("wallet_transaction_id", transactionId)
        .order("created_at", { ascending: false }),
    ]);

  return {
    transaction,
    vendor,
    terminal,
    order,
    audit_logs: auditLogs || [],
    reversals: reversals || [],
    disputes: disputes || [],
    evidence_summary: {
      transaction_id: transaction.id,
      related_order_id: transaction.order_id,
      vendor_id: transaction.vendor_id,
      public_vendor_id: transaction.public_vendor_id || vendor?.public_vendor_id || null,
      terminal_id: transaction.terminal_id || order?.terminal_id || null,
      public_terminal_id: transaction.public_terminal_id || terminal?.public_terminal_id || null,
      shop_name: vendor?.shop_name || null,
      terminal_name: terminal?.terminal_name || null,
      amount_deducted: Number(transaction.amount),
      balance_before: transaction.balance_before,
      balance_after: transaction.balance_after,
      deduction_time: transaction.created_at,
      accepted_fully_or_partially: order?.partial_fulfillment_status === "customer_accepted" ? "partial" : "full",
      vendor_acceptance_action: auditLogs?.find((log) => log.action === "vendor_accept_order_unlock_details") || null,
      customer_partial_confirmation: auditLogs?.find((log) => log.action === "customer_accept_partial_fulfillment") || null,
      idempotency_key: transaction.idempotency_key,
      payment_gateway_reference: transaction.razorpay_payment_id || transaction.payment_reference || null,
      reversal_count: reversals?.length || 0,
    },
  };
}

router.get("/admin/disputes", async (req, res) => {
  try {
    const { vendor_id, order_id, transaction_id, from, to } = req.query;

    let query = supabase
      .from("wallet_transaction_disputes")
      .select("*")
      .order("created_at", { ascending: false });

    if (vendor_id) query = query.eq("vendor_id", String(vendor_id));
    if (order_id) query = query.eq("order_id", String(order_id));
    if (transaction_id) query = query.eq("wallet_transaction_id", String(transaction_id));
    if (from) query = query.gte("created_at", String(from));
    if (to) query = query.lte("created_at", String(to));

    const { data, error } = await query.limit(200);
    if (error) throw error;

    return res.json({ success: true, disputes: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/admin/disputes/:dispute_id/reversal", async (req, res) => {
  try {
    const { admin_user_id, reason } = req.body;

    if (!admin_user_id || !reason?.trim()) {
      return res.status(400).json({ success: false, error: "Admin user and mandatory reason are required." });
    }

    const { data, error } = await supabase.rpc("approve_wallet_dispute_reversal", {
      p_dispute_id: req.params.dispute_id,
      p_admin_user_id: admin_user_id,
      p_review_reason: reason,
    });

    if (error) throw error;
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.post("/admin/disputes/:dispute_id/reject", async (req, res) => {
  try {
    const { admin_user_id, reason } = req.body;

    if (!admin_user_id || !reason?.trim()) {
      return res.status(400).json({ success: false, error: "Admin user and mandatory rejection reason are required." });
    }

    const { data, error } = await supabase
      .from("wallet_transaction_disputes")
      .update({
        status: "rejected",
        reviewed_by: admin_user_id,
        reviewed_at: new Date().toISOString(),
        review_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.params.dispute_id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, dispute: data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/admin/recovery/wallet-transactions", async (req, res) => {
  try {
    const {
      admin_user_id,
      reason,
      vendor_id,
      customer_id,
      statement_month,
      order_id,
      transaction_id,
      restore_to_active_view = false,
    } = req.body;

    if (!admin_user_id || !reason?.trim()) {
      return res.status(400).json({ success: false, error: "Admin user and mandatory recovery reason are required." });
    }

    let query = supabase
      .from("vendor_security_wallet_transactions")
      .select("*")
      .or("archived_at.not.is.null,soft_deleted_at.not.is.null")
      .gte("recoverable_until", new Date().toISOString().slice(0, 10));

    if (vendor_id) query = query.eq("vendor_id", vendor_id);
    if (statement_month) query = query.eq("statement_month", statement_month);
    if (order_id) query = query.eq("order_id", order_id);
    if (transaction_id) query = query.eq("id", transaction_id);

    const { data: records, error } = await query.order("created_at", { ascending: false }).limit(500);
    if (error) throw error;

    if (restore_to_active_view && records?.length) {
      const ids = records.map((record) => record.id);
      const { error: restoreError } = await supabase
        .from("vendor_security_wallet_transactions")
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
      target_table: "vendor_security_wallet_transactions",
      vendor_id: vendor_id || null,
      customer_id: customer_id || null,
      order_id: order_id || null,
      transaction_id: transaction_id || null,
      statement_month: statement_month || null,
      recovery_scope: restore_to_active_view ? "restore_to_active_view" : "read_only_lookup",
      reason,
      result_count: records?.length || 0,
      filters: { vendor_id, customer_id, statement_month, order_id, transaction_id },
      metadata: {
        vendor_notification_required: Boolean(vendor_id),
        retention_note: "Recovered records remain read-only unless a separate authorised correction is approved.",
      },
    });

    if (auditError) throw auditError;

    return res.json({
      success: true,
      records: records || [],
      read_only: !restore_to_active_view,
      recovered_to_active_view: Boolean(restore_to_active_view),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:vendor_id", async (req, res) => {
  try {
    const vendorId = req.params.vendor_id;
    const includeArchive = req.query.include_archive === "true";
    const statementMonth = req.query.statement_month;
    const orderId = req.query.order_id;
    const transactionId = req.query.transaction_id;
    const wallet = await getOrCreateSecurityWallet(vendorId);

    let transactionQuery = supabase
      .from("vendor_security_wallet_transactions")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });

    if (!includeArchive) transactionQuery = transactionQuery.is("archived_at", null);
    if (statementMonth) transactionQuery = transactionQuery.eq("statement_month", String(statementMonth));
    if (orderId) transactionQuery = transactionQuery.eq("order_id", String(orderId));
    if (transactionId) transactionQuery = transactionQuery.eq("id", String(transactionId));

    const { data: transactions } = await transactionQuery.limit(includeArchive ? 250 : 100);

    const { data: warnings } = await supabase
      .from("vendor_security_wallet_warnings")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
      .limit(20);

    return res.json({
      success: true,
      wallet,
      transactions: transactions || [],
      warnings: warnings || [],
      payment_environment: getPaymentReadiness(),
      thresholds: {
        initial_vendor_payment: INITIAL_VENDOR_PAYMENT,
        activation_service_charge: ACTIVATION_USAGE_CHARGE,
        standard_wallet_topup: STANDARD_WALLET_TOPUP,
        minimum_security_deposit: SECURITY_DEPOSIT_MINIMUM,
        operational_minimum_balance: OPERATIONAL_MINIMUM_BALANCE,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:vendor_id/statement.csv", async (req, res) => {
  try {
    const vendorId = req.params.vendor_id;
    await getOrCreateSecurityWallet(vendorId);

    const { data: transactions, error } = await supabase
      .from("vendor_security_wallet_transactions")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = [
      [
        "Date",
        "Type",
        "Amount",
        "Balance Before",
        "Balance After",
        "Order ID",
        "Payment Reference",
        "Razorpay Order ID",
        "Razorpay Payment ID",
        "Admin User ID",
        "Admin Reason",
        "Refundable",
        "Statement Month",
      ],
      ...(transactions || []).map((tx) => [
        tx.created_at,
        tx.transaction_type,
        tx.amount,
        tx.balance_before,
        tx.balance_after,
        tx.order_id,
        tx.payment_reference,
        tx.razorpay_order_id,
        tx.razorpay_payment_id,
        tx.admin_user_id,
        tx.admin_reason,
        tx.is_refundable,
        tx.statement_month,
      ]),
    ];

    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sabsewa-local-security-wallet-${vendorId}.csv"`
    );
    return res.send(csv);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:vendor_id/transactions/:transaction_id/evidence", async (req, res) => {
  try {
    const evidence = await getTransactionEvidence({
      vendorId: req.params.vendor_id,
      transactionId: req.params.transaction_id,
    });

    return res.json({ success: true, evidence });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.get("/:vendor_id/transactions/:transaction_id/evidence.csv", async (req, res) => {
  try {
    const evidence = await getTransactionEvidence({
      vendorId: req.params.vendor_id,
      transactionId: req.params.transaction_id,
    });

    const rows = [
      ["Field", "Value"],
      ...Object.entries(evidence.evidence_summary).map(([key, value]) => [
        key,
        typeof value === "object" ? JSON.stringify(value) : value,
      ]),
      ["order_summary", JSON.stringify(evidence.order?.items || [])],
      ["order_status_history", JSON.stringify(evidence.audit_logs || [])],
      ["reversals", JSON.stringify(evidence.reversals || [])],
      ["disputes", JSON.stringify(evidence.disputes || [])],
    ];

    const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sabsewa-local-wallet-evidence-${req.params.transaction_id}.csv"`
    );
    return res.send(csv);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.post("/:vendor_id/transactions/:transaction_id/dispute", async (req, res) => {
  try {
    const vendorId = req.params.vendor_id;
    const transactionId = req.params.transaction_id;
    const { complaint_text, raised_by_user_id, supporting_documents = [] } = req.body;

    if (!complaint_text?.trim()) {
      return res.status(400).json({ success: false, error: "Complaint details are required." });
    }

    const evidence = await getTransactionEvidence({ vendorId, transactionId });

    const { data, error } = await supabase
      .from("wallet_transaction_disputes")
      .insert({
        vendor_id: vendorId,
        wallet_transaction_id: transactionId,
        order_id: evidence.transaction.order_id,
        complaint_text,
        supporting_documents,
        raised_by_user_id,
        raised_by_role: "vendor",
        metadata: {
          transaction_amount: evidence.transaction.amount,
          idempotency_key: evidence.transaction.idempotency_key,
        },
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ success: true, dispute: data });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.post("/:vendor_id/topup-order", async (req, res) => {
  try {
    const vendorId = req.params.vendor_id;
    const purpose = req.body.purpose === "vendor_initial_activation"
      ? "vendor_initial_activation"
      : "vendor_wallet_topup";
    const amount = purpose === "vendor_initial_activation"
      ? INITIAL_VENDOR_PAYMENT
      : STANDARD_WALLET_TOPUP;

    const wallet = await getOrCreateSecurityWallet(vendorId);
    if (purpose === "vendor_initial_activation" && wallet.activation_fee_paid) {
      return res.status(409).json({ success: false, error: "Initial activation fee is already paid. Use Rs 5,000 standard top-up." });
    }
    if (purpose === "vendor_wallet_topup" && !wallet.activation_fee_paid) {
      return res.status(400).json({ success: false, error: "Initial Rs 5,500 activation payment is required before standard top-up." });
    }

    const razorpayOrder = await createRazorpayOrder({ vendorId, amount, purpose });
    const paymentReadiness = getPaymentReadiness();

    return res.json({
      success: true,
      razorpay_order: razorpayOrder,
      key_id: process.env.RAZORPAY_KEY_ID,
      payment_environment: paymentReadiness,
      purpose,
      amount,
      allocation: purpose === "vendor_initial_activation"
        ? {
            initial_payment: INITIAL_VENDOR_PAYMENT,
            activation_service_charge: ACTIVATION_USAGE_CHARGE,
            refundable_wallet_credit: SECURITY_DEPOSIT_MINIMUM,
          }
        : {
            topup_amount: STANDARD_WALLET_TOPUP,
            activation_service_charge: 0,
            refundable_wallet_credit: STANDARD_WALLET_TOPUP,
          },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.post("/:vendor_id/verify-topup", async (req, res) => {
  try {
    const vendorId = req.params.vendor_id;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!verifyRazorpaySignature({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    })) {
      return res.status(400).json({ success: false, error: "Invalid Razorpay signature." });
    }

    const payment = await getRazorpayPayment(razorpay_payment_id);
    const paymentReadiness = getPaymentReadiness();

    if (payment.order_id !== razorpay_order_id) {
      return res.status(400).json({ success: false, error: "Razorpay order mismatch." });
    }

    if (!["captured", "authorized"].includes(payment.status)) {
      return res.status(400).json({ success: false, error: `Razorpay payment is ${payment.status}.` });
    }

    const verifiedAmount = Number(payment.amount || 0) / 100;
    const purpose = payment.notes?.purpose || payment.notes?.payment_purpose || "vendor_wallet_topup";

    if (!paymentReadiness.live_payments_enabled) {
      await recordTestPaymentAttempt({
        vendorId,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        purpose,
        amount: verifiedAmount,
        payment,
        paymentReadiness,
      });

      return res.json({
        success: true,
        test_mode: true,
        wallet_credited: false,
        vendor_activated: false,
        payment_environment: paymentReadiness,
        message: paymentReadiness.payment_message,
        verified_amount: verifiedAmount,
        payment_method: payment.method,
      });
    }

    if (purpose === "vendor_initial_activation" && verifiedAmount !== INITIAL_VENDOR_PAYMENT) {
      return res.status(400).json({ success: false, error: "Initial activation payment must be Rs 5,500." });
    }

    if (purpose !== "vendor_initial_activation" && verifiedAmount !== STANDARD_WALLET_TOPUP) {
      return res.status(400).json({ success: false, error: "Standard wallet top-up must be Rs 5,000." });
    }

    return res.json({
      success: true,
      wallet_credited: false,
      vendor_activated: false,
      awaiting_webhook: true,
      payment_environment: paymentReadiness,
      message: "Payment response verified. Vendor wallet will update only after the secure Razorpay webhook is received and verified by the backend.",
      payment_method: payment.method,
      verified_amount: verifiedAmount,
      allocation: purpose === "vendor_initial_activation"
        ? {
            initial_payment: INITIAL_VENDOR_PAYMENT,
            activation_service_charge: ACTIVATION_USAGE_CHARGE,
            refundable_wallet_credit: SECURITY_DEPOSIT_MINIMUM,
          }
        : {
            topup_amount: STANDARD_WALLET_TOPUP,
            activation_service_charge: 0,
            refundable_wallet_credit: STANDARD_WALLET_TOPUP,
          },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/:vendor_id/admin-adjustment", async (req, res) => {
  try {
    const vendorId = req.params.vendor_id;
    const { amount, admin_user_id, reason } = req.body;

    if (!admin_user_id || !reason?.trim()) {
      return res.status(400).json({ success: false, error: "Admin user and reason are required." });
    }

    if (!Number(amount)) {
      return res.status(400).json({ success: false, error: "Adjustment amount is required." });
    }

    const wallet = await applyWalletCredit({
      vendorId,
      amount: Number(amount),
      transactionType: "manual_adjustment",
      paymentReference: `ADMIN_ADJUSTMENT_${Date.now()}`,
      adminUserId: admin_user_id,
      adminReason: reason,
      metadata: { source: "admin_adjustment" },
    });

    return res.json({ success: true, wallet });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:vendor_id/closure-preview", async (req, res) => {
  try {
    const vendorId = req.params.vendor_id;
    const preview = await calculateVendorExitPreview({ vendorId });
    return res.json({ success: true, preview });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.post("/:vendor_id/closure-request", async (req, res) => {
  try {
    const vendorId = req.params.vendor_id;
    const { requested_by, reason, vendor_acknowledged } = req.body;

    const result = await requestVendorClosure({
      vendorId,
      requestedBy: requested_by,
      reason,
      vendorAcknowledged: Boolean(vendor_acknowledged),
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

export default router;
