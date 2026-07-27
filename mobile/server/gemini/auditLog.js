import { supabase } from "../connection.js";

export async function writeGeminiAuditLog(input) {
  const { data, error } = await supabase
    .from("gemini_agent_logs")
    .insert({
      agent_type: input.agentType,
      input_type: input.inputType,
      input_summary: input.inputSummary,
      model: input.model,
      response_json: input.responseJson,
      confidence: input.confidence ?? null,
      user_id: input.userId ?? null,
      vendor_id: input.vendorId ?? null,
      order_id: input.orderId ?? null,
      metadata: input.metadata || {},
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to write Gemini audit log:", error.message);
    return null;
  }

  return data?.id || null;
}
