import express from "express";
import sharp from "sharp";
import { supabase } from "../connection.js";
import { KYC_STORAGE_BUCKET } from "../vendor/kycService.js";

const router = express.Router();

const MAX_RADIUS_M = 1000;
const FIRST_RADIUS_M = 500;

function toRad(value) {
  return (Number(value) * Math.PI) / 180;
}

function distanceMeters(aLat, aLng, bLat, bLng) {
  const earthRadiusM = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthRadiusM * Math.asin(Math.sqrt(h));
}

function categoryMatches(vendorCategory, requestedCategory) {
  if (!requestedCategory) return true;
  const vendor = String(vendorCategory || "").toLowerCase();
  const requested = String(requestedCategory || "").toLowerCase();
  if (requested === "grocery" || requested === "kirana") return ["grocery", "kirana"].includes(vendor);
  if (requested === "restaurant" || requested === "tiffin") return ["restaurant", "tiffin"].includes(vendor);
  return vendor.includes(requested) || requested.includes(vendor);
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f\u0c80-\u0cff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenLocalNames(localNames) {
  if (!localNames || typeof localNames !== "object") return [];
  return Object.values(localNames).flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean);
}

function productSearchHaystack(item, masterProduct) {
  return normalizeSearchText([
    item.item_name,
    item.generic_product_name,
    item.brand_name,
    item.manufacturer,
    item.variant_name,
    item.pack_size,
    item.pack_unit,
    item.unit,
    item.barcode,
    item.sku,
    item.ean,
    masterProduct?.standard_title,
    masterProduct?.category,
    masterProduct?.subcategory,
    masterProduct?.brand_name,
    masterProduct?.pack_size,
    ...(masterProduct?.common_units || []),
    ...(masterProduct?.search_keywords || []),
    ...(masterProduct?.alternative_spellings || []),
    ...flattenLocalNames(masterProduct?.local_names),
  ].filter(Boolean).join(" "));
}

function preferredLocalName(localNames, language) {
  if (!localNames || typeof localNames !== "object") return null;
  const value = localNames[language];
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function enrichItemForCustomer(item, masterProduct, language) {
  const localNames = masterProduct?.local_names || {};
  return {
    ...item,
    master_product_id: item.master_product_id || null,
    master_standard_title: masterProduct?.standard_title || null,
    category: masterProduct?.category || item.category || null,
    subcategory: masterProduct?.subcategory || null,
    local_names: localNames,
    local_name: preferredLocalName(localNames, language),
    hindi_name: preferredLocalName(localNames, "hi"),
    kannada_name: preferredLocalName(localNames, "kn"),
    search_keywords: masterProduct?.search_keywords || [],
    alternative_spellings: masterProduct?.alternative_spellings || [],
    master_image_url: masterProduct?.generic_image_url || null,
  };
}


function publicVendorPhotoPath(vendorId) {
  return `/api/discovery/vendors/${vendorId}/profile-photo`;
}

async function latestApprovedOwnerShopPhoto(vendorId) {
  const { data, error } = await supabase
    .from("vendor_kyc_documents")
    .select("id, vendor_id, document_type, status, storage_bucket, storage_path, mime_type, file_name, metadata, created_at")
    .eq("vendor_id", vendorId)
    .eq("document_type", "owner_shop_photo")
    .eq("status", "verified")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function streamCustomerSafeOwnerShopPhoto(req, res) {
  const vendorId = String(req.params.vendor_id || "").trim();
  if (!vendorId) {
    return res.status(400).json({ success: false, error: "Vendor id is required." });
  }

  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("id, status, kyc_status, onboarding_payment_status")
    .eq("id", vendorId)
    .maybeSingle();

  if (vendorError) throw vendorError;
  if (
    !vendor ||
    vendor.status !== "active" ||
    vendor.kyc_status !== "kyc_verified" ||
    vendor.onboarding_payment_status !== "payment_completed"
  ) {
    return res.status(404).json({ success: false, error: "Verified vendor photo is not available." });
  }

  const documentRow = await latestApprovedOwnerShopPhoto(vendorId);
  if (!documentRow?.storage_path) {
    return res.status(404).json({ success: false, error: "Verified vendor photo is not available." });
  }

  const bucket = documentRow.storage_bucket || KYC_STORAGE_BUCKET;
  const { data: fileData, error: downloadError } = await supabase.storage
    .from(bucket)
    .download(documentRow.storage_path);

  if (downloadError || !fileData) {
    console.error("Customer vendor photo download failed", {
      vendor_id: vendorId,
      document_id: documentRow.id,
      bucket,
      message: downloadError?.message || String(downloadError || "No file data"),
    });
    return res.status(404).json({ success: false, error: "Verified vendor photo is not available." });
  }

  const sourceBuffer = Buffer.from(await fileData.arrayBuffer());
  const outputBuffer = await sharp(sourceBuffer)
    .resize({ width: 900, height: 620, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78, progressive: true })
    .toBuffer();

  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.send(outputBuffer);
}
function rankVendor(a, b) {
  if (a.distance_m !== b.distance_m) return a.distance_m - b.distance_m;
  if (a.open_now !== b.open_now) return a.open_now ? -1 : 1;
  if (a.available_product_count !== b.available_product_count) {
    return b.available_product_count - a.available_product_count;
  }
  if (Number(a.rating || 0) !== Number(b.rating || 0)) return Number(b.rating || 0) - Number(a.rating || 0);
  return Number(a.estimated_fulfilment_minutes || 999) - Number(b.estimated_fulfilment_minutes || 999);
}

function vendorCard({ vendor, terminal, items, distanceM, language }) {
  const terminalFulfilment = terminal.estimated_fulfilment_minutes;
  return {
    id: vendor.id,
    public_vendor_id: vendor.public_vendor_id,
    terminal_id: terminal.id,
    public_terminal_id: terminal.public_terminal_id,
    shop_name: vendor.shop_name,
    category: vendor.category,
    locality: vendor.locality_code || terminal.city || null,
    distance_m: Math.round(distanceM),
    distance_label: distanceM < 1000 ? `${Math.round(distanceM)} m` : `${(distanceM / 1000).toFixed(1)} km`,
    open_now: vendor.status === "active" && terminal.status === "active" && terminal.is_open_today !== false,
    verified_vendor: vendor.public_verification_badge === true,
    profile_photo_url: publicVendorPhotoPath(vendor.id),
    verification_status: vendor.kyc_status || "kyc_not_started",
    operating_hours: terminal.operating_hours || {},
    delivery_available: terminal.delivery_available !== false && vendor.delivery_available !== false,
    pickup_available: terminal.pickup_available !== false && vendor.pickup_available !== false,
    delivery_terms: vendor.delivery_terms || "Payment and delivery terms are confirmed directly with the vendor.",
    rating: Number(vendor.rating || 0),
    rating_count: Number(vendor.rating_count || 0),
    estimated_fulfilment_minutes: terminalFulfilment || vendor.estimated_fulfilment_minutes || 45,
    available_product_count: items.length,
    available_products: items.slice(0, 50).map((item) => ({
      id: item.id,
      item_name: item.item_name,
      generic_product_name: item.generic_product_name || item.item_name,
      master_product_id: item.master_product_id || null,
      master_standard_title: item.master_standard_title || null,
      local_names: item.local_names || {},
      local_name: item.local_name || null,
      hindi_name: item.hindi_name || null,
      kannada_name: item.kannada_name || null,
      search_keywords: item.search_keywords || [],
      alternative_spellings: item.alternative_spellings || [],
      brand_name: item.brand_name || null,
      manufacturer: item.manufacturer || null,
      variant_name: item.variant_name || null,
      pack_size: item.pack_size || null,
      pack_unit: item.pack_unit || item.price_unit_label || item.unit || null,
      mrp: item.mrp == null ? null : Number(item.mrp),
      mrp_pricing_policy: item.mrp_pricing_policy || "manual",
      mrp_discount_percent: item.mrp_discount_percent == null ? 0 : Number(item.mrp_discount_percent),
      barcode: item.barcode || item.ean || item.sku || null,
      stock_status: item.stock_status || "in_stock",
      daily_availability_status: item.daily_availability_status || "available",
      expected_restock_at: item.expected_restock_at || null,
      price: item.price_display_mode === "show_price" ? Number(item.price || 0) : null,
      price_display_mode: item.price_display_mode || "show_price",
      price_label: item.price_display_mode === "hide_price" || item.price_display_mode === "market_price"
        ? "Price confirmation required from vendor"
        : item.price == null || Number(item.price) <= 0
          ? "Price available from shop"
          : `Rs ${Number(item.price).toFixed(2)}${item.price_unit_label ? `/${item.price_unit_label}` : ""}`,
      unit: item.unit || null,
      price_unit_label: item.price_unit_label || null,
      item_pic: item.item_pic || null,
      master_image_url: item.master_image_url || null,
    })),
  };
}


router.get("/vendors/:vendor_id/profile-photo", async (req, res) => {
  try {
    return await streamCustomerSafeOwnerShopPhoto(req, res);
  } catch (error) {
    console.error("Customer vendor photo route failed", {
      vendor_id: req.params.vendor_id,
      message: error?.message || String(error),
    });
    return res.status(500).json({ success: false, error: "Verified vendor photo is temporarily unavailable." });
  }
});
router.get("/vendors", async (req, res) => {
  try {
    const category = String(req.query.category || "").trim();
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const pincode = String(req.query.pincode || "").trim();
    const locality = String(req.query.locality || "").trim();
    const productQuery = String(req.query.q || req.query.search || "").trim();
    const language = String(req.query.language || "en").trim().toLowerCase();
    const normalizedProductQuery = normalizeSearchText(productQuery);

    if ((!Number.isFinite(lat) || !Number.isFinite(lng)) && !pincode && !locality) {
      return res.status(400).json({
        success: false,
        error: "Location permission or manual PIN/locality is required.",
      });
    }

    const { data: vendors, error: vendorError } = await supabase
      .from("vendors")
      .select("id, public_vendor_id, shop_name, category, status, kyc_status, onboarding_payment_status, public_verification_badge, delivery_available, pickup_available, delivery_terms, rating, rating_count, estimated_fulfilment_minutes, max_service_radius_m, city_code, locality_code, address")
      .eq("status", "active")
      .eq("kyc_status", "kyc_verified")
      .eq("onboarding_payment_status", "payment_completed");

    if (vendorError) throw vendorError;

    const filteredVendors = (vendors || []).filter((vendor) => categoryMatches(vendor.category, category));
    const vendorIds = filteredVendors.map((vendor) => vendor.id);

    if (vendorIds.length === 0) {
      return res.json({ success: true, search_radius_m: MAX_RADIUS_M, expanded: true, vendors: [] });
    }

    const [{ data: terminals, error: terminalError }, { data: items, error: itemError }] = await Promise.all([
      supabase
        .from("vendor_terminals")
        .select("id, vendor_id, public_terminal_id, terminal_name, status, billing_status, is_open_today, operating_hours, delivery_available, pickup_available, estimated_fulfilment_minutes, lat, lng, city, phone")
        .in("vendor_id", vendorIds)
        .eq("status", "active"),
      supabase
        .from("vendor_items")
        .select("id, vendor_id, terminal_id, master_product_id, item_name, item_pic, price, price_display_mode, price_unit_label, unit, is_available, available_today, stock_status, daily_availability_status, expected_restock_at, generic_product_name, brand_name, manufacturer, variant_name, pack_size, pack_unit, mrp, mrp_pricing_policy, mrp_discount_percent, barcode, sku, ean")
        .in("vendor_id", vendorIds)
        .eq("is_available", true)
        .eq("available_today", true)
        .neq("stock_status", "out_of_stock")
        .not("daily_availability_status", "in", "(temporarily_unavailable,out_of_stock)"),
    ]);

    if (terminalError) throw terminalError;
    if (itemError) throw itemError;

    const masterIds = [...new Set((items || []).map((item) => item.master_product_id).filter(Boolean))];
    let masterById = new Map();
    if (masterIds.length > 0) {
      const { data: masterProducts, error: masterError } = await supabase
        .from("master_product_catalog")
        .select("id, standard_title, category, subcategory, generic_image_url, local_names, common_units, brand_name, pack_size, search_keywords, alternative_spellings")
        .in("id", masterIds);
      if (masterError) throw masterError;
      masterById = new Map((masterProducts || []).map((product) => [product.id, product]));
    }

    const vendorById = new Map(filteredVendors.map((vendor) => [vendor.id, vendor]));
    const itemsByTerminal = new Map();
    for (const item of items || []) {
      const masterProduct = item.master_product_id ? masterById.get(item.master_product_id) : null;
      const enrichedItem = enrichItemForCustomer(item, masterProduct, language);
      if (normalizedProductQuery && !productSearchHaystack(enrichedItem, masterProduct).includes(normalizedProductQuery)) {
        continue;
      }
      const key = item.terminal_id || "vendor:" + item.vendor_id;
      const current = itemsByTerminal.get(key) || [];
      current.push(enrichedItem);
      itemsByTerminal.set(key, current);
    }

    const allCards = [];
    for (const terminal of terminals || []) {
      if (terminal.billing_status && terminal.billing_status !== "active") continue;
      const vendor = vendorById.get(terminal.vendor_id);
      if (!vendor) continue;

      const terminalItems = itemsByTerminal.get(terminal.id) || itemsByTerminal.get("vendor:" + terminal.vendor_id) || [];
      if (terminalItems.length === 0) continue;

      let distanceM = 0;
      if (Number.isFinite(lat) && Number.isFinite(lng) && terminal.lat && terminal.lng) {
        distanceM = distanceMeters(lat, lng, Number(terminal.lat), Number(terminal.lng));
        const vendorMaxRadius = Math.min(Number(vendor.max_service_radius_m || MAX_RADIUS_M), MAX_RADIUS_M);
        if (distanceM > vendorMaxRadius) continue;
      } else if (pincode || locality) {
        const cityText = String(terminal.city || vendor.city_code || "").toLowerCase();
        const addressText = String(vendor.address || "").toLowerCase();
        const localityText = locality.toLowerCase();
        if (localityText && !cityText.includes(localityText) && !addressText.includes(localityText)) continue;
        distanceM = MAX_RADIUS_M;
      }

      allCards.push(vendorCard({ vendor, terminal, items: terminalItems, distanceM, language }));
    }

    const within500 = allCards.filter((vendor) => vendor.distance_m <= FIRST_RADIUS_M);
    const result = (within500.length > 0 ? within500 : allCards.filter((vendor) => vendor.distance_m <= MAX_RADIUS_M))
      .sort(rankVendor);

    return res.json({
      success: true,
      search_radius_m: within500.length > 0 ? FIRST_RADIUS_M : MAX_RADIUS_M,
      expanded: within500.length === 0,
      vendors: result,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/unserved-area-leads", async (req, res) => {
  try {
    const {
      customer_id,
      category,
      locality,
      pincode,
      city,
      lat,
      lng,
      consent_given,
      requested_button,
      requested_items,
    } = req.body;

    if (!category) {
      return res.status(400).json({ success: false, error: "Category is required." });
    }

    if (!consent_given) {
      return res.status(400).json({ success: false, error: "Customer consent is required before saving a recruitment lead." });
    }

    const cleanLat = Number.isFinite(Number(lat)) ? Number(lat) : null;
    const cleanLng = Number.isFinite(Number(lng)) ? Number(lng) : null;

    let existingQuery = supabase
      .from("unserved_area_leads")
      .select("*")
      .eq("category", category);

    existingQuery = pincode ? existingQuery.eq("pincode", pincode) : existingQuery.is("pincode", null);
    existingQuery = locality ? existingQuery.eq("locality", locality) : existingQuery.is("locality", null);

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      const buttons = Array.isArray(existing.requested_buttons) ? existing.requested_buttons : [];
      const { data, error } = await supabase
        .from("unserved_area_leads")
        .update({
          customer_count: Number(existing.customer_count || 1) + 1,
          last_requested_at: new Date().toISOString(),
          requested_buttons: [...buttons, requested_button || "notify_me"],
          metadata: {
            ...(existing.metadata || {}),
            latest_requested_items: requested_items || null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) throw error;
      return res.json({ success: true, lead: data });
    }

    const { data, error } = await supabase
      .from("unserved_area_leads")
      .insert({
        customer_id: customer_id || null,
        category,
        locality: locality || null,
        pincode: pincode || null,
        city: city || null,
        lat: cleanLat,
        lng: cleanLng,
        search_radius_m: MAX_RADIUS_M,
        consent_given: true,
        requested_buttons: [requested_button || "notify_me"],
        metadata: {
          privacy_note: "Exact address intentionally not stored for vendor recruitment.",
          requested_items: requested_items || null,
        },
      })
      .select()
      .single();

    if (error) throw error;
    return res.status(201).json({ success: true, lead: data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
