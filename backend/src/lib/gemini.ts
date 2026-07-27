import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("GEMINI_API_KEY is missing. Gemini routes will fail until configured.");
}

export const geminiModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";

export const genAI = new GoogleGenAI({
  apiKey: apiKey || "missing-key"
});

