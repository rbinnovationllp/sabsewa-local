import express from "express";
import { supabase } from "../connection.js";
import { genAI, geminiModel } from "../gemini/geminiClient.js";
import { extractJsonObject } from "../gemini/json.js";
import { writeGeminiAuditLog } from "../gemini/auditLog.js";

const router = express.Router();

const ALLOWED_CATEGORIES = new Set([
  "kirana",
  "vegetables",
  "fruits",
  "dairy",
  "bakery",
  "beverages",
  "household",
  "household-essentials",
  "personal-care",
  "packaged-food",
  "pharmacy",
  "stationery",
  "hardware",
  "medical",
  "tiffin",
  "restaurant",
  "other",
]);

function clean(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\u0c80-\u0cff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampDiscount(value) {
  const parsed = numberOrNull(value);
  if (parsed === null) return 0;
  return Math.min(Math.max(parsed, 0), 95);
}

function mrpPrice(sourceMrp, policy, discountPercent) {
  const mrp = numberOrNull(sourceMrp);
  if (!mrp || mrp <= 0) return null;
  if (policy === "mrp") return Number(mrp.toFixed(2));
  if (policy === "mrp_discount") return Number((mrp * (1 - clampDiscount(discountPercent) / 100)).toFixed(2));
  return null;
}

function productHaystack(product) {
  return normalize([
    product.standard_title,
    product.category,
    product.subcategory,
    product.brand_name,
    product.pack_size,
    ...(product.common_units || []),
    ...(product.search_keywords || []),
    ...(product.alternative_spellings || []),
    ...Object.values(product.local_names || {}).flat(),
  ].join(" "));
}

function scoreProduct(product, terms) {
  const haystack = productHaystack(product);
  return terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
}

function publicProduct(product, extra = {}) {
  return {
    id: product.id,
    standard_title: product.standard_title,
    category: product.category,
    subcategory: product.subcategory,
    product_description: product.product_description || null,
    generic_image_url: product.generic_image_url || null,
    mrp: product.mrp == null ? null : Number(product.mrp),
    is_branded: Boolean(product.is_branded || product.brand_name || product.mrp),
    local_names: product.local_names || {},
    common_units: product.common_units || [],
    brand_name: product.brand_name || null,
    pack_size: product.pack_size || null,
    search_keywords: product.search_keywords || [],
    alternative_spellings: product.alternative_spellings || [],
    image_status: product.image_status || "image_pending",
    is_active: product.is_active !== false,
    ...extra,
  };
}

async function validateVendorTerminal(vendorId, terminalId) {
  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("id, status")
    .eq("id", vendorId)
    .single();

  if (vendorError || !vendor) {
    return { ok: false, status: 404, error: "Vendor profile was not found." };
  }

  if (terminalId) {
    const { data: terminal, error: terminalError } = await supabase
      .from("vendor_terminals")
      .select("id, vendor_id, status")
      .eq("id", terminalId)
      .eq("vendor_id", vendorId)
      .single();

    if (terminalError || !terminal) {
      return { ok: false, status: 404, error: "Selected terminal does not belong to this vendor." };
    }
  }

  return { ok: true };
}

router.get("/setup/master-products", async (req, res) => {
  try {
    const search = clean(req.query.search);
    const category = clean(req.query.category);
    const brand = clean(req.query.brand);
    const language = clean(req.query.language);

    let query = supabase
      .from("master_product_catalog")
      .select("id, standard_title, category, subcategory, product_description, generic_image_url, mrp, is_branded, local_names, common_units, brand_name, pack_size, search_keywords, alternative_spellings, image_status, is_active")
      .eq("is_active", true)
      .order("category")
      .order("subcategory")
      .order("standard_title")
      .limit(250);

    if (category) query = query.eq("category", category);
    if (brand) query = query.ilike("brand_name", `%${brand}%`);
    const { data, error } = await query;
    if (error) throw error;

    const terms = normalize(search).split(" ").filter((term) => term.length >= 2);
    const products = search && terms.length
      ? (data || [])
          .map((product) => publicProduct(product, { match_score: scoreProduct(product, terms), language }))
          .filter((product) => product.match_score > 0 || normalize(product.standard_title).includes(normalize(search)))
          .sort((a, b) => b.match_score - a.match_score || a.standard_title.localeCompare(b.standard_title))
      : (data || []).map((product) => publicProduct(product, { language }));

    return res.json({ success: true, products });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/setup/suggestions", async (req, res) => {
  try {
    const search = clean(req.query.search);
    const category = clean(req.query.category);
    const language = clean(req.query.language || "en");
    const vendorId = clean(req.query.vendor_id);
    const userId = clean(req.query.user_id);

    if (search.length < 2) {
      return res.json({ success: true, suggestions: [], source: "empty" });
    }

    const terms = normalize(search).split(" ").filter((term) => term.length >= 2).slice(0, 8);
    let query = supabase
      .from("master_product_catalog")
      .select("id, standard_title, category, subcategory, product_description, generic_image_url, mrp, is_branded, local_names, common_units, brand_name, pack_size, search_keywords, alternative_spellings, image_status, is_active")
      .eq("is_active", true)
      .limit(300);

    if (category) query = query.eq("category", category);
    const { data, error } = await query;
    if (error) throw error;

    const deterministic = (data || [])
      .map((product) => publicProduct(product, {
        match_score: scoreProduct(product, terms),
        suggestion_reason: "Matched product name, category, local name or synonym.",
      }))
      .filter((product) => product.match_score > 0)
      .sort((a, b) => b.match_score - a.match_score || a.standard_title.localeCompare(b.standard_title))
      .slice(0, 12);

    if (!process.env.GEMINI_API_KEY || deterministic.length === 0) {
      return res.json({ success: true, suggestions: deterministic, source: "catalogue_match" });
    }

    const prompt = `You are helping an Indian local-shop vendor search a master product catalogue.
Return strict JSON only:
{"suggestions":[{"id":"catalogue uuid","reason":"short reason","local_name_hint":"short local synonym if useful"}]}
Rules:
- Select only ids from the candidate list.
- Prefer common Indian grocery, dairy, pharmacy, stationery, hardware, household, fruit and vegetable names.
- Support spelling mistakes, Hindi/Hinglish/Kannada/local names, synonyms and common variants.
- Do not invent unavailable product ids.
Vendor search: ${search}
Preferred language: ${language}
Candidates: ${JSON.stringify(deterministic.slice(0, 20).map((product) => ({
  id: product.id,
  title: product.standard_title,
  category: product.category,
  subcategory: product.subcategory,
  local_names: product.local_names,
  keywords: product.search_keywords,
  spellings: product.alternative_spellings,
})))}`;

    let geminiSuggestions = [];
    try {
      const response = await genAI.models.generateContent({
        model: geminiModel,
        contents: prompt,
        config: { temperature: 0.2, maxOutputTokens: 512 },
      });
      const parsed = extractJsonObject(response.text || "{}");
      const byId = new Map(deterministic.map((product) => [product.id, product]));
      geminiSuggestions = (parsed.suggestions || [])
        .map((suggestion) => {
          const product = byId.get(String(suggestion.id));
          if (!product) return null;
          return {
            ...product,
            suggestion_reason: clean(suggestion.reason) || product.suggestion_reason,
            local_name_hint: clean(suggestion.local_name_hint) || null,
            gemini_ranked: true,
          };
        })
        .filter(Boolean)
        .slice(0, 8);

      await writeGeminiAuditLog({
        agentType: "catalogue_product_suggestion",
        inputType: "text",
        inputSummary: search.slice(0, 200),
        model: geminiModel,
        responseJson: { suggestion_count: geminiSuggestions.length, language },
        userId,
        vendorId,
      });
    } catch (error) {
      console.warn("Gemini catalogue suggestions fallback", error?.message || error);
    }

    return res.json({
      success: true,
      suggestions: geminiSuggestions.length ? geminiSuggestions : deterministic.slice(0, 8),
      source: geminiSuggestions.length ? "gemini_catalogue_assist" : "catalogue_match",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/setup/vendor-items", async (req, res) => {
  try {
    const vendorId = clean(req.query.vendor_id);
    const terminalId = clean(req.query.terminal_id);
    if (!vendorId) return res.status(400).json({ success: false, error: "Vendor ID is required." });

    const validation = await validateVendorTerminal(vendorId, terminalId);
    if (!validation.ok) return res.status(validation.status).json({ success: false, error: validation.error });

    let query = supabase
      .from("vendor_items")
      .select("id, vendor_id, terminal_id, master_product_id, product_variant_id, item_name, generic_product_name, brand_name, variant_name, pack_size, pack_unit, mrp, mrp_pricing_policy, mrp_discount_percent, master_mrp_snapshot, price, price_display_mode, available_today, is_available, stock_status, stock_quantity, daily_availability_status, listing_review_status, image_reference_type, item_pic")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (terminalId) query = query.eq("terminal_id", terminalId);
    const { data, error } = await query;
    if (error) throw error;

    return res.json({ success: true, items: data || [] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/setup/add-master-products", async (req, res) => {
  try {
    const {
      vendor_id: vendorId,
      terminal_id: terminalId,
      actor_user_id: actorUserId,
      product_ids: productIds = [],
      defaults = {},
    } = req.body || {};

    if (!vendorId || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({ success: false, error: "Select at least one master product." });
    }

    const validation = await validateVendorTerminal(vendorId, terminalId);
    if (!validation.ok) return res.status(validation.status).json({ success: false, error: validation.error });

    const uniqueIds = [...new Set(productIds.map(clean).filter(Boolean))].slice(0, 100);
    const { data: products, error: productError } = await supabase
      .from("master_product_catalog")
      .select("id, standard_title, category, subcategory, brand_name, pack_size, common_units, image_status, mrp, is_branded, generic_image_url")
      .in("id", uniqueIds)
      .eq("is_active", true);

    if (productError) throw productError;
    if (!products?.length) {
      return res.status(404).json({ success: false, error: "No active master catalogue products matched your selection." });
    }

    let existingQuery = supabase
      .from("vendor_items")
      .select("master_product_id")
      .eq("vendor_id", vendorId)
      .in("master_product_id", products.map((product) => product.id));

    existingQuery = terminalId ? existingQuery.eq("terminal_id", terminalId) : existingQuery.is("terminal_id", null);
    const { data: existing, error: existingError } = await existingQuery;

    if (existingError) throw existingError;
    const existingProductIds = new Set((existing || []).map((item) => item.master_product_id));

    const priceMode = ["show_price", "hide_price", "market_price"].includes(defaults.price_display_mode)
      ? defaults.price_display_mode
      : "hide_price";
    const requestedMrpPolicy = ["manual", "mrp", "mrp_discount"].includes(defaults.mrp_pricing_policy)
      ? defaults.mrp_pricing_policy
      : "manual";
    const requestedDiscount = clampDiscount(defaults.mrp_discount_percent);
    const stockStatus = defaults.available_today === false ? "temporarily_unavailable" : "in_stock";

    const rows = products
      .filter((product) => !existingProductIds.has(product.id))
      .map((product) => {
        const policyAllowed = requestedMrpPolicy !== "manual" && (product.is_branded || product.brand_name || product.mrp);
        const mrpPolicy = policyAllowed ? requestedMrpPolicy : "manual";
        const autoPrice = mrpPrice(product.mrp, mrpPolicy, requestedDiscount);
        const manualPrice = numberOrNull(defaults.price) || 0;
        return {
          vendor_id: vendorId,
          terminal_id: terminalId || null,
          master_product_id: product.id,
          item_name: product.standard_title,
          generic_product_name: product.standard_title,
          brand_name: clean(defaults.brand_name) || product.brand_name || null,
          variant_name: clean(defaults.variant_name) || null,
          pack_size: numberOrNull(defaults.pack_size) || numberOrNull(product.pack_size),
          pack_unit: clean(defaults.pack_unit) || product.common_units?.[0] || null,
          mrp: numberOrNull(product.mrp),
          mrp_pricing_policy: mrpPolicy,
          mrp_discount_percent: mrpPolicy === "mrp_discount" ? requestedDiscount : 0,
          master_mrp_snapshot: numberOrNull(product.mrp),
          price: autoPrice ?? manualPrice,
          price_display_mode: autoPrice !== null ? "show_price" : priceMode,
          price_unit_label: clean(defaults.price_unit_label) || clean(defaults.pack_unit) || product.common_units?.[0] || null,
          stock_quantity: numberOrNull(defaults.stock_quantity),
          daily_stock_quantity: numberOrNull(defaults.stock_quantity),
          max_order_quantity: numberOrNull(defaults.max_order_quantity),
          available_today: defaults.available_today !== false,
          is_available: defaults.available_today !== false,
          daily_availability_status: defaults.available_today === false ? "temporarily_unavailable" : "available",
          stock_status: stockStatus,
          listing_review_status: "approved",
          image_reference_type: product.generic_image_url || product.image_status === "approved_shared_image" ? "master_shared" : "image_pending",
          item_pic: product.generic_image_url || null,
          discount_label: mrpPolicy === "mrp"
            ? "Selling at MRP"
            : mrpPolicy === "mrp_discount"
              ? `${requestedDiscount}% off MRP`
              : null,
          price_updated_at: new Date().toISOString(),
          price_updated_by: actorUserId || null,
          daily_availability_updated_at: new Date().toISOString(),
        };
      });

    if (rows.length === 0) {
      return res.json({ success: true, added_count: 0, skipped_count: products.length, items: [] });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("vendor_items")
      .insert(rows)
      .select();

    if (insertError) throw insertError;

    return res.status(201).json({
      success: true,
      added_count: inserted?.length || 0,
      skipped_count: products.length - rows.length,
      items: inserted || [],
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/setup/duplicate-check", async (req, res) => {
  try {
    const productName = clean(req.query.product_name);
    const brandName = clean(req.query.brand_name);
    const variantName = clean(req.query.variant_name);
    const packSize = clean(req.query.pack_size);
    const barcode = clean(req.query.barcode);

    if (!productName && !barcode) {
      return res.json({ success: true, matches: [] });
    }

    const search = normalize([productName, brandName, variantName, packSize, barcode].filter(Boolean).join(" "));
    const terms = search.split(" ").filter((term) => term.length >= 2).slice(0, 6);

    let query = supabase
      .from("master_product_catalog")
      .select("id, standard_title, category, subcategory, brand_name, pack_size, local_names, search_keywords, alternative_spellings, image_status")
      .eq("is_active", true)
      .limit(30);

    if (barcode) {
      query = query.or(`search_keywords.cs.{${barcode}},alternative_spellings.cs.{${barcode}}`);
    } else if (terms.length > 0) {
      query = query.or(
        terms
          .map((term) => `standard_title.ilike.%${term}%,subcategory.ilike.%${term}%,brand_name.ilike.%${term}%`)
          .join(",")
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    const matches = (data || [])
      .map((product) => {
        const haystack = normalize([
          product.standard_title,
          product.category,
          product.subcategory,
          product.brand_name,
          product.pack_size,
          ...(product.search_keywords || []),
          ...(product.alternative_spellings || []),
          ...Object.values(product.local_names || {}).flat(),
        ].join(" "));
        const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        return { ...product, duplicate_score: score };
      })
      .filter((product) => product.duplicate_score > 0 || barcode)
      .sort((a, b) => b.duplicate_score - a.duplicate_score)
      .slice(0, 10);

    return res.json({ success: true, matches });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/setup/submit-new-product", async (req, res) => {
  try {
    const {
      vendor_id: vendorId,
      terminal_id: terminalId,
      actor_user_id: actorUserId,
      product_name: productName,
      local_name: localName,
      category,
      brand_name: brandName,
      variant_name: variantName,
      pack_size: packSize,
      pack_unit: packUnit,
      description,
      price,
      price_display_mode: priceDisplayMode = "hide_price",
      available_today: availableToday = true,
      stock_quantity: stockQuantity,
      max_order_quantity: maxOrderQuantity,
      image_url: imageUrl,
      vendor_image_reuse_consent: reuseConsent = false,
      consent_terms_version: consentTermsVersion,
      barcode,
    } = req.body || {};

    if (!vendorId || !productName || !category) {
      return res.status(400).json({ success: false, error: "Vendor, product name and category are required." });
    }

    if (!ALLOWED_CATEGORIES.has(category)) {
      return res.status(400).json({ success: false, error: "Selected category is not permitted." });
    }

    const validation = await validateVendorTerminal(vendorId, terminalId);
    if (!validation.ok) return res.status(validation.status).json({ success: false, error: validation.error });

    const duplicateResponse = await fetchDuplicateCandidates({
      productName,
      brandName,
      variantName,
      packSize,
      barcode,
    });

    const itemPayload = {
      vendor_id: vendorId,
      terminal_id: terminalId || null,
      item_name: clean(productName),
      item_pic: clean(imageUrl) || null,
      image_reference_type: clean(imageUrl) ? "vendor_private" : "image_pending",
      generic_product_name: clean(productName),
      brand_name: clean(brandName) || null,
      variant_name: clean(variantName) || null,
      pack_size: numberOrNull(packSize),
      pack_unit: clean(packUnit) || null,
      barcode: clean(barcode) || null,
      price: numberOrNull(price) || 0,
      price_display_mode: ["show_price", "hide_price", "market_price"].includes(priceDisplayMode)
        ? priceDisplayMode
        : "hide_price",
      price_unit_label: clean(packUnit) || null,
      stock_quantity: numberOrNull(stockQuantity),
      daily_stock_quantity: numberOrNull(stockQuantity),
      max_order_quantity: numberOrNull(maxOrderQuantity),
      available_today: Boolean(availableToday),
      is_available: Boolean(availableToday),
      daily_availability_status: availableToday ? "available" : "temporarily_unavailable",
      stock_status: availableToday ? "in_stock" : "temporarily_unavailable",
      listing_review_status: "pending_review",
      listing_review_reason: "Vendor-created product pending master-catalogue moderation.",
      master_catalogue_status: "pending_review",
      vendor_image_reuse_consent: Boolean(reuseConsent),
      vendor_image_reuse_consented_at: reuseConsent ? new Date().toISOString() : null,
      source_type: "vendor_submission",
      price_updated_at: new Date().toISOString(),
      price_updated_by: actorUserId || null,
      daily_availability_updated_at: new Date().toISOString(),
    };

    const { data: vendorItem, error: itemError } = await supabase
      .from("vendor_items")
      .insert(itemPayload)
      .select()
      .single();

    if (itemError) throw itemError;

    const submissionPayload = {
      vendor_id: vendorId,
      terminal_id: terminalId || null,
      vendor_item_id: vendorItem.id,
      submitted_by_user_id: actorUserId || null,
      product_name: clean(productName),
      local_name: clean(localName) || null,
      category,
      brand_name: clean(brandName) || null,
      variant_name: clean(variantName) || null,
      pack_size: clean(packSize) || null,
      pack_unit: clean(packUnit) || null,
      barcode: clean(barcode) || null,
      description: clean(description) || null,
      price: numberOrNull(price),
      price_display_mode: itemPayload.price_display_mode,
      availability_status: availableToday ? "available" : "temporarily_unavailable",
      image_url: clean(imageUrl) || null,
      vendor_image_reuse_consent: Boolean(reuseConsent),
      consent_terms_version: clean(consentTermsVersion) || null,
      duplicate_candidates: duplicateResponse,
      status: "pending_review",
    };

    const { data: submission, error: submissionError } = await supabase
      .from("vendor_product_submissions")
      .insert(submissionPayload)
      .select()
      .single();

    if (!submissionError && submission?.id) {
      await supabase
        .from("vendor_items")
        .update({ master_submission_id: submission.id })
        .eq("id", vendorItem.id);
    }

    return res.status(201).json({
      success: true,
      item: vendorItem,
      submission: submissionError ? null : submission,
      duplicate_candidates: duplicateResponse,
      moderation_note: "This product is live for this vendor as pending review. It is not a company-verified master product until approved.",
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

async function fetchDuplicateCandidates({ productName, brandName, variantName, packSize, barcode }) {
  const search = normalize([productName, brandName, variantName, packSize, barcode].filter(Boolean).join(" "));
  const terms = search.split(" ").filter((term) => term.length >= 2).slice(0, 6);
  if (terms.length === 0 && !barcode) return [];

  let query = supabase
    .from("master_product_catalog")
    .select("id, standard_title, category, subcategory, brand_name, pack_size, search_keywords, alternative_spellings")
    .eq("is_active", true)
    .limit(20);

  if (terms.length > 0) {
    query = query.or(terms.map((term) => `standard_title.ilike.%${term}%,subcategory.ilike.%${term}%,brand_name.ilike.%${term}%`).join(","));
  }

  const { data } = await query;
  return (data || []).slice(0, 10);
}

export default router;
