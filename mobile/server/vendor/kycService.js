import path from "path";
import sharp from "sharp";
import { supabase } from "../connection.js";

export const KYC_STORAGE_BUCKET = "vendor-kyc-private";

const ALLOWED_KYC_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_KYC_FILE_SIZE_BYTES = 8 * 1024 * 1024;

function publicUploadError(message, details = {}) {
  const error = new Error(message);
  error.statusCode = details.statusCode || 500;
  error.publicMessage = message;
  error.diagnostic = details;
  return error;
}

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
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".bin";
}

function inferMimeType({ fileName, mimeType }) {
  const normalized = String(mimeType || "").toLowerCase().trim();
  if (normalized === "image/jpg") return "image/jpeg";
  if (ALLOWED_KYC_MIME_TYPES.includes(normalized)) return normalized;

  const ext = path.extname(fileName || "").toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".pdf") return "application/pdf";

  return normalized || "application/octet-stream";
}

async function ensureKycBucket() {
  const { data, error } = await supabase.storage.getBucket(KYC_STORAGE_BUCKET);
  if (!error && data?.id) return;

  const missing = error?.statusCode === 404 || error?.status === 404 || /not found/i.test(String(error?.message || ""));
  if (!missing) {
    throw publicUploadError("KYC storage is not available. Please contact SabSewa support.", {
      stage: "get_bucket",
      bucket: KYC_STORAGE_BUCKET,
      code: error?.name || error?.code || null,
      message: error?.message || String(error),
    });
  }

  const { error: createError } = await supabase.storage.createBucket(KYC_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: MAX_KYC_FILE_SIZE_BYTES,
    allowedMimeTypes: ALLOWED_KYC_MIME_TYPES,
  });

  if (createError && !/already exists/i.test(String(createError.message || ""))) {
    throw publicUploadError("KYC storage bucket is missing or cannot be created. Please contact SabSewa support.", {
      stage: "create_bucket",
      bucket: KYC_STORAGE_BUCKET,
      code: createError?.name || createError?.code || null,
      message: createError?.message || String(createError),
    });
  }
}

export async function uploadKycDocument({ vendorId, documentType, fileBuffer, mimeType, originalName }) {
  await ensureKycBucket();

  if (!fileBuffer?.length) {
    throw publicUploadError("Selected document file was empty. Please choose the file again.", {
      stage: "validate_file",
      original_name: originalName || null,
    });
  }
  if (fileBuffer.length > MAX_KYC_FILE_SIZE_BYTES) {
    throw publicUploadError("Document is too large. Please upload a file below 8 MB.", {
      stage: "validate_file_size",
      file_size_bytes: fileBuffer.length,
      max_file_size_bytes: MAX_KYC_FILE_SIZE_BYTES,
    });
  }

  const detectedMimeType = inferMimeType({ fileName: originalName, mimeType });
  if (!ALLOWED_KYC_MIME_TYPES.includes(detectedMimeType)) {
    throw publicUploadError("Unsupported document type. Please upload JPG, PNG, WEBP or PDF.", {
      stage: "validate_mime_type",
      original_name: originalName || null,
      received_mime_type: mimeType || null,
      detected_mime_type: detectedMimeType,
      allowed_mime_types: ALLOWED_KYC_MIME_TYPES,
    });
  }

  const isImage = detectedMimeType.startsWith("image/");
  let processedBuffer = fileBuffer;
  let contentType = detectedMimeType;

  if (isImage) {
    try {
      processedBuffer = await compressKycDocument(fileBuffer);
      contentType = "image/jpeg";
    } catch (error) {
      throw publicUploadError("Image document could not be processed. Please try a clear JPG, PNG or PDF.", {
        stage: "image_compression",
        original_name: originalName || null,
        received_mime_type: mimeType || null,
        detected_mime_type: detectedMimeType,
        message: error?.message || String(error),
      });
    }
  }

  const ext = extensionFor({ fileName: originalName, mimeType: contentType, optimized: isImage });
  const safeDocumentType = String(documentType || "document").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const storagePath = `kyc/${vendorId}/${safeDocumentType}_${Date.now()}${ext}`;

  const { error } = await supabase.storage
    .from(KYC_STORAGE_BUCKET)
    .upload(storagePath, processedBuffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    const diagnostic = {
      stage: "storage_upload",
      vendor_id: vendorId,
      document_type: documentType,
      bucket: KYC_STORAGE_BUCKET,
      storage_path: storagePath,
      original_name: originalName || null,
      received_mime_type: mimeType || null,
      detected_mime_type: detectedMimeType,
      upload_content_type: contentType,
      file_size_bytes: processedBuffer.length,
      code: error?.name || error?.code || null,
      message: error?.message || String(error),
      status_code: error?.statusCode || error?.status || null,
    };
    console.error("KYC storage upload failed", diagnostic);
    throw publicUploadError(`KYC storage upload failed: ${diagnostic.message}`, diagnostic);
  }

  return {
    storage_bucket: KYC_STORAGE_BUCKET,
    storage_path: storagePath,
    mime_type: contentType,
    file_size_bytes: processedBuffer.length,
  };
}