import fs from "fs";
import path from "path";

const root = path.resolve(process.cwd(), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertIncludes(text, pattern, label) {
  if (!text.includes(pattern)) {
    throw new Error(`Missing ${label}: ${pattern}`);
  }
}

function assertMatches(text, pattern, label) {
  if (!pattern.test(text)) {
    throw new Error(`Missing ${label}: ${pattern}`);
  }
}

const archiveSql = read("supabase/RUN_ONLY_PARTNER_COMMISSION_RETENTION_ARCHIVE_2026_08_22.sql");
assertIncludes(archiveSql, "review_period_ends_at", "partner review period field");
assertIncludes(archiveSql, "interval '15 days'", "15-day partner review window");
assertIncludes(archiveSql, "legal_hold boolean", "legal hold field");
assertIncludes(archiveSql, "retention_period_months integer not null default 96", "8-year retention default");
assertIncludes(archiveSql, "partner_commission_statement_archives", "protected archive table");
assertIncludes(archiveSql, "run_partner_commission_archive_job", "archive job function");
assertMatches(archiveSql, /Do not delete|does not permanently delete/i, "no permanent deletion policy note");

const strictWalletSql = read("supabase/RUN_ONLY_STRICT_ORDER_ACCEPTANCE_FULL_GST_WALLET_2026_08_22.sql");
assertIncludes(strictWalletSql, "trg_enforce_order_acceptance_full_wallet_charge", "strict acceptance trigger");
assertIncludes(strictWalletSql, "Insufficient vendor wallet balance", "insufficient wallet rejection");
assertIncludes(strictWalletSql, "complete GST-inclusive platform deduction", "GST-inclusive guard wording");

const conversationSql = read("supabase/RUN_ONLY_ORDER_CONVERSATIONS_PRIVACY_2026_08_22.sql");
for (const table of [
  "order_conversations",
  "order_messages",
  "message_participants",
  "alternative_proposals",
  "alternative_proposal_items",
  "message_delivery_status",
  "blocked_contact_sharing_events",
  "conversation_audit_log",
]) {
  assertIncludes(conversationSql, `public.${table}`, `${table} table`);
}
assertIncludes(conversationSql, "public.owns_vendor(vendor_id)", "vendor RLS");
assertIncludes(conversationSql, "customer_id = auth.uid()", "customer RLS");

const conversationRoutes = read("mobile/server/hyperlocal/orderConversationRoutes.js");
assertIncludes(conversationRoutes, "detectBlockedContent", "backend direct-contact blocking");
assertIncludes(conversationRoutes, "fee_triggered: false", "messages do not trigger platform fees");
assertIncludes(conversationRoutes, "ALTERNATIVE_PROPOSAL", "alternative proposal endpoint support");
assertIncludes(conversationRoutes, "direct contact details cannot be exchanged", "privacy warning");
assertMatches(conversationRoutes, /phone|email|whatsapp|upi_or_external_payment/i, "blocked content categories");

const index = read("mobile/server/index.js");
assertIncludes(index, "orderConversationRoutes", "order conversation route mount");

const partnerRoutes = read("mobile/server/partner/partnerRoutes.js");
assertIncludes(partnerRoutes, "/admin/commission-archive/run", "partner archive admin endpoint");
assertIncludes(partnerRoutes, "/admin/commission-statements/:statement_id/legal-hold", "partner legal hold endpoint");
assertIncludes(partnerRoutes, "archive_status", "partner statement archive status response");

console.log("Retention, GST wallet guard and order-conversation privacy foundation validated.");
