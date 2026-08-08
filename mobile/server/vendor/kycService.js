import path from "path";
import sharp from "sharp";
import { supabase } from "../connection.js";

export async function compressKycDocument(inputBuffer) {
  return await sharp(inputBuffer)
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82, progressive: true })
    .toBuffer();
}

function extensionFor({ fileName, mimeType, optimized }) {
  if (optimized) return ".jpg";
  const ext = path.extname(fileName || "").toLowerCase();
  if ([".pdf", ".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return ext;
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".bin";
}

export async function uploadKycDocument({ vendorId, documentType, fileBuffer, mimeType, originalName }) {
  const isImage = Boolean(mimeType && mimeType.startsWith("image/"));
  const processedBuffer = isImage ? await compressKycDocument(fileBuffer) : fileBuffer;
  const ext = extensionFor({ fileName: originalName, mimeType, optimized: isImage });
  const contentType = isImage ? "image/jpeg" : (mimeType || "application/octet-stream");
  const safeDocumentType = String(documentType || "document").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const storageBucket = "vendor-documents";
  const storagePath = `kyc/${vendorId}/${safeDocumentType}_${Date.now()}${ext}`;

  const { error } = await supabase.storage
    .from(storageBucket)
    .upload(storagePath, processedBuffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    console.error("Error uploading KYC document to Supabase storage:", error);
    throw new Error(`Document upload failed: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from(storageBucket)
    .getPublicUrl(storagePath);

  return {
    storage_bucket: storageBucket,
    storage_path: storagePath,
    public_url: publicUrlData.publicUrl,
    mime_type: contentType,
    file_size_bytes: processedBuffer.length,
  };
}
