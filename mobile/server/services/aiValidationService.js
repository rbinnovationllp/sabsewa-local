import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Analyzes product details and image using Gemini Vision to detect restricted items,
 * duplicate master items, category suggestions, and English translations.
 */
export async function analyzeProductWithAI({ imageBuffer, mimeType, productName, brandName, categorySlug }) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
    You are a Senior Product Catalog Specialist and Legal Compliance Auditor for Indian Retail Marketplaces.
    Analyze this product entry:
    - Product Name Input: "${productName}"
    - Brand Name Input: "${brandName || 'N/A'}"
    - Vendor Selected Category: "${categorySlug || 'N/A'}"

    Examine the provided image (if available) and product details. Provide a JSON response adhering strictly to this schema:
    {
      "suggested_english_name": "Standardized English Name",
      "suggested_category": "grocery|fresh_produce|pharmacy|food_dining|dairy_bakery|electronics|fashion|services|other",
      "suggested_subcategory": "string",
      "suggested_unit": "kg|g|ltr|ml|pcs|pack|box|pair",
      "search_keywords": ["keyword1", "keyword2", "keyword3"],
      "short_description": "2-sentence product description",
      "is_restricted": true/false,
      "restriction_reason": "Detailed reason if regulated (e.g. requires FSSAI, Drug Licence, Trade Licence)",
      "detected_licence_type": "fssai|drug_licence|trade_license|gun_license|none",
      "is_prohibited": true/false,
      "prohibited_reason": "Reason if item is illegal, hazardous, firearms, explosives, narcotics, tobacco, or alcohol",
      "confidence_score": 0.95
    }
    Strictly output valid JSON without markdown wrapping.
    `;

    const contents = [prompt];
    if (imageBuffer) {
      contents.push({
        inlineData: {
          data: imageBuffer.toString("base64"),
          mimeType: mimeType || "image/jpeg",
        },
      });
    }

    const result = await model.generateContent(contents);
    const responseText = result.response.text().trim().replace(/^```json/, "").replace(/```$/, "");
    return JSON.parse(responseText);
  } catch (error) {
    console.error("Gemini AI Product Validation Error:", error.message);
    // Graceful fallback to avoid blocking vendor upload if AI service is unreachable
    return {
      suggested_english_name: productName,
      suggested_category: categorySlug || "other",
      suggested_unit: "pcs",
      search_keywords: [productName],
      short_description: "",
      is_restricted: false,
      is_prohibited: false,
      confidence_score: 0.50,
      error_fallback: true,
    };
  }
}