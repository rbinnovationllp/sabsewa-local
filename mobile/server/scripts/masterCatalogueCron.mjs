import { supabase } from "../connection.js";
import { sendEmail } from "../services/notificationService.js";

export async function processMasterCatalogueAutoPromotion() {
  const now = new Date().toISOString();

  // 1. Auto-promote items older than 6 hours
  const { data: promotedItems, error: promoteError } = await supabase
    .from("master_product_catalogue")
    .update({ status: "approved", updated_at: now })
    .eq("status", "pending_review")
    .lte("auto_promote_at", now)
    .select();

  if (promoteError) console.error("Error auto-promoting master items:", promoteError);

  // 2. Fetch statistics for the 6-hour digest
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  const [
    { data: pendingReviews },
    { data: aiFlagged },
    { data: licencePending },
  ] = await Promise.all([
    supabase.from("master_product_catalogue").select("id, product_name").eq("status", "pending_review"),
    supabase.from("ai_product_validation_logs").select("*").gte("created_at", sixHoursAgo).eq("is_restricted", true),
    supabase.from("vendor_products").select("id, product_name, required_licence_type").eq("restriction_status", "pending_licence_verification"),
  ]);

  // 3. Send Consolidated Admin Digest Email
  const emailHtml = `
    <h2>SabSewa Local - 6-Hour Master Catalogue Digest</h2>
    <p><strong>Auto-Approved Products (Last 6 Hours):</strong> ${promotedItems?.length || 0}</p>
    <p><strong>Pending Master Reviews:</strong> ${pendingReviews?.length || 0}</p>
    <p><strong>AI-Flagged Restricted Items:</strong> ${aiFlagged?.length || 0}</p>
    <p><strong>Vendors Pending Licence Verification:</strong> ${licencePending?.length || 0}</p>
    <hr />
    <p>Log in to SabSewa Local Company Admin Portal to review pending items.</p>
  `;

  await sendEmail({
    to: "support@sabsewa.in",
    subject: "SabSewa Local - Master Catalogue & Safety Digest",
    html: emailHtml,
  });

  return { promoted_count: promotedItems?.length || 0 };
}

// If run directly via node/cron:
if (process.argv[1].includes("masterCatalogueCron.mjs")) {
  processMasterCatalogueAutoPromotion().then(() => process.exit(0));
}