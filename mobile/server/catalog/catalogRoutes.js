import express from "express";
import multer from "multer";
import sharp from "sharp";
import { supabase } from "../connection.js";
import { assertVendorCanReceiveOrdersByStatus } from "../vendor/onboardingPolicyService.js";
import { analyzeProductWithAI } from "../services/aiValidationService.js";

const router = express.Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * Image Optimizer (WebP format, strip metadata, resize to max 1024px)
 */
async function processAndStoreImage(buffer, vendorId) {
  const processedBuffer = await sharp(buffer)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const fileName = `vendor_${vendorId}/${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;

  const { error } = await supabase.storage
    .from("product-images")
    .upload(fileName, processedBuffer, { contentType: "image/webp", upsert: true });

  if (error) throw error;

  const { data: publicUrlData } = supabase.storage.from("product-images").getPublicUrl(fileName);
  return publicUrlData.publicUrl;
}

/**
 * POST /api/catalog/upload-product
 * Mobile direct photo upload with Gemini AI product validation
 */
router.post("/upload-product", upload.single("image"), async (req, res) => {
  try {
    const {
      vendor_id,
      terminal_id,
      product_name,
      brand_name,
      price,
      price_type = "actual",
      unit = "pcs",
      stock = 100,
      master_product_id,
      vendor_declaration_accepted,
    } = req.body;

    if (!vendor_id || !terminal_id || !product_name || !price) {
      return res.status(400).json({ success: false, error: "Vendor ID, terminal ID, product name, and price are required." });
    }

    if (!vendor_declaration_accepted || String(vendor_declaration_accepted) !== "true") {
      return res.status(400).json({ success: false, error: "Vendor declaration acceptance is required before publishing products." });
    }

    let imageUrl = null;
    if (req.file) {
      imageUrl = await processAndStoreImage(req.file.buffer, vendor_id);
    }

    // Path A: Master Catalogue Import
    if (master_product_id) {
      const { data: masterItem } = await supabase
        .from("master_product_catalog")
        .select("*")
        .eq("id", master_product_id)
        .single();

      const { data: item, error } = await supabase
        .from("vendor_items")
        .insert({
          vendor_id,
          terminal_id,
          master_product_id,
          item_name: masterItem ? masterItem.standard_title : product_name,
          brand_name: brand_name || null,
          price: Number(price),
          price_type,
          price_unit_label: unit,
          stock_quantity: Number(stock),
          item_pic: masterItem ? masterItem.image_url : imageUrl,
          vendor_override_image_url: imageUrl || null,
          is_available: true,
          available_today: true,
          vendor_declaration_accepted: true,
          vendor_declaration_accepted_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return res.json({ success: true, item, imported_from_master: true });
    }

    // Path B: New Product Path with AI Analysis
    const aiAnalysis = await analyzeProductWithAI({
      imageBuffer: req.file ? req.file.buffer : null,
      mimeType: req.file ? req.file.mimetype : null,
      productName: product_name,
      brandName: brand_name,
    });

    const isRestricted = aiAnalysis.is_restricted || aiAnalysis.is_prohibited;
    const restrictionStatus = isRestricted ? "pending_licence_verification" : "unrestricted";

    // Insert Vendor Item
    const { data: item, error: itemError } = await supabase
      .from("vendor_items")
      .insert({
        vendor_id,
        terminal_id,
        item_name: product_name,
        brand_name: brand_name || null,
        price: Number(price),
        price_type,
        price_unit_label: aiAnalysis.suggested_unit || unit,
        stock_quantity: Number(stock),
        item_pic: imageUrl,
        is_available: !isRestricted,
        available_today: !isRestricted,
        restriction_status: restrictionStatus,
        required_licence_type: aiAnalysis.detected_licence_type || null,
        ai_flagged: isRestricted,
        ai_validation_metadata: aiAnalysis,
        vendor_declaration_accepted: true,
        vendor_declaration_accepted_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (itemError) throw itemError;

    // Log AI Validation
    await supabase.from("ai_product_validation_logs").insert({
      vendor_id,
      vendor_item_id: item.id,
      image_url: imageUrl,
      input_product_name: product_name,
      suggested_english_name: aiAnalysis.suggested_english_name,
      suggested_category: aiAnalysis.suggested_category,
      suggested_unit: aiAnalysis.suggested_unit,
      search_keywords: aiAnalysis.search_keywords,
      short_description: aiAnalysis.short_description,
      is_restricted: aiAnalysis.is_restricted,
      restriction_reason: aiAnalysis.restriction_reason,
      detected_licence_type: aiAnalysis.detected_licence_type,
      is_prohibited: aiAnalysis.is_prohibited,
      confidence_score: aiAnalysis.confidence_score,
      raw_ai_response: aiAnalysis,
    });

    // Stage in Master Catalogue (Auto-promote after 6 hours)
    if (!isRestricted && imageUrl) {
      await supabase.from("master_product_catalogue").insert({
        product_name: aiAnalysis.suggested_english_name || product_name,
        brand_name: brand_name || null,
        category_slug: aiAnalysis.suggested_category || "other",
        description: aiAnalysis.short_description || "",
        standard_unit: aiAnalysis.suggested_unit || unit,
        master_image_url: imageUrl,
        search_keywords: aiAnalysis.search_keywords || [product_name],
        status: "pending_review",
        source_vendor_id: vendor_id,
        auto_promote_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      });
    }

    return res.json({
      success: true,
      item,
      ai_analysis: aiAnalysis,
      requires_licence: isRestricted,
      message: isRestricted
        ? "This product appears to fall under a regulated category. Please upload the required licence for verification."
        : "Product published to your storefront successfully.",
    });
  } catch (err) {
    console.error("Product Upload Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

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