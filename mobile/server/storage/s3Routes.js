import crypto from "crypto";
import express from "express";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { supabase } from "../connection.js";

const router = express.Router();
const MB = 1024 * 1024;
const MAX_VENDOR_QUOTA_BYTES = 2 * 1024 * MB;
const MAX_ORIGINAL_IMAGE_BYTES = 5 * MB;
const MAX_PRODUCT_IMAGE_BYTES = 200 * 1024;
const MAX_IMAGE_DIMENSION = 1200;
const ALLOWED_PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_PRODUCT_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const PRODUCT_IMAGE_TARGET_NOTE = "Compress product images to roughly 100-200 KB before upload.";
const SHARED_IMAGE_RIGHTS_TEXT =
  "I own this image or have permission to use it, and I authorise SabSewa Local to make it available to other registered vendors for use in their digital shops.";

function quotaForSuccessfulOrders(successfulOrders) {
  const orders = Number(successfulOrders || 0);
  if (orders > 5000) return 2 * 1024 * MB;
  if (orders >= 2001) return 1024 * MB;
  if (orders >= 501) return 500 * MB;
  if (orders >= 101) return 250 * MB;
  return 100 * MB;
}

function warningForUsage(usedBytes, quotaBytes) {
  if (!quotaBytes) return "none";
  const ratio = Number(usedBytes || 0) / Number(quotaBytes);
  if (ratio >= 1) return "100_percent";
  if (ratio >= 0.9) return "90_percent";
  if (ratio >= 0.8) return "80_percent";
  return "none";
}

async function countCompletedOrders(vendorId) {
  const { count, error } = await supabase
    .from("hyperlocal_orders")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId)
    .eq("status", "completed");

  if (error) throw error;
  return count || 0;
}

async function getVendorStorageUsage(vendorId) {
  const successfulOrders = await countCompletedOrders(vendorId);
  const quotaBytes = Math.min(quotaForSuccessfulOrders(successfulOrders), MAX_VENDOR_QUOTA_BYTES);

  const { data: activeFiles, error: activeError } = await supabase
    .from("vendor_storage_files")
    .select("byte_size")
    .eq("vendor_id", vendorId)
    .eq("status", "active");

  if (activeError) throw activeError;

  const usedBytes = (activeFiles || []).reduce((sum, file) => sum + Number(file.byte_size || 0), 0);
  const warningLevel = warningForUsage(usedBytes, quotaBytes);

  const { data, error } = await supabase
    .from("vendor_storage_usage")
    .upsert({
      vendor_id: vendorId,
      quota_bytes: quotaBytes,
      used_bytes: usedBytes,
      successful_order_count: successfulOrders,
      warning_level: warningLevel,
      updated_at: new Date().toISOString(),
    }, { onConflict: "vendor_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

function duplicateKey({ fileName, fileSize }) {
  return crypto
    .createHash("sha256")
    .update(`${String(fileName || "").toLowerCase()}|${Number(fileSize || 0)}`)
    .digest("hex");
}

function getS3Client() {
  if (!process.env.AWS_REGION || !process.env.AWS_S3_BUCKET) {
    const error = new Error("AWS S3 is not configured.");
    error.statusCode = 500;
    throw error;
  }

  return new S3Client({
    region: process.env.AWS_REGION,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
}

router.post("/presign-product-image", async (req, res) => {
  try {
    const {
      vendorId,
      fileName,
      contentType = "image/jpeg",
      fileSize,
      originalFileSize,
      imageWidth,
      imageHeight,
      optimized = false,
    } = req.body;

    if (!vendorId || !fileName) {
      return res.status(400).json({
        success: false,
        error: "Vendor id and file name are required.",
      });
    }

    const normalizedContentType = String(contentType).toLowerCase();
    if (!ALLOWED_PRODUCT_IMAGE_TYPES.has(normalizedContentType)) {
      return res.status(400).json({
        success: false,
        error: "Only JPEG, PNG and WebP product images are allowed.",
      });
    }

    if (normalizedContentType.startsWith("video/")) {
      return res.status(400).json({
        success: false,
        error: "Videos are not allowed under the standard vendor storage allocation.",
      });
    }

    const safeExtension = String(fileName).split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
    if (!ALLOWED_PRODUCT_IMAGE_EXTENSIONS.has(safeExtension)) {
      return res.status(400).json({
        success: false,
        error: "File extension does not match permitted product image formats.",
      });
    }

    const expectedSize = Number(fileSize || 0);
    const originalSize = Number(originalFileSize || expectedSize || 0);
    const width = Number(imageWidth || 0);
    const height = Number(imageHeight || 0);

    if (originalSize > MAX_ORIGINAL_IMAGE_BYTES) {
      return res.status(413).json({
        success: false,
        error: "Original image is too large. Maximum original upload size is 5 MB.",
        max_original_bytes: MAX_ORIGINAL_IMAGE_BYTES,
      });
    }

    if (!expectedSize || expectedSize <= 0) {
      return res.status(400).json({
        success: false,
        error: "File size is required before upload.",
      });
    }

    if (expectedSize > MAX_PRODUCT_IMAGE_BYTES) {
      return res.status(413).json({
        success: false,
        error: `Product image is too large. ${PRODUCT_IMAGE_TARGET_NOTE}`,
        max_bytes: MAX_PRODUCT_IMAGE_BYTES,
      });
    }

    if (!optimized) {
      return res.status(400).json({
        success: false,
        error: "Image must be resized and compressed before permanent storage.",
      });
    }

    if ((width && width > MAX_IMAGE_DIMENSION) || (height && height > MAX_IMAGE_DIMENSION)) {
      return res.status(400).json({
        success: false,
        error: "Image dimensions are too large. Maximum allowed size is 1200 x 1200 pixels.",
        max_dimension: MAX_IMAGE_DIMENSION,
      });
    }

    const usage = await getVendorStorageUsage(vendorId);
    if (Number(usage.used_bytes) + expectedSize > Number(usage.quota_bytes)) {
      return res.status(409).json({
        success: false,
        error: "Vendor storage quota reached. Please remove unused images or request a storage review.",
        usage,
      });
    }

    const dedupe = duplicateKey({ fileName, fileSize: expectedSize });
    const { data: duplicate, error: duplicateError } = await supabase
      .from("vendor_storage_files")
      .select("id, public_url")
      .eq("vendor_id", vendorId)
      .eq("duplicate_key", dedupe)
      .in("status", ["pending", "active"])
      .maybeSingle();

    if (duplicateError) throw duplicateError;
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: "This image appears to have already been uploaded. Use the existing image instead of uploading it again.",
        existing_file: duplicate,
      });
    }

    const objectKey = `sabsewa-local/vendor-products/${vendorId}/${Date.now()}-${crypto.randomUUID()}.${safeExtension}`;
    const client = getS3Client();
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: objectKey,
      ContentType: normalizedContentType,
      Metadata: {
        vendor_id: String(vendorId),
        storage_purpose: "sabsewa_local_product_image",
        original_byte_size: String(originalSize),
        optimized_byte_size: String(expectedSize),
        image_width: String(width || ""),
        image_height: String(height || ""),
      },
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
    const publicBaseUrl =
      process.env.AWS_S3_PUBLIC_BASE_URL ||
      `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;
    const publicUrl = `${publicBaseUrl.replace(/\/$/, "")}/${objectKey}`;

    const { data: storageFile, error: storageError } = await supabase
      .from("vendor_storage_files")
      .insert({
        vendor_id: vendorId,
        object_key: objectKey,
        public_url: publicUrl,
        original_file_name: fileName,
        content_type: normalizedContentType,
        byte_size: expectedSize,
        original_byte_size: originalSize,
        image_width: width || null,
        image_height: height || null,
        optimized: true,
        metadata_scan_status: "passed",
        purpose: "product_image",
        status: "pending",
        duplicate_key: dedupe,
        metadata: {
          max_product_image_bytes: MAX_PRODUCT_IMAGE_BYTES,
          max_original_image_bytes: MAX_ORIGINAL_IMAGE_BYTES,
          max_image_dimension: MAX_IMAGE_DIMENSION,
          optimization_note: PRODUCT_IMAGE_TARGET_NOTE,
          metadata_validation: "mime_extension_size_dimensions_passed",
        },
      })
      .select()
      .single();

    if (storageError) throw storageError;

    return res.json({
      success: true,
      upload_url: uploadUrl,
      object_key: objectKey,
      public_url: publicUrl,
      storage_file_id: storageFile.id,
      usage,
      expires_in_seconds: 300,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
    });
  }
});

router.post("/presign-shared-product-image", async (req, res) => {
  try {
    const {
      vendorId,
      fileName,
      contentType = "image/jpeg",
      fileSize,
      originalFileSize,
      imageWidth,
      imageHeight,
      optimized = false,
      productName,
      brand,
      barcode,
      rightsConfirmed,
      rightsConfirmationText,
    } = req.body;

    if (!rightsConfirmed || rightsConfirmationText !== SHARED_IMAGE_RIGHTS_TEXT) {
      return res.status(400).json({
        success: false,
        error: "Image rights and shared-use authorisation must be confirmed before upload.",
        required_confirmation: SHARED_IMAGE_RIGHTS_TEXT,
      });
    }

    if (!productName?.trim()) {
      return res.status(400).json({
        success: false,
        error: "Product name is required for shared catalogue moderation.",
      });
    }

    const fakeReq = {
      body: {
        vendorId,
        fileName,
        contentType,
        fileSize,
        originalFileSize,
        imageWidth,
        imageHeight,
        optimized,
      },
    };

    const normalizedContentType = String(contentType).toLowerCase();
    const safeExtension = String(fileName).split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
    const expectedSize = Number(fileSize || 0);
    const originalSize = Number(originalFileSize || expectedSize || 0);
    const width = Number(imageWidth || 0);
    const height = Number(imageHeight || 0);

    if (!vendorId || !fileName) return res.status(400).json({ success: false, error: "Vendor id and file name are required." });
    if (!ALLOWED_PRODUCT_IMAGE_TYPES.has(normalizedContentType)) return res.status(400).json({ success: false, error: "Only JPEG, PNG and WebP product images are allowed." });
    if (!ALLOWED_PRODUCT_IMAGE_EXTENSIONS.has(safeExtension)) return res.status(400).json({ success: false, error: "File extension does not match permitted product image formats." });
    if (originalSize > MAX_ORIGINAL_IMAGE_BYTES) return res.status(413).json({ success: false, error: "Original image is too large. Maximum original upload size is 5 MB." });
    if (!expectedSize || expectedSize <= 0) return res.status(400).json({ success: false, error: "File size is required before upload." });
    if (expectedSize > MAX_PRODUCT_IMAGE_BYTES) return res.status(413).json({ success: false, error: `Product image is too large. ${PRODUCT_IMAGE_TARGET_NOTE}` });
    if (!optimized) return res.status(400).json({ success: false, error: "Image must be resized and compressed before permanent storage." });
    if ((width && width > MAX_IMAGE_DIMENSION) || (height && height > MAX_IMAGE_DIMENSION)) return res.status(400).json({ success: false, error: "Image dimensions are too large. Maximum allowed size is 1200 x 1200 pixels." });

    const dedupe = duplicateKey({ fileName: `${productName}-${fileName}`, fileSize: expectedSize });
    const { data: duplicate, error: duplicateError } = await supabase
      .from("shared_product_images")
      .select("id, public_url, moderation_status")
      .eq("uploader_vendor_id", vendorId)
      .eq("metadata->>duplicate_key", dedupe)
      .in("moderation_status", ["pending", "approved"])
      .maybeSingle();

    if (duplicateError) throw duplicateError;
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: "This shared product image appears to have already been submitted.",
        existing_image: duplicate,
      });
    }

    const objectKey = `sabsewa-local/shared-product-catalogue/${vendorId}/${Date.now()}-${crypto.randomUUID()}.${safeExtension}`;
    const client = getS3Client();
    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: objectKey,
      ContentType: normalizedContentType,
      Metadata: {
        vendor_id: String(vendorId),
        storage_purpose: "sabsewa_local_shared_product_image",
        original_byte_size: String(originalSize),
        optimized_byte_size: String(expectedSize),
        image_width: String(width || ""),
        image_height: String(height || ""),
      },
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
    const publicBaseUrl =
      process.env.AWS_S3_PUBLIC_BASE_URL ||
      `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`;
    const publicUrl = `${publicBaseUrl.replace(/\/$/, "")}/${objectKey}`;

    const { data: sharedImage, error: sharedError } = await supabase
      .from("shared_product_images")
      .insert({
        uploader_vendor_id: vendorId,
        product_name: productName.trim(),
        brand: brand || null,
        barcode: barcode || null,
        public_url: publicUrl,
        object_key: objectKey,
        content_type: normalizedContentType,
        byte_size: expectedSize,
        original_byte_size: originalSize,
        image_width: width || null,
        image_height: height || null,
        rights_confirmation: rightsConfirmationText,
        reuse_authorised: true,
        moderation_status: "pending",
        metadata: {
          duplicate_key: dedupe,
          moderation_note: "Company approval required before other vendors can reuse this image.",
        },
      })
      .select()
      .single();

    if (sharedError) throw sharedError;

    return res.json({
      success: true,
      upload_url: uploadUrl,
      object_key: objectKey,
      public_url: publicUrl,
      shared_image_id: sharedImage.id,
      moderation_status: sharedImage.moderation_status,
      required_confirmation: SHARED_IMAGE_RIGHTS_TEXT,
      expires_in_seconds: 300,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get("/shared-product-images", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    let query = supabase
      .from("shared_product_images")
      .select("id, product_name, brand, barcode, public_url, content_type, image_width, image_height, usage_count")
      .eq("moderation_status", "approved")
      .eq("reuse_authorised", true)
      .order("usage_count", { ascending: false })
      .limit(50);

    if (search) query = query.ilike("product_name", `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ success: true, images: data || [] });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
    });
  }
});

router.post("/confirm-product-image", async (req, res) => {
  try {
    const { vendorId, storageFileId, objectKey } = req.body;

    if (!vendorId || (!storageFileId && !objectKey)) {
      return res.status(400).json({
        success: false,
        error: "Vendor id and storage file reference are required.",
      });
    }

    let query = supabase
      .from("vendor_storage_files")
      .update({
        status: "active",
        confirmed_at: new Date().toISOString(),
      })
      .eq("vendor_id", vendorId)
      .select()
      .single();

    query = storageFileId ? query.eq("id", storageFileId) : query.eq("object_key", objectKey);

    const { data: file, error } = await query;
    if (error) throw error;

    const usage = await getVendorStorageUsage(vendorId);
    return res.json({ success: true, file, usage });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
    });
  }
});

router.get("/vendor/:vendor_id/usage", async (req, res) => {
  try {
    const vendorId = req.params.vendor_id;
    const usage = await getVendorStorageUsage(vendorId);
    return res.json({
      success: true,
      usage,
      tiers: [
        { max_successful_orders: 100, quota_mb: 100 },
        { min_successful_orders: 101, max_successful_orders: 500, quota_mb: 250 },
        { min_successful_orders: 501, max_successful_orders: 2000, quota_mb: 500 },
        { min_successful_orders: 2001, max_successful_orders: 5000, quota_mb: 1024 },
        { min_successful_orders: 5001, quota_mb: 2048 },
      ],
      rules: {
        max_product_image_bytes: MAX_PRODUCT_IMAGE_BYTES,
        max_original_image_bytes: MAX_ORIGINAL_IMAGE_BYTES,
        max_image_dimension: MAX_IMAGE_DIMENSION,
        product_image_target: PRODUCT_IMAGE_TARGET_NOTE,
        allowed_formats: Array.from(ALLOWED_PRODUCT_IMAGE_TYPES),
        videos_allowed: false,
        manual_review_required_above_gb: 2,
      },
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
