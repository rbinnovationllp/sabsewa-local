// lib/translate.ts

const memoryCache = new Map<string, string>();

export type TranslateOptions = {
  from: "en";
  to: string; // hi, ta, te, etc.
};

/**
 * Translate English text to target language.
 * - English is source of truth
 * - Cached for performance
 */
export async function translateText(
  text: string,
  options: TranslateOptions
): Promise<string> {
  const { from, to } = options;

  if (from === to) return text;
  if (!text?.trim()) return text;

  const cacheKey = `${from}:${to}:${text}`;

  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }

  /**
   * 🔒 PLACEHOLDER TRANSLATION ENGINE
   * Replace this block later with real API
   */
  const translated = `[${to.toUpperCase()}] ${text}`;

  memoryCache.set(cacheKey, translated);
  return translated;
}
