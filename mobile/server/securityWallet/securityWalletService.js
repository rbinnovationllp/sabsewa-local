import crypto from "crypto";
import axios from "axios";
import { supabase } from "../connection.js";

export const SECURITY_DEPOSIT_MINIMUM = 5000;
export const ORDER_FEE = 15;
export const REMINDER_THRESHOLD = 1000;
export const FINAL_WARNING_THRESHOLD = 500;
export const STOP_ORDERS_THRESHOLD = 515;
export const OPERATIONAL_MINIMUM_BALANCE = 515;
export const ACTIVATION_USAGE_CHARGE = 500;

const CLOSED_STATUSES = new Set(["closure_requested", "refund_processing", "closed", "suspended"]);

export async function getOrCreateSecurityWallet(vendorId) {
  const { data: existing, error: existingError } = await supabase
    .from("vendor_security_wallets")
    .select("*")
    .eq("vendor_id", vendorId)
    .single();

  if (existing && !existingError) return existing;

  const { data, error } = await supabase
    .from("vendor_security_wallets")
    .insert({
      vendor_id: vendorId,
      opening_balance: 0,
      current_balance: 0,
      minimum_security_deposit: SECURITY_DEPOSIT_MINIMUM,
      reminder_threshold: REMINDER_THRESHOLD,
      final_warning_threshold: FINAL_WARNING_THRESHOLD,
      stop_orders_threshold: STOP_ORDERS_THRESHOLD,
      operational_minimum_balance: OPERATIONAL_MINIMUM_BALANCE,
      eligibility_status: "security_deposit_required",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export function deriveEligibility(balance, openingBalance) {
  if (openingBalance < SECURITY_DEPOSIT_MINIMUM) return "security_deposit_required";
  if (balance < STOP_ORDERS_THRESHOLD) return "orders_stopped";
  if (balance < FINAL_WARNING_THRESHOLD) return "final_warning";
  if (balance <= REMINDER_THRESHOLD) return "low_balance";
  return "eligible";
}

export function warningLevelForStatus(status) {
  if (status === "orders_stopped") return "orders_stopped";
  if (status === "final_warning") return "final_warning";
  if (status === "low_balance") return "top_up_reminder";
  return "none";
}

export async function updateWalletStatus(wallet) {
  if (CLOSED_STATUSES.has(wallet.eligibility_status)) return wallet;

  const nextStatus = deriveEligibility(
    Number(wallet.current_balance),
    Number(wallet.opening_balance)
  );

  if (nextStatus === wallet.eligibility_status) return wallet;

  const { data, error } = await supabase
    .from("vendor_security_wallets")
    .update({
      eligibility_status: nextStatus,
      updated_at: new Date().toISOString(),
      last_warning_sent_at: nextStatus === "eligible" ? wallet.last_warning_sent_at : new Date().toISOString(),
    })
    .eq("id", wallet.id)
    .select()
    .single();

  if (error) throw error;

  await createWalletWarning(data, nextStatus);
  return data;
}

export async function createWalletWarning(wallet, status) {
  const warningLevel =
    status === "eligible" ? "restored" : warningLevelForStatus(status);

  if (warningLevel === "none") return;

  const messageMap = {
    top_up_reminder: "Your SabSewa Local vendor advance balance is Rs 1,000 or below. Please top up soon.",
    final_warning: "Final warning: your SabSewa Local vendor advance balance is below Rs 500.",
    orders_stopped: "New SabSewa Local orders are stopped because your vendor advance balance is below Rs 515. This preserves Rs 500 activation/usage fee plus one Rs 15 order-acceptance platform fee.",
    restored: "Your SabSewa Local order eligibility has been restored.",
  };

  await supabase.from("vendor_security_wallet_warnings").insert({
    vendor_id: wallet.vendor_id,
    wallet_id: wallet.id,
    warning_level: warningLevel,
    balance: wallet.current_balance,
    message: messageMap[warningLevel],
    channel: "in_app",
  });
}

export async function assertVendorCanReceiveOrders(vendorId) {
  const wallet = await updateWalletStatus(await getOrCreateSecurityWallet(vendorId));

  if (wallet.eligibility_status === "eligible" || wallet.eligibility_status === "low_balance" || wallet.eligibility_status === "final_warning") {
    return wallet;
  }

  const message =
    wallet.eligibility_status === "security_deposit_required"
      ? "Vendor must deposit the minimum Rs 5,000 SabSewa Local advance balance before receiving orders."
      : wallet.eligibility_status === "closure_requested" || wallet.eligibility_status === "refund_processing" || wallet.eligibility_status === "closed"
        ? "Vendor closure/refund is in progress. New orders are stopped."
        : "Vendor is not eligible to receive new orders because the vendor advance balance is below Rs 515. Existing accepted orders may still be completed and charged.";

  const error = new Error(message);
  error.statusCode = 403;
  error.wallet = wallet;
  throw error;
}

export async function deductConfirmedOrderFee({ vendorId, orderId }) {
  const wallet = await getOrCreateSecurityWallet(vendorId);
  const { data: existingTx, error: existingTxError } = await supabase
    .from("vendor_security_wallet_transactions")
    .select("id")
    .eq("vendor_id", vendorId)
    .eq("order_id", orderId)
    .eq("transaction_type", "order_fee")
    .maybeSingle();

  if (existingTxError) throw existingTxError;
  if (existingTx) return wallet;

  const balanceBefore = Number(wallet.current_balance);

  if (balanceBefore < ORDER_FEE) {
    await updateWalletStatus(wallet);
    const error = new Error("Vendor advance balance does not have enough balance for the platform fee.");
    error.statusCode = 403;
    throw error;
  }

  const balanceAfter = balanceBefore - ORDER_FEE;
  const nextStatus = deriveEligibility(balanceAfter, Number(wallet.opening_balance));

  const { data: updatedWallet, error: walletError } = await supabase
    .from("vendor_security_wallets")
    .update({
      current_balance: balanceAfter,
      eligibility_status: nextStatus,
      updated_at: new Date().toISOString(),
      last_warning_sent_at: nextStatus === "eligible" ? wallet.last_warning_sent_at : new Date().toISOString(),
    })
    .eq("id", wallet.id)
    .select()
    .single();

  if (walletError) throw walletError;

  const warningLevel = warningLevelForStatus(nextStatus);

  const { error: txError } = await supabase
    .from("vendor_security_wallet_transactions")
    .insert({
      wallet_id: wallet.id,
      vendor_id: vendorId,
      order_id: orderId,
      transaction_type: "order_fee",
      amount: -ORDER_FEE,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      payment_reference: `PLATFORM_FACILITATION_CHARGE_${orderId}`,
      warning_level: warningLevel,
      metadata: {
        platform_facilitation_charge: ORDER_FEE,
        charge_description: "Rs 15 platform facilitation fee recorded when the vendor accepts a real-world SabSewa Local order",
      },
    });

  if (txError) throw txError;

  if (warningLevel !== "none") await createWalletWarning(updatedWallet, nextStatus);

  return updatedWallet;
}

export async function createRazorpayOrder({ vendorId, amount }) {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    const error = new Error("Razorpay keys are not configured.");
    error.statusCode = 500;
    throw error;
  }

  const receipt = `secwallet_${vendorId}_${Date.now()}`.slice(0, 40);
  const auth = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
  ).toString("base64");

  const { data } = await axios.post(
    "https://api.razorpay.com/v1/orders",
    {
      amount: Math.round(Number(amount) * 100),
      currency: "INR",
      receipt,
      notes: {
        product: "SabSewa Local vendor advance balance top-up",
        payment_purpose: "vendor_advance_balance_top_up",
        real_world_services: "true",
        vendor_id: vendorId,
      },
    },
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    }
  );

  return data;
}

export async function getRazorpayPayment(razorpayPaymentId) {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    const error = new Error("Razorpay keys are not configured.");
    error.statusCode = 500;
    throw error;
  }

  const auth = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
  ).toString("base64");

  const { data } = await axios.get(
    `https://api.razorpay.com/v1/payments/${razorpayPaymentId}`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
    }
  );

  return data;
}

export function verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  return expected === razorpaySignature;
}

export async function applyWalletCredit({
  vendorId,
  amount,
  transactionType,
  paymentReference,
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  adminUserId,
  adminReason,
  metadata = {},
}) {
  const wallet = await getOrCreateSecurityWallet(vendorId);
  const balanceBefore = Number(wallet.current_balance);
  const creditAmount = Number(amount);
  const balanceAfter = balanceBefore + creditAmount;
  const openingBalance = Number(wallet.opening_balance) || creditAmount;
  const nextOpeningBalance = Number(wallet.opening_balance) > 0 ? Number(wallet.opening_balance) : creditAmount;
  const nextStatus = deriveEligibility(balanceAfter, openingBalance);

  const { data: updatedWallet, error: walletError } = await supabase
    .from("vendor_security_wallets")
    .update({
      opening_balance: nextOpeningBalance,
      current_balance: balanceAfter,
      eligibility_status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", wallet.id)
    .select()
    .single();

  if (walletError) throw walletError;

  const { error: txError } = await supabase
    .from("vendor_security_wallet_transactions")
    .insert({
      wallet_id: wallet.id,
      vendor_id: vendorId,
      transaction_type: transactionType,
      amount: creditAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      payment_reference: paymentReference,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
      admin_user_id: adminUserId,
      admin_reason: adminReason,
      warning_level: warningLevelForStatus(nextStatus),
      metadata,
    });

  if (txError) throw txError;

  if (nextStatus === "eligible" && wallet.eligibility_status !== "eligible") {
    await createWalletWarning(updatedWallet, "eligible");
  }

  return updatedWallet;
}

export async function calculateVendorExitPreview({ vendorId, legalAdjustments = 0 }) {
  const wallet = await getOrCreateSecurityWallet(vendorId);
  const balance = Number(wallet.current_balance || 0);
  const activationCharge = Number(wallet.opening_balance || 0) >= SECURITY_DEPOSIT_MINIMUM
    ? ACTIVATION_USAGE_CHARGE
    : 0;

  const { data: completedOrders, error: completedError } = await supabase
    .from("hyperlocal_orders")
    .select("id")
    .eq("vendor_id", vendorId)
    .eq("status", "completed");

  if (completedError) throw completedError;

  const completedOrderIds = (completedOrders || []).map((order) => order.id);
  let chargedOrderIds = [];

  if (completedOrderIds.length > 0) {
    const { data: chargedRows, error: chargedError } = await supabase
      .from("vendor_security_wallet_transactions")
      .select("order_id")
      .eq("vendor_id", vendorId)
      .eq("transaction_type", "order_fee")
      .in("order_id", completedOrderIds);

    if (chargedError) throw chargedError;
    chargedOrderIds = (chargedRows || []).map((row) => row.order_id);
  }

  const chargedSet = new Set(chargedOrderIds);
  const unpaidCompletedOrderIds = completedOrderIds.filter((id) => !chargedSet.has(id));
  const unpaidOrderFees = unpaidCompletedOrderIds.length * ORDER_FEE;
  const legalAdjustmentAmount = Math.max(0, Number(legalAdjustments || 0));
  const totalDeductions = activationCharge + unpaidOrderFees + legalAdjustmentAmount;
  const estimatedRefund = Math.max(0, balance - totalDeductions);

  return {
    wallet,
    balance_at_request: balance,
    activation_usage_charge: activationCharge,
    unpaid_order_fees: unpaidOrderFees,
    legal_adjustments: legalAdjustmentAmount,
    estimated_refund: estimatedRefund,
    calculation: {
      minimum_advance_balance: SECURITY_DEPOSIT_MINIMUM,
      activation_usage_charge: ACTIVATION_USAGE_CHARGE,
      operational_stop_threshold: STOP_ORDERS_THRESHOLD,
      completed_order_count: completedOrderIds.length,
      charged_order_count: chargedOrderIds.length,
      unpaid_completed_order_ids: unpaidCompletedOrderIds,
      order_fee: ORDER_FEE,
      note: "Customer order payments are direct between customer and vendor. This refund preview applies only to the vendor advance balance held for SabSewa Local platform fees.",
    },
  };
}

export async function requestVendorClosure({
  vendorId,
  requestedBy,
  reason,
  vendorAcknowledged,
  legalAdjustments = 0,
}) {
  if (!vendorAcknowledged) {
    const error = new Error("Vendor must acknowledge the refund calculation before closure request submission.");
    error.statusCode = 400;
    throw error;
  }

  const preview = await calculateVendorExitPreview({ vendorId, legalAdjustments });

  if (preview.wallet.eligibility_status === "suspended") {
    const error = new Error("Suspended or disqualified vendors must follow the investigation and dispute-resolution process before refund closure.");
    error.statusCode = 409;
    throw error;
  }

  const now = new Date().toISOString();
  const responseDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: exitRequest, error: requestError } = await supabase
    .from("vendor_exit_requests")
    .insert({
      vendor_id: vendorId,
      wallet_id: preview.wallet.id,
      requested_by: requestedBy,
      request_reason: reason,
      status: "closure_requested",
      balance_at_request: preview.balance_at_request,
      activation_usage_charge: preview.activation_usage_charge,
      unpaid_order_fees: preview.unpaid_order_fees,
      legal_adjustments: preview.legal_adjustments,
      estimated_refund: preview.estimated_refund,
      calculation: preview.calculation,
      vendor_acknowledged: true,
      vendor_acknowledged_at: now,
      notice_sent_at: now,
      response_deadline_at: responseDeadline,
    })
    .select()
    .single();

  if (requestError) throw requestError;

  const { data: updatedWallet, error: walletError } = await supabase
    .from("vendor_security_wallets")
    .update({
      eligibility_status: "closure_requested",
      updated_at: now,
    })
    .eq("id", preview.wallet.id)
    .select()
    .single();

  if (walletError) throw walletError;

  return {
    exit_request: exitRequest,
    wallet: updatedWallet,
    preview: {
      ...preview,
      wallet: updatedWallet,
    },
  };
}
