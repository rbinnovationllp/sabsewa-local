import express from "express";
import { supabase } from "../connection.js";

const router = express.Router();

function validateSettings(body) {
  const freeDeliveryMinOrder = Number(body.free_delivery_min_order ?? 0);
  const deliveryFeeBelowMin = Number(body.delivery_fee_below_min ?? 0);
  const minimumDeliveryOrderValue = Number(body.minimum_delivery_order_value ?? 0);
  const serviceRadiusMeters = Number(body.service_radius_meters ?? 500);
  const minMinutes = Number(body.estimated_delivery_min_minutes ?? 30);
  const maxMinutes = Number(body.estimated_delivery_max_minutes ?? 60);

  if (freeDeliveryMinOrder < 0 || deliveryFeeBelowMin < 0 || minimumDeliveryOrderValue < 0) {
    throw new Error("Delivery amounts cannot be negative.");
  }
  if (serviceRadiusMeters < 100 || serviceRadiusMeters > 1000) {
    throw new Error("Service radius must be between 100 metres and 1 kilometre.");
  }
  if (minMinutes < 15 || maxMinutes > 240 || minMinutes > maxMinutes) {
    throw new Error("Delivery window must be a reasonable estimate between 15 and 240 minutes.");
  }

  return {
    free_delivery_min_order: freeDeliveryMinOrder,
    delivery_fee_below_min: deliveryFeeBelowMin,
    minimum_delivery_order_value: minimumDeliveryOrderValue,
    service_radius_meters: serviceRadiusMeters,
    estimated_delivery_min_minutes: minMinutes,
    estimated_delivery_max_minutes: maxMinutes,
    delivery_available: body.delivery_available !== false,
    pickup_available: Boolean(body.pickup_available),
    delivery_provider_type: body.delivery_provider_type === "authorised_provider" ? "authorised_provider" : "vendor",
    updated_at: new Date().toISOString(),
  };
}

router.get("/terminal/:terminalId", async (req, res) => {
  const { data, error } = await supabase
    .from("vendor_terminals")
    .select("id, vendor_id, free_delivery_min_order, delivery_fee_below_min, minimum_delivery_order_value, service_radius_meters, estimated_delivery_min_minutes, estimated_delivery_max_minutes, delivery_available, pickup_available, delivery_provider_type")
    .eq("id", req.params.terminalId)
    .maybeSingle();

  if (error) return res.status(400).json({ success: false, error: error.message });
  return res.json({ success: true, settings: data });
});

router.post("/terminal/:terminalId", async (req, res) => {
  try {
    const nextSettings = validateSettings(req.body);
    const actorUserId = req.body.actor_user_id || null;

    const { data: before, error: loadError } = await supabase
      .from("vendor_terminals")
      .select("id, vendor_id, free_delivery_min_order, delivery_fee_below_min, minimum_delivery_order_value, service_radius_meters, estimated_delivery_min_minutes, estimated_delivery_max_minutes, delivery_available, pickup_available, delivery_provider_type")
      .eq("id", req.params.terminalId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!before) return res.status(404).json({ success: false, error: "Terminal not found." });

    const { data, error } = await supabase
      .from("vendor_terminals")
      .update(nextSettings)
      .eq("id", req.params.terminalId)
      .select()
      .single();

    if (error) throw error;

    await supabase.from("vendor_delivery_settings_audit").insert({
      vendor_id: before.vendor_id,
      terminal_id: before.id,
      changed_by_user_id: actorUserId,
      previous_settings: before,
      new_settings: nextSettings,
      reason: req.body.reason || "Vendor updated delivery settings",
    });

    return res.json({ success: true, settings: data });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message || "Unable to update delivery settings." });
  }
});

export default router;
