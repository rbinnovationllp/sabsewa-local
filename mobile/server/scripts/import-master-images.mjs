import fs from "fs";
import path from "path";
import sharp from "sharp";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing required environment variables (GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const IMAGES_DIR = path.resolve(process.cwd(), "scripts/master-import");
const PROGRESS_FILE = path.resolve(process.cwd(), "scripts/import-progress.json");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), "utf-8");
}

// Automatically resolve an active, supported model name for content generation
async function resolveActiveModel() {
  const preferredModels = [
    "gemini-2.0-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
    "gemini-2.0-flash-exp"
  ];

  for (const name of preferredModels) {
    try {
      const model = genAI.getGenerativeModel({ model: name });
      await model.generateContent("ping");
      console.log(`🤖 Using verified active model: ${name}`);
      return model;
    } catch (e) {
      if (e.message.includes("429") || e.message.includes("Quota")) {
        console.log(`🤖 Selected model ${name} (Quota limit hit during ping, proceeding with backoff)`);
        return genAI.getGenerativeModel({ model: name });
      }
      // If 404/not found, loop to next candidate
    }
  }

  // Default fallback
  console.log("🤖 Falling back to model: gemini-2.0-flash");
  return genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
}

async function callGeminiWithBackoff(model, prompt, imagePayload, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await model.generateContent([prompt, imagePayload]);
    } catch (err) {
      const isQuotaError = err.message.includes("429") || err.message.includes("Quota exceeded");
      if (isQuotaError && attempt < retries) {
        const match = err.message.match(/retry in ([0-9.]+)s/i);
        const waitSeconds = match ? Math.ceil(parseFloat(match[1])) + 5 : 60;
        console.log(`\n⚠️ Rate limit hit. Waiting ${waitSeconds} seconds for quota reset (Attempt ${attempt}/${retries})...`);
        await delay(waitSeconds * 1000);
      } else {
        throw err;
      }
    }
  }
}

async function processBulkImages() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`❌ Directory not found: ${IMAGES_DIR}`);
    return;
  }

  const files = fs.readdirSync(IMAGES_DIR).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  if (files.length === 0) {
    console.log(`⚠️ No image files found in ${IMAGES_DIR}.`);
    return;
  }

  const progress = getProgress();
  const pendingFiles = files.filter((f) => !progress[f]?.completed);

  console.log(`🚀 Total images: ${files.length} | Previously processed: ${files.length - pendingFiles.length} | Remaining: ${pendingFiles.length}`);

  if (pendingFiles.length === 0) {
    console.log("🎉 All images have already been successfully ingested!");
    return;
  }

  const model = await resolveActiveModel();
  console.log(`⏳ Enforcing 15-second delay between requests to remain within rate limits.\n`);

  for (let i = 0; i < pendingFiles.length; i++) {
    const file = pendingFiles[i];
    const filePath = path.join(IMAGES_DIR, file);
    console.log(`[${i + 1}/${pendingFiles.length}] 📸 Processing: ${file}...`);

    try {
      // 1. Optimize Image
      const optimizedBuffer = await sharp(filePath)
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();

      const safeFileName = file.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, "_");
      const storagePath = `master_vegetables/${Date.now()}_${safeFileName}.webp`;

      // 2. Upload to Supabase Storage
      const { error: storageError } = await supabase.storage
        .from("product-images")
        .upload(storagePath, optimizedBuffer, { contentType: "image/webp", upsert: true });

      if (storageError) {
        console.error(`❌ Storage Upload Failed for ${file}:`, storageError.message);
        continue;
      }

      const { data: publicUrlData } = supabase.storage.from("product-images").getPublicUrl(storagePath);
      const imageUrl = publicUrlData.publicUrl;

      // 3. Analyze with Gemini
      const prompt = `
      You are an expert Indian produce cataloguer. Analyze this produce image and return ONLY a valid JSON object without markdown formatting:
      {
        "english_name": "Product Name in English",
        "translations": {
          "hi": "Hindi translation",
          "kn": "Kannada translation",
          "ta": "Tamil translation",
          "te": "Telugu translation"
        },
        "category_slug": "fresh_produce",
        "subcategory": "vegetables",
        "standard_unit": "kg",
        "description": {
          "en": "Short item description in English",
          "hi": "Short item description in Hindi"
        },
        "search_keywords": ["keyword1", "keyword2", "keyword3"]
      }`;

      const aiResult = await callGeminiWithBackoff(model, prompt, {
        inlineData: { data: optimizedBuffer.toString("base64"), mimeType: "image/webp" },
      });

      const rawText = aiResult.response.text();
      const jsonText = rawText.replace(/^```json/m, "").replace(/^```/m, "").replace(/```$/m, "").trim();
      const aiData = JSON.parse(jsonText);

      // 4. Insert into Master Product Catalogue
      const { error: dbError } = await supabase.from("master_product_catalogue").insert({
        product_name: aiData.english_name,
        name_translations: aiData.translations,
        category_slug: aiData.category_slug || "fresh_produce",
        subcategory_slug: aiData.subcategory || "vegetables",
        standard_unit: aiData.standard_unit || "kg",
        master_image_url: imageUrl,
        description_translations: aiData.description,
        search_keywords: aiData.search_keywords,
        status: "approved",
      });

      if (dbError) {
        console.error(`❌ Database Insert Failed for ${file}:`, dbError.message);
      } else {
        console.log(`  ✅ Added: ${aiData.english_name} (${aiData.translations?.hi || ""})`);
        progress[file] = { completed: true, timestamp: new Date().toISOString(), productName: aiData.english_name };
        saveProgress(progress);
      }

      // Inter-request pacing delay
      if (i < pendingFiles.length - 1) {
        await delay(15000);
      }
    } catch (err) {
      console.error(`  ❌ Error processing ${file}:`, err.message);
    }
  }

  console.log("\n🎉 Batch processing completed!");
}

processBulkImages();