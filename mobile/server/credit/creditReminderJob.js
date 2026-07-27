import { supabase } from "../connection.js";
import { queueCreditReminder } from "./vendorCreditService.js";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function runVendorCreditReminderJob() {
  const { data: accounts, error } = await supabase
    .from("vendor_credit_accounts")
    .select("*")
    .gt("outstanding_balance", 0)
    .in("status", ["active", "exhausted", "overdue", "suspended"]);

  if (error) throw error;
  if (!accounts?.length) return { checked: 0, queued: 0 };

  let queued = 0;
  const today = todayDate();
  const soon = daysFromNow(2);

  for (const account of accounts) {
    const outstanding = Number(account.outstanding_balance || 0);
    const limit = Number(account.credit_limit || 0);

    if (account.status === "suspended") {
      await queueCreditReminder(account, "suspended");
      queued += 1;
      continue;
    }

    if (account.due_date && account.due_date < today) {
      await queueCreditReminder(account, "overdue");
      queued += 1;
      continue;
    }

    if (account.due_date && account.due_date <= soon) {
      await queueCreditReminder(account, "due_soon");
      queued += 1;
    }

    if (limit > 0 && outstanding >= limit) {
      await queueCreditReminder(account, "exhausted");
      queued += 1;
    } else if (limit > 0 && outstanding >= limit * 0.8) {
      await queueCreditReminder(account, "near_limit");
      queued += 1;
    }
  }

  return { checked: accounts.length, queued };
}
