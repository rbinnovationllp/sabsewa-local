import express from "express";
import { supabase } from "../connection.js";
import { requireRole, requireUserJwt } from "../security/apiSecurity.js";
import { requireMasterAdminSession } from "../security/masterAdminSecurity.js";

const router = express.Router();
const requireAdmin = [requireUserJwt(supabase), requireRole(["admin", "company_admin", "super_admin"])];

router.get("/vendors", ...requireAdmin, async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const cityCode = String(req.query.city_code || "").trim().toUpperCase();
    const localityCode = String(req.query.locality_code || "").trim().toUpperCase();

    let vendorQuery = supabase
      .from("vendors")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (cityCode) vendorQuery = vendorQuery.eq("city_code", cityCode);
    if (localityCode) vendorQuery = vendorQuery.eq("locality_code", localityCode);

    if (search) {
      vendorQuery = vendorQuery.or(
        [
          `public_vendor_id.ilike.%${search}%`,
          `shop_name.ilike.%${search}%`,
          `owner_name.ilike.%${search}%`,
          `phone.ilike.%${search}%`,
          `city_code.ilike.%${search}%`,
          `locality_code.ilike.%${search}%`,
        ].join(",")
      );
    }

    const { data: vendors, error: vendorError } = await vendorQuery;
    if (vendorError) throw vendorError;

    let terminalRows = [];
    if (search) {
      const { data, error } = await supabase
        .from("vendor_terminals")
        .select("*")
        .or(`public_terminal_id.ilike.%${search}%,terminal_name.ilike.%${search}%,city.ilike.%${search}%,phone.ilike.%${search}%`)
        .limit(100);

      if (error) throw error;
      terminalRows = data || [];
    }

    const vendorIds = Array.from(new Set([
      ...(vendors || []).map((vendor) => vendor.id),
      ...terminalRows.map((terminal) => terminal.vendor_id),
    ]));

    const { data: terminals } = vendorIds.length
      ? await supabase
          .from("vendor_terminals")
          .select("*")
          .in("vendor_id", vendorIds)
          .order("created_at")
      : { data: [] };

    return res.json({
      success: true,
      vendors: (vendors || []).map((vendor) => ({
        ...vendor,
        terminals: (terminals || []).filter((terminal) => terminal.vendor_id === vendor.id),
      })),
      terminal_matches: terminalRows,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/unserved-area-leads", async (req, res) => {
  try {
    const { category, pincode, status } = req.query;

    let query = supabase
      .from("unserved_area_leads")
      .select("*")
      .order("customer_count", { ascending: false })
      .order("last_requested_at", { ascending: false });

    if (category) query = query.eq("category", String(category));
    if (pincode) query = query.eq("pincode", String(pincode));
    if (status) query = query.eq("status", String(status));

    const { data, error } = await query.limit(250);
    if (error) throw error;

    return res.json({ success: true, leads: data || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/unserved-area-leads/:lead_id/assign", async (req, res) => {
  try {
    const { assigned_to } = req.body;
    if (!assigned_to) {
      return res.status(400).json({ success: false, error: "Company representative is required." });
    }

    const { data, error } = await supabase
      .from("unserved_area_leads")
      .update({
        assigned_to,
        status: "assigned",
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.params.lead_id)
      .select()
      .single();

    if (error) throw error;
    return res.json({ success: true, lead: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/unserved-area-leads/:lead_id/vendor-contact", async (req, res) => {
  try {
    const {
      vendor_name,
      contact_name,
      phone,
      category,
      contact_status = "identified",
      registered_vendor_id,
      notes,
      contacted_by,
    } = req.body;

    if (!vendor_name) {
      return res.status(400).json({ success: false, error: "Vendor name is required." });
    }

    const { data, error } = await supabase
      .from("unserved_area_vendor_contacts")
      .insert({
        lead_id: req.params.lead_id,
        vendor_name,
        contact_name: contact_name || null,
        phone: phone || null,
        category: category || null,
        contact_status,
        registered_vendor_id: registered_vendor_id || null,
        notes: notes || null,
        contacted_by: contacted_by || null,
        contacted_at: contact_status === "identified" ? null : new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    if (["contacted", "interested"].includes(contact_status)) {
      await supabase
        .from("unserved_area_leads")
        .update({ status: "vendors_contacted", updated_at: new Date().toISOString() })
        .eq("id", req.params.lead_id);
    }

    if (contact_status === "registered") {
      await supabase
        .from("unserved_area_leads")
        .update({ status: "vendor_registered", updated_at: new Date().toISOString() })
        .eq("id", req.params.lead_id);
    }

    return res.status(201).json({ success: true, contact: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
