import { Router } from "express";
import { z } from "zod";
import { genAI, geminiModel } from "../lib/gemini.js";
import { extractJsonObject } from "../lib/json.js";
import { writeGeminiAuditLog } from "../lib/auditLog.js";

const requestSchema = z.object({
  imageBase64: z.string().min(100),
  mimeType: z.string().default("image/jpeg"),
  vendorId: z.string().uuid().optional(),
  userId: z.string().uuid().optional()
});

export const inventoryRouter = Router();

inventoryRouter.post("/capture", async (req, res) => {
  try {
    const input = requestSchema.parse(req.body);

    const prompt = `You are the Gemini inventory capture agent for SabSewa Local.
Extract products from the vendor image into strict JSON.
Return only JSON with:
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
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.imageBase64
              }
            }
          ]
        }
      ]
    });

    const text = response.text || "{}";
    const json = extractJsonObject(text);

    await writeGeminiAuditLog({
      agentType: "inventory_capture",
      inputType: "image",
      inputSummary: `Inventory image received with mime type ${input.mimeType}`,
      model: geminiModel,
      responseJson: json,
      userId: input.userId ?? null,
      vendorId: input.vendorId ?? null
    });

    res.json({ success: true, data: json });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ success: false, error: message });
  }
});

