import express from "express";
import { supabase } from "../connection.js";
import { assertVendorCanReceiveOrdersByStatus } from "../vendor/onboardingPolicyService.js";

const router = express.Router();

/**
 * GET: List all master catalog items
 */
router.get("/list", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();

    let query = supabase
      .from("master_product_catalog")
      .select("*")
      .eq("is_active", true)
      .order("category")
      .order("subcategory")
      .order("standard_title")
      .limit(300);

    if (category) query = query.eq("category", category);
    if (search) {
      query = query.or(
        `standard_title.ilike.%${search}%,subcategory.ilike.%${search}%,brand_name.ilike.%${search}%`
      );
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });

    return res.json({
      success: true,
      items: data || [],
      image_policy: {
        default_status: "image_pending",
        allowed_sources: [
          "vendor_contributed_with_share_consent",
          "manufacturer_or_distributor_permission",
          "commercial_reuse_licence",
          "sabsewa_commissioned",
        ],
        prohibited_sources: [
          "copied_from_amazon_flipkart_bigbasket_zepto_blinkit_or_other_commercial_sites",
          "hotlinked_external_product_photos",
          "unlicensed_brand_or_packaging_images",
        ],
      },
    });

  } catch (err) {
    console.error("Catalog List Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

router.get("/categories", async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from("master_product_catalog")
      .select("category, subcategory")
      .eq("is_active", true);

    if (error) throw error;

    const categoryMap = new Map();
    for (const row of data || []) {
      const current = categoryMap.get(row.category) || new Set();
      current.add(row.subcategory);
      categoryMap.set(row.category, current);
    }

    return res.json({
      success: true,
      categories: Array.from(categoryMap.entries()).map(([category, subcategories]) => ({
        category,
        subcategories: Array.from(subcategories).sort(),
      })),
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.get("/variants", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const masterProductId = String(req.query.master_product_id || "").trim();
    const barcode = String(req.query.barcode || "").trim();

    let query = supabase
      .from("product_variants")
      .select(`
        *,
        master_product:master_product_catalog(id, standard_title, category, subcategory, common_units, local_names),
        brand:product_brands(id, brand_name, manufacturer)
      `)
      .eq("source_status", "approved")
      .limit(50);

    if (masterProductId) query = query.eq("master_product_id", masterProductId);
    if (barcode) query = query.or(`barcode.eq.${barcode},ean.eq.${barcode},sku.eq.${barcode}`);
    if (search) {
      query = query.or(`variant_name.ilike.%${search}%,barcode.ilike.%${search}%,sku.ilike.%${search}%,ean.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ success: true, variants: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/missing-item-request", async (req, res) => {
  try {
    const {
      customer_id,
      vendor_id,
      terminal_id,
      item_name,
      preferred_brand,
      required_variant,
      pack_size,
      quantity,
      optional_photo_key,
      barcode,
      voice_description,
      allow_other_brand = false,
      customer_notes,
    } = req.body;

    if (!vendor_id || !item_name) {
      return res.status(400).json({ success: false, error: "Selected shop and item name are required." });
    }

    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id")
      .eq("id", vendor_id)
      .single();

    if (vendorError || !vendor) {
      return res.status(409).json({ success: false, error: "Selected shop is not available for item requests." });
    }

    await assertVendorCanReceiveOrdersByStatus(vendor_id);

    if (terminal_id) {
      const { data: terminal, error: terminalError } = await supabase
        .from("vendor_terminals")
        .select("id, vendor_id, status")
        .eq("id", terminal_id)
        .eq("vendor_id", vendor_id)
        .single();
      if (terminalError || !terminal || terminal.status !== "active") {
        return res.status(409).json({ success: false, error: "Selected branch is not available for item requests." });
      }
    }

    const { data, error } = await supabase
      .from("customer_item_requests")
      .insert({
        customer_id: customer_id || null,
        vendor_id,
        terminal_id: terminal_id || null,
        item_name: item_name.trim(),
        preferred_brand: preferred_brand || null,
        required_variant: required_variant || null,
        pack_size: pack_size || null,
        quantity: quantity || null,
        optional_photo_key: optional_photo_key || null,
        barcode: barcode || null,
        voice_description: voice_description || null,
        allow_other_brand: Boolean(allow_other_brand),
        customer_notes: customer_notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ success: true, request: data });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

export default router;
