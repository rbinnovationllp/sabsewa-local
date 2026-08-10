import path from "path";
import sharp from "sharp";
import { supabase } from "../connection.js";

export const PARTNER_KYC_STORAGE_BUCKET = "partner-kyc-private";
const ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

function publicUploadError(message, details = {}) {
  const error = new Error(message);
  error.statusCode = details.statusCode || 500;
  error.publicMessage = message;
  error.diagnostic = details;
  return error;
}

function inferMimeType({ fileName, mimeType }) {
  const normalized = String(mimeType || "").toLowerCase().trim();
  if (normalized === "image/jpg") return "image/jpeg";
  if (ALLOWED_MIME_TYPES.includes(normalized)) return normalized;
  const ext = path.extname(fileName || "").toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".pdf") return "application/pdf";
  return normalized || "application/octet-stream";
}

function extensionFor({ fileName, mimeType, optimized }) {
  if (optimized) return ".jpg";
  const ext = path.extname(fileName || "").toLowerCase();
  if ([".pdf", ".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return ext;
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".bin";
}

async function ensurePartnerKycBucket() {
  const { data, error } = await supabase.storage.getBucket(PARTNER_KYC_STORAGE_BUCKET);
  if (!error && data?.id) return;
  const missing = error?.statusCode === 404 || error?.status === 404 || /not found/i.test(String(error?.message || ""));
  if (!missing) {
    throw publicUploadError("Partner KYC storage is not available. Please contact SabSewa support.", {
      stage: "get_bucket",
      bucket: PARTNER_KYC_STORAGE_BUCKET,
      message: error?.message || String(error),
      code: error?.name || error?.code || null,
    });
  }
  const { error: createError } = await supabase.storage.createBucket(PARTNER_KYC_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: MAX_FILE_SIZE_BYTES,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  });
  if (createError && !/already exists/i.test(String(createError.message || ""))) {
    throw publicUploadError("Partner KYC storage bucket is missing or cannot be created. Please contact SabSewa support.", {
      stage: "create_bucket",
      bucket: PARTNER_KYC_STORAGE_BUCKET,
      message: createError?.message || String(createError),
      code: createError?.name || createError?.code || null,
    });
  }
}

export async function uploadPartnerKycDocument({ partnerApplicationId, documentType, documentSection, fileBuffer, mimeType, originalName }) {
  await ensurePartnerKycBucket();
  if (!fileBuffer?.length) throw publicUploadError("Selected document file was empty. Please choose the file again.", { stage: "validate_file" });
  if (fileBuffer.length > MAX_FILE_SIZE_BYTES) throw publicUploadError("Document is too large. Please upload a file below 8 MB.", { stage: "validate_file_size" });

  const detectedMimeType = inferMimeType({ fileName: originalName, mimeType });
  if (!ALLOWED_MIME_TYPES.includes(detectedMimeType)) {
    throw publicUploadError("Unsupported document type. Please upload JPG, PNG, WEBP or PDF.", {
      stage: "validate_mime_type",
      received_mime_type: mimeType || null,
      detected_mime_type: detectedMimeType,
    });
  }

  const isImage = detectedMimeType.startsWith("image/");
  let processedBuffer = fileBuffer;
  let contentType = detectedMimeType;
  if (isImage) {
    processedBuffer = await sharp(fileBuffer).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82, progressive: true }).toBuffer();
    contentType = "image/jpeg";
  }

  const ext = extensionFor({ fileName: originalName, mimeType: contentType, optimized: isImage });
  const safeSection = String(documentSection || "document").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const safeType = String(documentType || "document").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const storagePath = `partner-kyc/${partnerApplicationId}/${safeSection}_${safeType}_${Date.now()}${ext}`;

  const { error } = await supabase.storage.from(PARTNER_KYC_STORAGE_BUCKET).upload(storagePath, processedBuffer, {
    contentType,
    upsert: false,
  });
  if (error) {
    const diagnostic = { stage: "storage_upload", bucket: PARTNER_KYC_STORAGE_BUCKET, storage_path: storagePath, message: error?.message || String(error), code: error?.name || error?.code || null };
    console.error("Partner KYC storage upload failed", diagnostic);
    throw publicUploadError(`Partner KYC storage upload failed: ${diagnostic.message}`, diagnostic);
  }

  return {
    storage_bucket: PARTNER_KYC_STORAGE_BUCKET,
    storage_path: storagePath,
    mime_type: contentType,
    file_size_bytes: processedBuffer.length,
  };
}