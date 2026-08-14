// mobile/server/ai/voiceRoutes.js
import express from 'express';
import { supabaseServiceRole } from '@/lib/supabaseService';
import { callGeminiFlashStructured } from '@/lib/geminiClient'; // Your Gemini abstraction
import { cleanPhone, publicApplication } from '@/lib/utils';

const router = express.Router();

/**
 * @route POST /api/ai/voice-to-cart
 * @desc Converts multilingual natural language speech into a structured cart draft,
 *       matching products against the selected vendor's catalogue.
 */
router.post("/voice-to-cart", async (req, res) => {
  try {
    const { raw_transcript, lang, vendor_id, context } = req.body;

    if (!raw_transcript || !raw_transcript.trim()) {
      return res.status(400).json({ success: false, error: "No transcript provided." });
    }

    // Determine intent from context: Text lookup vs Cart Addition vs Address parse
    if (context === 'text_only') {
      return res.json({ success: true, text: raw_transcript.trim() });
    }

    // Fetch the active vendor's active catalogue for Gemini lookup context
    const { data: catalogue } = await supabaseServiceRole
      .from("vendor_catalogue_active")
      .select("product_id, product_name, variant_name, price, stock, brand, is_available")
      .eq("vendor_id", vendor_id)
      .limit(200);

    // Call Gemini Flash with context
    const result = await callGeminiFlashStructured({
      transcript: raw_transcript,
      language: lang,
      mode: 'cart_add',
      vendorCatalogueContext: catalogue || [], // Avoid hallucination by providing context
    });

    // audit the transcription request
    await supabaseServiceRole
      .from("voice_transcriptions")
      .insert({
        user_id: req.user?.id, // Optional authenticated user
        app_platform: req.headers['app-platform'] || 'web_desktop',
        selected_language: lang,
        raw_transcript: raw_transcript,
        gemini_structured_result: result.structured_output,
        matched_catalogue_ids: result.matched_product_ids || [],
        submission_context: 'cart_draft'
      });

    return res.json({ success: true, structured: result.structured_output, duplicates: result.possible_duplicates });
  } catch (error) {
    console.error("Gemini Voice Processing Error:", error);
    return res.status(500).json({ success: false, error: "Internal AI Processing Error." });
  }
});

export default router;