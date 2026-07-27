import { Router } from "express";
import { z } from "zod";
import { genAI, geminiModel } from "../lib/gemini.js";
import { extractJsonObject } from "../lib/json.js";
import { writeGeminiAuditLog } from "../lib/auditLog.js";

const requestSchema = z.object({
  orderText: z.string().min(2),
  languageHint: z.string().optional(),
  userId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional()
});

export const orderRouter = Router();

orderRouter.post("/parse", async (req, res) => {
  try {
    const input = requestSchema.parse(req.body);

    const prompt = `You are the Gemini conversational ordering agent for SabSewa Local.
Convert this customer order into a structured cart.
Support Hindi, English, Hinglish, and Indian local-language grocery ordering.
Return only JSON with:
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

Customer order:
${input.orderText}

Language hint: ${input.languageHint || "unknown"}`;

    const response = await genAI.models.generateContent({
      model: geminiModel,
      contents: prompt
    });

    const json = extractJsonObject(response.text || "{}");

    await writeGeminiAuditLog({
      agentType: "conversational_order",
      inputType: "text",
      inputSummary: input.orderText.slice(0, 500),
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

