export function extractJsonObject(text) {
  const trimmed = String(text || "").trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstObject = trimmed.indexOf("{");
    const lastObject = trimmed.lastIndexOf("}");
    const firstArray = trimmed.indexOf("[");
    const lastArray = trimmed.lastIndexOf("]");

    const objectCandidate =
      firstObject >= 0 && lastObject > firstObject
        ? trimmed.slice(firstObject, lastObject + 1)
        : "";
    const arrayCandidate =
      firstArray >= 0 && lastArray > firstArray
        ? trimmed.slice(firstArray, lastArray + 1)
        : "";

    const candidate = objectCandidate || arrayCandidate;
    if (!candidate) throw new Error("Gemini response did not contain parseable JSON.");

    return JSON.parse(candidate);
  }
}
