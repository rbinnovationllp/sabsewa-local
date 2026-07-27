import { supabase } from "../connection.js";

export async function writeOrderAuditLog({
  orderId,
  vendorId,
  actorUserId,
  actorRole = "vendor",
  action,
  fromStatus,
  toStatus,
  metadata = {},
  req,
}) {
  if (!action) return null;

  try {
    const { data, error } = await supabase
      .from("order_audit_logs")
      .insert({
        order_id: orderId || null,
        vendor_id: vendorId || null,
        actor_user_id: actorUserId || null,
        actor_role: actorRole,
        action,
        from_status: fromStatus || null,
        to_status: toStatus || null,
        ip_address:
          req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
          req?.socket?.remoteAddress ||
          null,
        user_agent: req?.headers?.["user-agent"] || null,
        metadata,
      })
      .select("id")
      .single();

    if (error) throw error;
    return data?.id || null;
  } catch (error) {
    console.error("ORDER AUDIT LOG FAILED:", error.message);
    return null;
  }
}
