import { supabaseAdmin } from "./supabaseAdmin.js";

export type GeminiAgentType =
  | "inventory_capture"
  | "conversational_order"
  | "smart_rejection";

export async function writeGeminiAuditLog(input: {
  agentType: GeminiAgentType;
  inputType: "image" | "text" | "voice";
  inputSummary: string;
  model: string;
  responseJson: unknown;
  confidence?: number | null;
  userId?: string | null;
  vendorId?: string | null;
  orderId?: string | null;
}) {
  const { error } = await supabaseAdmin.from("gemini_agent_logs").insert({
    agent_type: input.agentType,
    input_type: input.inputType,
    input_summary: input.inputSummary,
    model: input.model,
    response_json: input.responseJson,
    confidence: input.confidence ?? null,
    user_id: input.userId ?? null,
    vendor_id: input.vendorId ?? null,
    order_id: input.orderId ?? null
  });

  if (error) {
    console.error("Failed to write Gemini audit log:", error.message);
  }
}

