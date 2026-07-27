import express from "express";
import { genAI, geminiModel } from "./geminiClient.js";
import { extractJsonObject } from "./json.js";
import { writeGeminiAuditLog } from "./auditLog.js";

const router = express.Router();

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

export default router;
