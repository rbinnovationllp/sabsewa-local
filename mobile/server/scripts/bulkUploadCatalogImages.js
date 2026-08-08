import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { supabase } from "../connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get directory argument from CLI or default to local folder
const args = process.argv.slice(2);
const dirArg = args.find((arg) => arg.startsWith("--dir="));
const targetDir = dirArg
  ? dirArg.split("=")[1].replace(/^["']|["']$/g, "")
  : path.join(__dirname, "../../master_images");

async function uploadBulkImages() {
  console.log(`\n Starting catalog bulk image upload from: ${targetDir}\n`);

  if (!fs.existsSync(targetDir)) {
    console.error(` Error: Target directory does not exist: ${targetDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(targetDir).filter((file) =>
    /\.(jpg|jpeg|png|webp)$/i.test(file)
  );

  if (files.length === 0) {
    console.log(" No valid image files (.jpg, .jpeg, .png, .webp) found.");
    process.exit(0);
  }

  console.log(` Found ${files.length} images to process...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const filePath = path.join(targetDir, file);
    const fileBuffer = fs.readFileSync(filePath);
    const storagePath = `catalog/${Date.now()}_${file.replace(/\s+/g, "_")}`;

    try {
      // 1. Upload to Supabase Storage bucket 'catalog-images'
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("catalog-images")
        .upload(storagePath, fileBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // 2. Obtain Public URL
      const { data: urlData } = supabase.storage
        .from("catalog-images")
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;

      // 3. Match image filename to master catalog item (by SKU or product_name)
      const imageNameWithoutExt = path.parse(file).name.trim();

      const { data: updatedCatalog, error: dbError } = await supabase
        .from("master_catalog")
        .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
        .or(`sku.ilike.%${imageNameWithoutExt}%,product_name.ilike.%${imageNameWithoutExt}%`)
        .select("id, product_name");

      if (dbError) throw dbError;

      console.log(`✓ Uploaded & Linked [${file}] -> ${publicUrl}`);
      successCount++;
    } catch (err) {
      console.error(`✗ Failed to process [${file}]: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\n Finished! Successfully uploaded: ${successCount} | Failed: ${errorCount}`);
}

uploadBulkImages();