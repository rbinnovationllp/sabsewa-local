import sharp from "sharp";
import { supabase } from "../connection.js";

/**
 * Optimizes legal documents (Aadhaar, PAN, FSSAI, GST) prior to storage.
 * Resizes images to standard high-clarity dimensions while compressing
 * file size to conserve storage without distorting or altering document content.
 * 
 * @param {Buffer} inputBuffer - The raw image file buffer uploaded via Multer/Form-Data
 * @returns {Promise<Buffer>} - Compressed JPEG buffer
 */
export async function compressKycDocument(inputBuffer) {
  return await sharp(inputBuffer)
    .resize({ 
      width: 1600, 
      height: 1600, 
      fit: "inside", 
      withoutEnlargement: true 
    })
    .jpeg({ quality: 80, progressive: true })
    .toBuffer();
}

/**
 * Uploads an optimized KYC document directly to Supabase Storage bucket
 * 
 * @param {string} vendorId - Vendor UUID
 * @param {string} documentType - Document type (e.g., 'aadhaar_front', 'pan_card', 'fssai_cert')
 * @param {Buffer} fileBuffer - Raw buffer from request
 * @param {string} mimeType - File MIME type
 * @returns {Promise<string>} - Public/Signed URL of the stored document
 */
export async function uploadKycDocument({ vendorId, documentType, fileBuffer, mimeType }) {
  let processedBuffer = fileBuffer;

  // Compress only if the file is an image (JPEG/PNG/WEBP)
  if (mimeType && mimeType.startsWith("image/")) {
    processedBuffer = await compressKycDocument(fileBuffer);
  }

  const fileName = `kyc/${vendorId}/${documentType}_${Date.now()}.jpg`;

  const { data, error } = await supabase.storage
    .from("vendor-documents")
    .upload(fileName, processedBuffer, {
      contentType: "image/jpeg",
      upsert: true
    });

  if (error) {
    console.error("Error uploading KYC document to Supabase storage:", error);
    throw new Error(`Document upload failed: ${error.message}`);
  }

  // Retrieve Public URL
  const { data: publicUrlData } = supabase.storage
    .from("vendor-documents")
    .getPublicUrl(fileName);

  return publicUrlData.publicUrl;
}