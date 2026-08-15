import { Router, Request, Response } from "express";
import { z } from "zod";
import * as xlsx from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { genAI, geminiModel } from "../lib/gemini.js";
import { extractJsonObject } from "../lib/json.js";
import { writeGeminiAuditLog } from "../lib/auditLog.js";

// Initialize Supabase admin client for master catalogue lookup & review queue
const supabaseUrl = process.env.SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key";
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const inventoryRouter = Router();

// Validation Schemas
const visionCaptureSchema = z.object({
  imageBase64: z.string().min(20),
  mimeType: z.string().default("image/jpeg"),
  vendorId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  languageHint: z.enum(["en", "hi", "kn", "mixed"]).default("mixed"),
});

const spreadsheetSchema = z.object({
  fileBase64: z.string().min(20),
  fileName: z.string().default("catalogue.xlsx"),
  vendorId: z.string().uuid(),
});

const commitSchema = z.object({
  vendorId: z.string().uuid(),
  imageConsent: z.boolean().default(false),
  confirmedItems: z.array(
    z.object({
      productName: z.string(),
      localName: z.string().nullable().optional(),
      category: z.string().default("vegetables_fruits"),
      brand: z.string().nullable().optional(),
      variant: z.string().nullable().optional(),
      unit: z.string().default("kg"),
      price: z.number().nullable().optional(),
      displayPrice: z.boolean().default(true),
      available: z.boolean().default(true),
      matchedMasterId: z.string().uuid().nullable().optional(),
      imageUrl: z.string().nullable().optional(),
      selectedForStorefront: z.boolean().default(true),
      submitForMasterReview: z.boolean().default(false),
      sourceType: z.enum(["EXCEL", "CSV", "HANDWRITTEN_IMAGE", "SCANNED_PDF"]).default("EXCEL"),
    })
  ),
});

// Neutralize spreadsheet formula injection characters (=, +, -, @, \t, \r)
function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = String(value).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'` + str;
  }
  return str;
}

/**
 * 1. Multimodal OCR: Handwritten, Printed, or Photo Slip Capture
 * POST /api/gemini/inventory/capture
 */
inventoryRouter.post("/capture", async (req: Request, res: Response) => {
  try {
    const input = visionCaptureSchema.parse(req.body);

    const prompt = `You are the specialized inventory extraction AI for SabSewa Local.
Extract all grocery, vegetable, fruit, dairy, bakery, medicine, or general store items from this image or document.
The document may be handwritten or printed in English, Hindi (Devanagari), Kannada script, or mixed languages.

Distinguish carefully between inventory quantity, pack size, unit, and price. If price is absent, set it to null.

Return JSON in this EXACT structure:
{
  "items": [
    {
      "name": "Standardized English Name",
      "local_name": "Original Hindi or Kannada text as written",
      "category": "kirana|vegetables_fruits|dairy|medical|bakery|restaurant_pharmacy|other",
      "brand": "string or null",
      "price": number or null,
      "pack_size": "string or null",
      "unit": "kg|gram|liter|piece|packet|box|other",
      "confidence": number between 0.0 and 1.0,
      "is_handwriting_unclear": boolean
    }
  ],
  "needs_vendor_review": true,
  "notes": "string summary"
}`;

    const response = await genAI.models.generateContent({
      model: geminiModel,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.imageBase64,
              },
            },
          ],
        },
      ],
    });

    const text = response.text || "{}";
    const json = extractJsonObject(text) as { items?: any[]; notes?: string };

    const { data: masterProducts } = await supabase
      .from("master_catalogue_products")
      .select("*")
      .eq("is_active", true);

    const enrichedItems = (json.items || []).map((item: any) => {
      const match = (masterProducts || []).find((m) => {
        const canonical = m.canonical_name.toLowerCase();
        const pName = (item.name || "").toLowerCase();
        const lName = (item.local_name || "").toLowerCase();
        return (
          canonical === pName ||
          (m.hindi_name && m.hindi_name.includes(lName)) ||
          (m.kannada_name && m.kannada_name.includes(lName)) ||
          (m.aliases && m.aliases.some((a: string) => pName.includes(a.toLowerCase())))
        );
      });

      return {
        ...item,
        matchedMaster: match
          ? {
              id: match.id,
              canonicalName: match.canonical_name,
              approvedImageUrl: match.approved_image_url,
            }
          : null,
      };
    });

    const finalResponseData = {
      items: enrichedItems,
      needs_vendor_review: true,
      notes: json.notes || "Items extracted successfully.",
    };

    await writeGeminiAuditLog({
      agentType: "inventory_capture",
      inputType: "image",
      inputSummary: `Inventory multimodal image parsed with mime type ${input.mimeType}`,
      model: geminiModel,
      responseJson: finalResponseData,
      userId: input.userId ?? null,
      vendorId: input.vendorId ?? null,
    });

    return res.json({ success: true, data: finalResponseData });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return res.status(400).json({ success: false, error: message });
  }
});

/**
 * 2. Excel & CSV Spreadsheet Batch Import
 * POST /api/gemini/inventory/spreadsheet
 */
inventoryRouter.post("/spreadsheet", async (req: Request, res: Response) => {
  try {
    const input = spreadsheetSchema.parse(req.body);
    const buffer = Buffer.from(input.fileBase64, "base64");

    const workbook = xlsx.read(buffer, { type: "buffer", raw: false });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rawRows: any[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    if (rawRows.length === 0) {
      return res.status(400).json({ success: false, error: "Spreadsheet is empty." });
    }
    if (rawRows.length > 500) {
      return res.status(400).json({ success: false, error: "Max 500 rows allowed per upload batch." });
    }

    const { data: masterItems } = await supabase
      .from("master_catalogue_products")
      .select("*")
      .eq("is_active", true);

    const parsedItems: any[] = [];
    const seenNames = new Set<string>();

    for (let index = 0; index < rawRows.length; index++) {
      const row = rawRows[index];
      const rawName = sanitizeCell(
        row["Product name"] ||
          row["Product Name"] ||
          row["Item Name"] ||
          row["उत्पाद का नाम"] ||
          row["ಉತ್ಪನ್ನದ ಹೆಸರು"]
      );

      if (!rawName) continue;

      const normalizedKey = rawName.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seenNames.has(normalizedKey)) {
        parsedItems.push({
          rowNumber: index + 2,
          rawName,
          status: "INVALID",
          reason: "Duplicate row in upload file",
        });
        continue;
      }
      seenNames.add(normalizedKey);

      const localName = sanitizeCell(row["Local or regional name"] || row["Regional Name"] || "");
      const category = sanitizeCell(row["Category"] || "vegetables_fruits");
      const brand = sanitizeCell(row["Brand name"] || row["Brand"] || "");
      const variant = sanitizeCell(row["Variant"] || "");
      const unit = sanitizeCell(row["Unit"] || "kg").toLowerCase();
      const rawPrice = sanitizeCell(row["Selling price"] || row["Price"] || "");
      const price = rawPrice ? Number(rawPrice.replace(/[^0-9.]/g, "")) : null;
      const displayPrice = String(row["Display price to customer"] || "YES").toUpperCase() !== "NO";
      const available = String(row["Currently available"] || "YES").toUpperCase() !== "NO";

      const matched = (masterItems || []).find((m) => {
        const canonical = m.canonical_name.toLowerCase();
        const inputName = rawName.toLowerCase();
        return (
          canonical === inputName ||
          (m.aliases && m.aliases.some((alias: string) => inputName.includes(alias.toLowerCase())))
        );
      });

      if (matched) {
        parsedItems.push({
          rowNumber: index + 2,
          rawName,
          masterProductId: matched.id,
          canonicalName: matched.canonical_name,
          category: matched.category_slug || category,
          brand,
          variant,
          unit: unit || matched.default_unit,
          price,
          displayPrice,
          available,
          imageUrl: matched.approved_image_url,
          status: "MATCHED",
          matchConfidence: 0.98,
        });
      } else {
        parsedItems.push({
          rowNumber: index + 2,
          rawName,
          localName,
          category,
          brand,
          variant,
          unit,
          price,
          displayPrice,
          available,
          status: "UNMATCHED_NEW",
          matchConfidence: 0.0,
        });
      }
    }

    return res.json({
      success: true,
      items: parsedItems,
      summary: {
        total: parsedItems.length,
        matched: parsedItems.filter((i) => i.status === "MATCHED").length,
        unmatched: parsedItems.filter((i) => i.status === "UNMATCHED_NEW").length,
        invalid: parsedItems.filter((i) => i.status === "INVALID").length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to process spreadsheet.";
    return res.status(400).json({ success: false, error: message });
  }
});

/**
 * 3. Commit Confirmed Items to Storefront & Review Staging Queue
 * POST /api/gemini/inventory/commit
 */
inventoryRouter.post("/commit", async (req: Request, res: Response) => {
  try {
    const input = commitSchema.parse(req.body);
    const storefrontInserts: any[] = [];
    const reviewQueueInserts: any[] = [];

    for (const item of input.confirmedItems) {
      if (item.selectedForStorefront) {
        storefrontInserts.push({
          vendor_id: input.vendorId,
          master_product_id: item.matchedMasterId || null,
          product_name: item.productName,
          local_name: item.localName || null,
          brand: item.brand || null,
          variant: item.variant || null,
          category: item.category,
          unit: item.unit,
          selling_price: item.price,
          display_price: item.displayPrice,
          is_available: item.available,
          image_url: item.imageUrl || null,
          created_at: new Date().toISOString(),
        });
      }

      if (!item.matchedMasterId && item.submitForMasterReview) {
        reviewQueueInserts.push({
          vendor_id: input.vendorId,
          suggested_name: item.productName,
          suggested_hindi_name: item.localName || null,
          suggested_category: item.category,
          suggested_brand: item.brand || null,
          suggested_unit: item.unit,
          proposed_image_url: item.imageUrl || null,
          vendor_image_consent: input.imageConsent,
          raw_source_type: item.sourceType,
          status: "PENDING_REVIEW",
          created_at: new Date().toISOString(),
        });
      }
    }

    if (storefrontInserts.length > 0) {
      const { error: storeErr } = await supabase.from("vendor_products").insert(storefrontInserts);
      if (storeErr) throw storeErr;
    }

    if (reviewQueueInserts.length > 0) {
      const { error: reviewErr } = await supabase
        .from("master_catalogue_review_queue")
        .insert(reviewQueueInserts);
      if (reviewErr) throw reviewErr;
    }

    return res.json({
      success: true,
      message: `Published ${storefrontInserts.length} items to storefront.`,
      reviewQueued: reviewQueueInserts.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to commit items.";
    return res.status(400).json({ success: false, error: message });
  }
});

/**
 * 4. Get Master Catalogue Review Queue Items (Admin Only)
 * GET /api/gemini/inventory/review-queue
 */
inventoryRouter.get("/review-queue", async (_req: Request, res: Response) => {
  try {
    const { data: items, error } = await supabase
      .from("master_catalogue_review_queue")
      .select("*")
      .eq("status", "PENDING_REVIEW")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json({ success: true, items: items || [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load review queue.";
    return res.status(500).json({ success: false, error: message });
  }
});

/**
 * 5. Update Review Queue Item Status (Approve/Reject)
 * POST /api/gemini/inventory/review-queue/:id
 */
inventoryRouter.post("/review-queue/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    if (!["APPROVED", "REJECTED"].includes(action)) {
      return res.status(400).json({ success: false, error: "Invalid action. Must be APPROVED or REJECTED." });
    }

    const { data: item, error: fetchErr } = await supabase
      .from("master_catalogue_review_queue")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !item) {
      return res.status(404).json({ success: false, error: "Queue item not found." });
    }

    if (action === "APPROVED") {
      await supabase.from("master_catalogue_products").insert({
        canonical_name: item.suggested_name,
        hindi_name: item.suggested_hindi_name || null,
        category_slug: item.suggested_category,
        default_unit: item.suggested_unit,
        approved_image_url: item.vendor_image_consent ? item.proposed_image_url : null,
      });
    }

    await supabase
      .from("master_catalogue_review_queue")
      .update({
        status: action,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    return res.json({ success: true, message: `Proposal ${action.toLowerCase()} successfully.` });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update review item.";
    return res.status(500).json({ success: false, error: message });
  }
});