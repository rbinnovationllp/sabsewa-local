import express from "express";
import crypto from "crypto";
import { genAI, geminiModel, geminiTranslationModel } from "./geminiClient.js";
import { extractJsonObject } from "./json.js";
import { writeGeminiAuditLog } from "./auditLog.js";
import { supabase } from "../connection.js";

const router = express.Router();

const TRANSLATION_VERSION = process.env.GEMINI_TRANSLATION_VERSION || "2026-07-30";
const MAX_TRANSLATION_INPUT_CHARS = Number(process.env.GEMINI_TRANSLATION_MAX_INPUT_CHARS || 1200);
const MAX_TRANSLATION_OUTPUT_TOKENS = Number(process.env.GEMINI_TRANSLATION_MAX_OUTPUT_TOKENS || 512);
const DYNAMIC_TRANSLATION_TYPES = new Set([
  "product_description",
  "customer_note",
  "vendor_response",
  "substitution_explanation",
  "support_message",
  "catalog_synonym",
  "order_interpretation",
]);

function normaliseText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function redactSensitiveText(text) {
  return normaliseText(text)
    .replace(/\b\d{6}\b/g, "[PIN_REDACTED]")
    .replace(/\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, "[PHONE_REDACTED]")
    .replace(/\b(?:otp|password|token|razorpay|payment|upi|card|cvv)\s*[:#-]?\s*\S+/gi, "[SENSITIVE_REDACTED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL_REDACTED]");
}

function estimateTranslationCost({ inputChars, outputChars }) {
  const estimatedTokens = Math.ceil((Number(inputChars || 0) + Number(outputChars || 0)) / 4);
  const costInr = estimatedTokens * Number(process.env.GEMINI_TRANSLATION_ESTIMATED_INR_PER_TOKEN || 0.00003);
  return { estimatedTokens, costInr: Number(costInr.toFixed(6)) };
}

function protectStructuredCommerceData(source, translated) {
  const protectedPatterns = [
    /\u20b9\s?\d+(?:\.\d+)?/g,
    /\b\d+(?:\.\d+)?\s?(?:kg|g|gram|grams|litre|liter|l|ml|piece|packet|pack|dozen)\b/gi,
    /\b[A-Z0-9]{8,}\b/g,
  ];
  for (const pattern of protectedPatterns) {
    const sourceMatches = source.match(pattern) || [];
    for (const value of sourceMatches) {
      if (!translated.includes(value)) return false;
    }
  }
  return true;
}

router.post("/inventory/capture", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg", vendorId, userId } = req.body;

    if (!imageBase64 || String(imageBase64).length < 100) {
      return res.status(400).json({ success: false, error: "Inventory image is required." });
    }

    const prompt = `You are the Gemini inventory capture agent for SabSewa Local.
Extract products from a local shop shelf, invoice, or handwritten list into strict JSON.
Return only JSON:
{
  "items": [
    {
      "name": "string",
      "category": "kirana|vegetable|fruit|dairy|medical|bakery|restaurant|tiffin|other",
      "price": number|null,
      "quantity": number|null,
      "unit": "kg|gram|liter|piece|packet|box|other|null",
      "confidence": number
    }
  ],
  "needs_vendor_review": true,
  "notes": "string"
}`;

    const response = await genAI.models.generateContent({
      model: geminiModel,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: imageBase64 } },
          ],
        },
      ],
    });

    const result = extractJsonObject(response.text || "{}");
    const auditLogId = await writeGeminiAuditLog({
      agentType: "inventory_capture",
      inputType: "image",
      inputSummary: `Inventory image received with mime type ${mimeType}`,
      model: geminiModel,
      responseJson: result,
      userId,
      vendorId,
    });

    return res.json({ success: true, data: result, audit_log_id: auditLogId, model: geminiModel });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Gemini inventory capture failed.",
    });
  }
});

router.post("/order/parse", async (req, res) => {
  try {
    const { orderText, languageHint, userId, vendorId } = req.body;

    if (!orderText || String(orderText).trim().length < 2) {
      return res.status(400).json({ success: false, error: "Order text is required." });
    }

    const prompt = `You are the Gemini conversational ordering agent for SabSewa Local.
Convert this customer request into a structured cart for real-world local services and goods.
Support Hindi, English, Hinglish, and Indian local-language grocery/service ordering.
Return only JSON:
{
  "language": "string",
  "items": [
    {
      "name": "normalized English item name",
      "local_name": "customer/local item name",
      "quantity": number,
      "unit": "kg|gram|liter|piece|packet|box|other",
      "confidence": number
    }
  ],
  "missing_clarifications": ["string"]
}

Customer order: ${String(orderText)}
Language hint: ${languageHint || "unknown"}`;

    const response = await genAI.models.generateContent({
      model: geminiModel,
      contents: prompt,
    });

    const result = extractJsonObject(response.text || "{}");
    const auditLogId = await writeGeminiAuditLog({
      agentType: "conversational_order",
      inputType: "text",
      inputSummary: String(orderText).slice(0, 500),
      model: geminiModel,
      responseJson: result,
      userId,
      vendorId,
    });

    return res.json({ success: true, data: result, audit_log_id: auditLogId, model: geminiModel });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Gemini order parsing failed.",
    });
  }
});

router.post("/rejection/message", async (req, res) => {
  try {
    const {
      orderId,
      vendorId,
      userId,
      vendorReason,
      customerLanguage = "en",
      unavailableItems = [],
    } = req.body;

    if (!orderId || !vendorReason || String(vendorReason).trim().length < 2) {
      return res.status(400).json({ success: false, error: "Order id and rejection reason are required." });
    }

    const prompt = `You are the Gemini smart rejection and customer support agent for SabSewa Local.
A local vendor cannot fulfill a real-world physical-service/local-goods order.
Create a friendly customer message in the requested language and suggest practical next steps.
Do not blame the vendor. Keep it short, respectful, and useful.
Return only JSON:
{
  "customer_message": "string",
  "vendor_audit_summary": "string",
  "suggested_next_steps": ["string"],
  "tone": "polite",
  "confidence": number
}

Vendor reason: ${String(vendorReason)}
Unavailable items: ${Array.isArray(unavailableItems) ? unavailableItems.join(", ") : "not specified"}
Customer language: ${customerLanguage}`;

    const response = await genAI.models.generateContent({
      model: geminiModel,
      contents: prompt,
    });

    const result = extractJsonObject(response.text || "{}");
    const auditLogId = await writeGeminiAuditLog({
      agentType: "smart_rejection",
      inputType: "text",
      inputSummary: String(vendorReason).slice(0, 500),
      model: geminiModel,
      responseJson: result,
      userId,
      vendorId,
      orderId,
    });

    return res.json({ success: true, data: result, audit_log_id: auditLogId, model: geminiModel });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Gemini rejection message failed.",
    });
  }
});

router.post("/translation/dynamic", async (req, res) => {
  const startedAt = Date.now();
  try {
    const {
      text,
      sourceLanguage = "auto",
      targetLanguage,
      contentType = "customer_note",
      userId,
      vendorId,
      orderId,
      allowPersonalTextCache = false,
    } = req.body;

    const sourceText = normaliseText(text);
    if (!sourceText) {
      return res.status(400).json({ success: false, error: "Text is required." });
    }
    if (!targetLanguage || targetLanguage === sourceLanguage || targetLanguage === "en") {
      return res.json({ success: true, data: { translated_text: sourceText, fallback: false }, cache_hit: true });
    }
    if (!DYNAMIC_TRANSLATION_TYPES.has(contentType)) {
      return res.status(400).json({ success: false, error: "Unsupported dynamic translation content type." });
    }
    if (sourceText.length > MAX_TRANSLATION_INPUT_CHARS) {
      return res.status(413).json({ success: false, error: "Text is too long for dynamic translation." });
    }

    const redactedText = redactSensitiveText(sourceText);
    const sourceTextHash = hashText(redactedText.toLowerCase());

    if (!allowPersonalTextCache) {
      const { data: cached } = await supabase
        .from("gemini_translation_cache")
        .select("translated_text, model_name")
        .eq("source_text_hash", sourceTextHash)
        .eq("source_language", sourceLanguage)
        .eq("target_language", targetLanguage)
        .eq("content_type", contentType)
        .eq("translation_version", TRANSLATION_VERSION)
        .eq("is_approved", true)
        .maybeSingle();

      if (cached?.translated_text) {
        await supabase.from("gemini_translation_usage").insert({
          user_id: userId || null,
          vendor_id: vendorId || null,
          order_id: orderId || null,
          source_language: sourceLanguage,
          target_language: targetLanguage,
          content_type: contentType,
          model_name: cached.model_name || geminiTranslationModel,
          cache_hit: true,
          input_chars: redactedText.length,
          output_chars: cached.translated_text.length,
          estimated_tokens: 0,
          estimated_cost_inr: 0,
          latency_ms: Date.now() - startedAt,
          source_text_hash: sourceTextHash,
          privacy_redacted: true,
          validation_status: "cache_hit",
        });

        await writeGeminiAuditLog({
          agentType: "dynamic_translation",
          inputType: "text",
          inputSummary: `cache-hit ${contentType} ${sourceLanguage}->${targetLanguage}`,
          model: cached.model_name || geminiTranslationModel,
          responseJson: { sourceLanguage, targetLanguage, contentType, cache_hit: true },
          userId,
          vendorId,
          orderId,
          metadata: { privacy_redacted: true, source_text_hash: sourceTextHash },
        });
        return res.json({
          success: true,
          data: { translated_text: cached.translated_text, fallback: false },
          cache_hit: true,
          model: cached.model_name || geminiTranslationModel,
        });
      }
    }

    const prompt = `Translate only this dynamic marketplace text.
Return strict JSON: {"translated_text":"string","source_language":"string","target_language":"string","notes":"string"}
Rules:
- Preserve product IDs, order numbers, prices, quantities, units, brand names, pack sizes, barcodes and payment references exactly.
- Do not add facts, prices, availability or legal wording.
- If uncertain, keep the original term in brackets.
- The text is privacy-redacted; do not reconstruct private information.
Source language: ${sourceLanguage}
Target language: ${targetLanguage}
Content type: ${contentType}
Text: ${redactedText}`;

    const response = await genAI.models.generateContent({
      model: geminiTranslationModel,
      contents: prompt,
      config: {
        maxOutputTokens: MAX_TRANSLATION_OUTPUT_TOKENS,
        temperature: 0.2,
      },
    });

    const result = extractJsonObject(response.text || "{}");
    const translatedText = normaliseText(result.translated_text || "");
    if (!translatedText) throw new Error("Gemini did not return translated text.");
    if (!protectStructuredCommerceData(redactedText, translatedText)) {
      throw new Error("Translation failed structured commerce validation.");
    }

    const usage = estimateTranslationCost({
      inputChars: redactedText.length,
      outputChars: translatedText.length,
    });

    if (!allowPersonalTextCache) {
      await supabase.from("gemini_translation_cache").upsert(
        {
          source_text_hash: sourceTextHash,
          source_language: sourceLanguage,
          target_language: targetLanguage,
          content_type: contentType,
          model_name: geminiTranslationModel,
          translation_version: TRANSLATION_VERSION,
          translated_text: translatedText,
          is_approved: true,
          metadata: {
            privacy_redacted: true,
            input_chars: redactedText.length,
            output_chars: translatedText.length,
          },
        },
        { onConflict: "source_text_hash,source_language,target_language,content_type,model_name,translation_version" }
      );
    }

    await supabase.from("gemini_translation_usage").insert({
      user_id: userId || null,
      vendor_id: vendorId || null,
      order_id: orderId || null,
      source_language: sourceLanguage,
      target_language: targetLanguage,
      content_type: contentType,
      model_name: geminiTranslationModel,
      cache_hit: false,
      input_chars: redactedText.length,
      output_chars: translatedText.length,
      estimated_tokens: usage.estimatedTokens,
      estimated_cost_inr: usage.costInr,
      latency_ms: Date.now() - startedAt,
      source_text_hash: sourceTextHash,
      privacy_redacted: true,
      validation_status: "passed",
    });

    const auditLogId = await writeGeminiAuditLog({
      agentType: "dynamic_translation",
      inputType: "text",
      inputSummary: `${contentType} ${sourceLanguage}->${targetLanguage}; hash ${sourceTextHash.slice(0, 12)}`,
      model: geminiTranslationModel,
      responseJson: {
        sourceLanguage,
        targetLanguage,
        contentType,
        cache_hit: false,
        validation_status: "passed",
        estimated_cost_inr: usage.costInr,
      },
      userId,
      vendorId,
      orderId,
      metadata: { privacy_redacted: true, source_text_hash: sourceTextHash, latency_ms: Date.now() - startedAt },
    });

    return res.json({
      success: true,
      data: { translated_text: translatedText, fallback: false },
      cache_hit: false,
      audit_log_id: auditLogId,
      model: geminiTranslationModel,
      usage,
    });
  } catch (error) {
    return res.status(200).json({
      success: false,
      error: error instanceof Error ? error.message : "Dynamic translation failed.",
      data: { translated_text: normaliseText(req.body?.text || ""), fallback: true },
      cache_hit: false,
    });
  }
});

export default router;
