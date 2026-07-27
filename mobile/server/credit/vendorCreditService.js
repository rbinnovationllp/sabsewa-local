import { supabase } from "../connection.js";

const NEAR_LIMIT_RATIO = 0.8;

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function isOverdue(account) {
  return Number(account.outstanding_balance || 0) > 0 &&
    account.due_date &&
    account.due_date < todayDate();
}

export async function getCreditAccount(vendorId, customerId) {
  const { data, error } = await supabase
    .from("vendor_credit_accounts")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("customer_id", customerId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function upsertCreditAccount({
  vendorId,
  customerId,
  creditLimit,
  paymentDueDays = 7,
  status = "active",
  vendorUserId,
  notes,
}) {
  const existing = await getCreditAccount(vendorId, customerId);
  const nextLimit = Number(creditLimit);

  if (!Number.isFinite(nextLimit) || nextLimit < 0) {
    const error = new Error("Credit limit must be zero or more.");
    error.statusCode = 400;
    throw error;
  }

  const payload = {
    vendor_id: vendorId,
    customer_id: customerId,
    credit_limit: nextLimit,
    payment_due_days: Number(paymentDueDays || 7),
    status,
    vendor_notes: notes || null,
    approved_by_vendor_user_id: vendorUserId || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("vendor_credit_accounts")
    .upsert(payload, { onConflict: "vendor_id,customer_id" })
    .select()
    .single();

  if (error) throw error;

  await writeCreditTransaction({
    account: data,
    transactionType: existing ? "limit_changed" : "limit_approved",
    amount: 0,
    balanceBefore: Number(existing?.outstanding_balance || 0),
    balanceAfter: Number(data.outstanding_balance || 0),
    vendorUserId,
    notes: notes || `Vendor ${existing ? "changed" : "approved"} credit limit to Rs ${nextLimit}.`,
    metadata: {
      credit_limit: nextLimit,
      payment_due_days: payload.payment_due_days,
      vendor_owned_credit: true,
      platform_not_financier_or_guarantor: true,
    },
  });

  return data;
}

export async function assertCreditOrderAllowed({ vendorId, customerId, orderAmount }) {
  const account = await getCreditAccount(vendorId, customerId);

  if (!account) {
    const error = new Error("Credit is not approved by this vendor for this customer. Please choose prepaid payment.");
    error.statusCode = 403;
    throw error;
  }

  if (account.status === "suspended" || account.status === "closed") {
    const error = new Error("Credit is suspended by this vendor. Please choose prepaid payment.");
    error.statusCode = 403;
    error.credit_account = account;
    throw error;
  }

  if (isOverdue(account)) {
    await markCreditStatus(account, "overdue", "Credit is overdue.");
    await queueCreditReminder(account, "overdue");
    const error = new Error("Credit payment is overdue with this vendor. Please clear dues or choose prepaid payment.");
    error.statusCode = 403;
    error.credit_account = { ...account, status: "overdue" };
    throw error;
  }

  const balance = Number(account.outstanding_balance || 0);
  const limit = Number(account.credit_limit || 0);
  const nextBalance = balance + Number(orderAmount);

  if (nextBalance > limit) {
    await markCreditStatus(account, "exhausted", "Available credit exhausted.");
    await queueCreditReminder(account, "exhausted");
    const error = new Error("Available credit with this vendor is exhausted. Please choose prepaid payment.");
    error.statusCode = 403;
    error.credit_account = { ...account, status: "exhausted" };
    throw error;
  }

  if (nextBalance >= limit * NEAR_LIMIT_RATIO) {
    await queueCreditReminder({ ...account, outstanding_balance: nextBalance }, "near_limit");
  }

  return account;
}

export async function recordCreditPurchase({ vendorId, customerId, orderId, amount, vendorUserId }) {
  const account = await getCreditAccount(vendorId, customerId);
  if (!account) throw new Error("Credit account not found.");

  const balanceBefore = Number(account.outstanding_balance || 0);
  const balanceAfter = balanceBefore + Number(amount);
  const dueDate = account.due_date || addDays(account.payment_due_days);
  const status = balanceAfter >= Number(account.credit_limit || 0) ? "exhausted" : "active";

  const { data, error } = await supabase
    .from("vendor_credit_accounts")
    .update({
      outstanding_balance: balanceAfter,
      due_date: dueDate,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id)
    .select()
    .single();

  if (error) throw error;

  await writeCreditTransaction({
    account: data,
    orderId,
    transactionType: "credit_purchase",
    amount: Number(amount),
    balanceBefore,
    balanceAfter,
    dueDate,
    vendorUserId,
    notes: "Vendor-approved customer credit purchase recorded.",
    metadata: {
      platform_role: "record_keeper_only",
      recovery_responsibility: "vendor_and_customer_only",
    },
  });

  if (status === "exhausted") await queueCreditReminder(data, "exhausted");
  return data;
}

export async function recordCreditPayment({ vendorId, customerId, amount, vendorUserId, notes }) {
  const account = await getCreditAccount(vendorId, customerId);
  if (!account) throw new Error("Credit account not found.");

  const paidAmount = Number(amount);
  if (!paidAmount || paidAmount <= 0) {
    const error = new Error("Payment amount is required.");
    error.statusCode = 400;
    throw error;
  }

  const balanceBefore = Number(account.outstanding_balance || 0);
  const balanceAfter = Math.max(balanceBefore - paidAmount, 0);
  const nextStatus = account.status === "suspended" ? "suspended" : "active";

  const { data, error } = await supabase
    .from("vendor_credit_accounts")
    .update({
      outstanding_balance: balanceAfter,
      due_date: balanceAfter > 0 ? account.due_date : null,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id)
    .select()
    .single();

  if (error) throw error;

  await writeCreditTransaction({
    account: data,
    transactionType: "payment_recorded",
    amount: -paidAmount,
    balanceBefore,
    balanceAfter,
    vendorUserId,
    notes: notes || "Payment recorded by vendor.",
    metadata: { recorded_by_vendor: true },
  });

  return data;
}

export async function suspendCredit({ vendorId, customerId, vendorUserId, reason }) {
  const account = await getCreditAccount(vendorId, customerId);
  if (!account) throw new Error("Credit account not found.");

  const { data, error } = await supabase
    .from("vendor_credit_accounts")
    .update({
      status: "suspended",
      suspended_at: new Date().toISOString(),
      suspension_reason: reason || "Suspended by vendor",
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id)
    .select()
    .single();

  if (error) throw error;

  await writeCreditTransaction({
    account: data,
    transactionType: "credit_suspended",
    amount: 0,
    balanceBefore: Number(account.outstanding_balance || 0),
    balanceAfter: Number(account.outstanding_balance || 0),
    vendorUserId,
    notes: reason || "Credit suspended by vendor.",
  });
  await queueCreditReminder(data, "suspended");
  return data;
}

async function markCreditStatus(account, status, reason) {
  if (account.status === "suspended" || account.status === status) return account;

  const { data, error } = await supabase
    .from("vendor_credit_accounts")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", account.id)
    .select()
    .single();

  if (error) throw error;
  await writeCreditTransaction({
    account: data,
    transactionType: "manual_adjustment",
    amount: 0,
    balanceBefore: Number(account.outstanding_balance || 0),
    balanceAfter: Number(account.outstanding_balance || 0),
    notes: reason,
  });
  return data;
}

async function writeCreditTransaction({
  account,
  orderId,
  transactionType,
  amount,
  balanceBefore,
  balanceAfter,
  dueDate,
  vendorUserId,
  notes,
  metadata = {},
}) {
  const { error } = await supabase.from("vendor_credit_transactions").insert({
    vendor_id: account.vendor_id,
    customer_id: account.customer_id,
    account_id: account.id,
    order_id: orderId || null,
    transaction_type: transactionType,
    amount,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    due_date: dueDate || account.due_date || null,
    vendor_user_id: vendorUserId || null,
    notes: notes || null,
    metadata,
  });

  if (error) throw error;
}

export async function queueCreditReminder(account, reminderType) {
  const messageMap = {
    near_limit: "You are approaching the credit limit approved by this vendor.",
    due_soon: "A vendor-approved credit payment is due soon.",
    overdue: "A vendor-approved credit payment is overdue.",
    exhausted: "Available credit with this vendor is exhausted. Please repay or use prepaid orders.",
    suspended: "Credit with this vendor has been suspended by the vendor.",
  };

  const { error } = await supabase.from("vendor_credit_reminders").insert({
    vendor_id: account.vendor_id,
    customer_id: account.customer_id,
    account_id: account.id,
    reminder_type: reminderType,
    outstanding_balance: Number(account.outstanding_balance || 0),
    credit_limit: Number(account.credit_limit || 0),
    due_date: account.due_date || null,
    message: messageMap[reminderType],
    status: "queued",
  });

  if (error) throw error;
}
