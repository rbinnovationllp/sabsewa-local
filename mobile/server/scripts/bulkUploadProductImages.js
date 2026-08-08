import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly target local server .env file
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

console.log("\n--- SUPABASE CREDENTIAL DEBUG ---");
console.log("Target URL:", supabaseUrl);
console.log("Key Length:", supabaseServiceKey ? supabaseServiceKey.length : "NOT FOUND");
console.log("---------------------------------\n");

if (!supabaseUrl || !supabaseServiceKey || supabaseServiceKey.length < 50) {
  console.error(" Error: Invalid or missing SUPABASE_SERVICE_ROLE_KEY in server/.env");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const args = process.argv.slice(2);
const dirArg = args.find((arg) => arg.startsWith("--dir="));
const targetDir = dirArg
  ? dirArg.split("=")[1].replace(/^["']|["']$/g, "")
  : path.join(__dirname, "../scripts/master-import");

async function linkUploadedImages() {
  console.log(` Linking uploaded bucket images to master_product_catalog...\n`);

  if (!fs.existsSync(targetDir)) {
    console.error(` Error: Directory does not exist: ${targetDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(targetDir).filter((file) =>
    /\.(jpg|jpeg|png|webp)$/i.test(file)
  );

  let successCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const cleanFileName = file.replace(/[^a-zA-Z0-9._-]/g, "_");
    const imageName = path.parse(file).name.replace(/\s*\(\d+\)\s*/g, "").trim();

    const { data: urlData } = supabaseAdmin.storage
      .from("product-images")
      .getPublicUrl(`catalog/${cleanFileName}`);

    const publicUrl = urlData.publicUrl;

    try {
      const { error: dbError } = await supabaseAdmin
        .from("master_product_catalog")
        .update({
          generic_image_url: publicUrl,
          image_status: "approved_shared_image",
          updated_at: new Date().toISOString(),
        })
        .or(`standard_title.ilike.%${imageName}%`);

      if (dbError) throw dbError;

      console.log(`✓ Linked [${imageName}] -> ${publicUrl}`);
      successCount++;
    } catch (err) {
      console.error(`✗ Failed for [${file}]: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\n Complete! Successfully Linked: ${successCount} | Failed: ${errorCount}`);
}

linkUploadedImages();
