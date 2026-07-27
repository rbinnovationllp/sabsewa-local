import { Router } from "express";
import { z } from "zod";
import { genAI, geminiModel } from "../lib/gemini.js";
import { extractJsonObject } from "../lib/json.js";
import { writeGeminiAuditLog } from "../lib/auditLog.js";

const requestSchema = z.object({
  orderId: z.string().uuid(),
  vendorId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  vendorReason: z.string().min(2),
  customerLanguage: z.string().default("en"),
  unavailableItems: z.array(z.string()).default([])
});

export const rejectionRouter = Router();

rejectionRouter.post("/message", async (req, res) => {
  try {
    const input = requestSchema.parse(req.body);

    const prompt = `You are the Gemini smart rejection and support agent for SabSewa Local.
A local shop vendor cannot fulfill an order.
Create a friendly customer message in the requested language and suggest next steps.
Do not blame the vendor. Keep it short and respectful.
Return only JSON with:
{
  "customer_message": "string",
  "vendor_audit_summary": "string",
  "suggested_next_steps": ["string"],
  "tone": "polite",
  "confidence": number
}

Vendor reason: ${input.vendorReason}
Unavailable items: ${input.unavailableItems.join(", ") || "not specified"}
Customer language: ${input.customerLanguage}`;

    const response = await genAI.models.generateContent({
      model: geminiModel,
      contents: prompt
    });

    const json = extractJsonObject(response.text || "{}");

    await writeGeminiAuditLog({
      agentType: "smart_rejection",
      inputType: "text",
      inputSummary: input.vendorReason,
      model: geminiModel,
      responseJson: json,
      userId: input.userId ?? null,
      vendorId: input.vendorId ?? null,
      orderId: input.orderId
    });

    res.json({ success: true, data: json });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ success: false, error: message });
  }
});

