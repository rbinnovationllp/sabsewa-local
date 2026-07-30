import { apiUrl } from "@/lib/backend";

const memoryCache = new Map<string, string>();

export type DynamicTranslationContentType =
  | "product_description"
  | "customer_note"
  | "vendor_response"
  | "substitution_explanation"
  | "support_message"
  | "catalog_synonym"
  | "order_interpretation";

export type TranslateOptions = {
  from: "en" | "auto" | string;
  to: string;
  contentType?: DynamicTranslationContentType;
  userId?: string;
  vendorId?: string;
  orderId?: string;
};

export async function translateText(
  text: string,
  options: TranslateOptions
): Promise<string> {
  const { from, to, contentType = "customer_note" } = options;

  if (from === to) return text;
  if (!text?.trim()) return text;

  const cacheKey = `${from}:${to}:${contentType}:${text}`;

  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }

  try {
    const response = await fetch(apiUrl("/api/gemini/translation/dynamic"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        sourceLanguage: from,
        targetLanguage: to,
        contentType,
        userId: options.userId,
        vendorId: options.vendorId,
        orderId: options.orderId,
      }),
    });
    const json = await response.json();
    const translated = json?.data?.translated_text || text;
    memoryCache.set(cacheKey, translated);
    return translated;
  } catch {
    return text;
  }
}
