import crypto from "crypto";
import express from "express";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
const MASTER_IMAGE_RIGHTS_TEXT =
  "I own this image or have permission to use it, and I authorise SabSewa Local to include it in the shared master catalogue and allow other registered vendors to reference it in their digital shops.";
const MASTER_IMAGE_TERMS_VERSION = "sabsewa-local-master-image-consent-v1";
const MAX_MASTER_THUMBNAIL_BYTES = 40 * 1024;

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

function slugify(value) {
  return String(value || "product")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "product";
}

async function presignPrivateReadUrl(objectKey) {
  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: objectKey,
  });
  return getSignedUrl(client, command, { expiresIn: 900 });
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

router.get("/master-product-images", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const productId = String(req.query.productId || "").trim();

    let query = supabase
      .from("master_product_images")
      .select("id, product_id, product_title, category, subcategory, s3_object_key, thumbnail_object_key, source_type, source_vendor_id, moderation_status, takedown_status, created_at")
      .eq("moderation_status", "approved")
      .eq("takedown_status", "none")
      .order("created_at", { ascending: false })
      .limit(50);

    if (productId) query = query.eq("product_id", productId);
    if (search) query = query.ilike("product_title", `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    const images = await Promise.all((data || []).map(async (image) => ({
      ...image,
      image_url: await presignPrivateReadUrl(image.s3_object_key),
      thumbnail_url: await presignPrivateReadUrl(image.thumbnail_object_key),
      quota_note: "Shared master images are referenced only and do not consume the receiving vendor storage quota.",
    })));

    return res.json({ success: true, images });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.post("/presign-master-catalog-image", async (req, res) => {
  try {
    const {
      productId,
      vendorId,
      userId,
      fileName,
      mainFileSize,
      thumbnailFileSize,
      contentChecksum,
      perceptualHash,
      productTitle,
      category,
      subcategory,
      rightsConfirmed,
      rightsConfirmationText,
      declaredOwnership,
      allowSharedCatalogueUse,
      metadataRemoved,
      moderated = false,
      squareCrop = true,
      sourceType = "vendor_contributed",
    } = req.body;

    if (!productId || !vendorId || !fileName || !productTitle || !category || !subcategory) {
      return res.status(400).json({ success: false, error: "Product, vendor, filename, title, category and subcategory are required." });
    }

    if (sourceType !== "vendor_contributed") {
      return res.status(400).json({ success: false, error: "Only vendor-contributed master-image submissions are accepted through this mobile route. Other source types require Company CRM approval." });
    }

    if (!rightsConfirmed || !declaredOwnership || !allowSharedCatalogueUse || rightsConfirmationText !== MASTER_IMAGE_RIGHTS_TEXT) {
      return res.status(400).json({
        success: false,
        error: "The master-catalogue image rights declaration must be accepted before upload.",
        required_confirmation: MASTER_IMAGE_RIGHTS_TEXT,
      });
    }

    if (!metadataRemoved || !squareCrop) {
      return res.status(400).json({
        success: false,
        error: "Images must be metadata-stripped and cropped to a square product-focused format before permanent storage.",
      });
    }

    const mainSize = Number(mainFileSize || 0);
    const thumbSize = Number(thumbnailFileSize || 0);
    if (!mainSize || mainSize > MAX_PRODUCT_IMAGE_BYTES) {
      return res.status(413).json({ success: false, error: "Master image main WebP must be 100-200 KB after optimization." });
    }
    if (!thumbSize || thumbSize > MAX_MASTER_THUMBNAIL_BYTES) {
      return res.status(413).json({ success: false, error: "Master image thumbnail WebP must be 40 KB or smaller." });
    }
    if (!contentChecksum) {
      return res.status(400).json({ success: false, error: "Content checksum is required for duplicate detection and audit." });
    }

    const { data: duplicate, error: duplicateError } = await supabase
      .from("master_product_images")
      .select("id, moderation_status, takedown_status")
      .eq("content_checksum", contentChecksum)
      .maybeSingle();

    if (duplicateError) throw duplicateError;
    if (duplicate) {
      return res.status(409).json({
        success: false,
        error: "This master catalogue image appears to have already been submitted.",
        existing_image: duplicate,
      });
    }

    const productUuid = crypto.randomUUID();
    const safeCategory = slugify(category);
    const safeSubcategory = slugify(subcategory);
    const safeProduct = slugify(productTitle);
    const baseKey = `master-catalog/${safeCategory}/${safeSubcategory}/${safeProduct}/${productUuid}`;
    const mainKey = `${baseKey}/main.webp`;
    const thumbnailKey = `${baseKey}/thumbnail.webp`;

    const client = getS3Client();
    const [mainUploadUrl, thumbnailUploadUrl] = await Promise.all([
      getSignedUrl(client, new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: mainKey,
        ContentType: "image/webp",
        Metadata: {
          product_id: String(productId),
          vendor_id: String(vendorId),
          storage_purpose: "sabsewa_local_master_catalogue_main",
          rights_terms_version: MASTER_IMAGE_TERMS_VERSION,
        },
      }), { expiresIn: 300 }),
      getSignedUrl(client, new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: thumbnailKey,
        ContentType: "image/webp",
        Metadata: {
          product_id: String(productId),
          vendor_id: String(vendorId),
          storage_purpose: "sabsewa_local_master_catalogue_thumbnail",
          rights_terms_version: MASTER_IMAGE_TERMS_VERSION,
        },
      }), { expiresIn: 300 }),
    ]);

    const { data: consent, error: consentError } = await supabase
      .from("master_product_image_consents")
      .insert({
        product_id: productId,
        source_vendor_id: vendorId,
        source_user_id: userId || null,
        consent_text: MASTER_IMAGE_RIGHTS_TEXT,
        consent_terms_version: MASTER_IMAGE_TERMS_VERSION,
        original_filename: fileName,
        content_checksum: contentChecksum,
        perceptual_hash: perceptualHash || null,
        declared_ownership: true,
        allow_shared_catalogue_use: true,
        metadata: {
          unchecked_by_default_required: true,
          metadata_removed: true,
          square_crop: true,
          moderated_before_approval: Boolean(moderated),
        },
      })
      .select()
      .single();

    if (consentError) throw consentError;

    const { data: image, error: imageError } = await supabase
      .from("master_product_images")
      .insert({
        product_id: productId,
        product_title: productTitle,
        category,
        subcategory,
        s3_object_key: mainKey,
        thumbnail_object_key: thumbnailKey,
        source_type: "vendor_contributed",
        source_vendor_id: vendorId,
        source_user_id: userId || null,
        licence_or_consent_reference: consent.id,
        consent_timestamp: consent.consented_at,
        original_filename: fileName,
        content_checksum: contentChecksum,
        perceptual_hash: perceptualHash || null,
        moderation_status: "pending",
        metadata: {
          standard_object_key_pattern: "master-catalog/{category}/{subcategory}/{product-slug}/{uuid}/main.webp",
          thumbnail_object_key_pattern: "master-catalog/{category}/{subcategory}/{product-slug}/{uuid}/thumbnail.webp",
          quota_note: "Does not count against receiving vendor storage quota after approval.",
        },
      })
      .select()
      .single();

    if (imageError) throw imageError;

    return res.json({
      success: true,
      master_image_id: image.id,
      consent_id: consent.id,
      main_upload_url: mainUploadUrl,
      thumbnail_upload_url: thumbnailUploadUrl,
      s3_object_key: mainKey,
      thumbnail_object_key: thumbnailKey,
      moderation_status: "pending",
      required_confirmation: MASTER_IMAGE_RIGHTS_TEXT,
      expires_in_seconds: 300,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

router.post("/use-master-product-image", async (req, res) => {
  try {
    const { vendorId, vendorItemId, masterImageId } = req.body;
    if (!vendorId || !vendorItemId || !masterImageId) {
      return res.status(400).json({ success: false, error: "Vendor, vendor item and master image are required." });
    }

    const { data: image, error: imageError } = await supabase
      .from("master_product_images")
      .select("id, product_id, moderation_status, takedown_status")
      .eq("id", masterImageId)
      .single();

    if (imageError) throw imageError;
    if (image.moderation_status !== "approved" || image.takedown_status !== "none") {
      return res.status(409).json({ success: false, error: "This master image is not available for vendor reuse." });
    }

    const { data: item, error: itemError } = await supabase
      .from("vendor_items")
      .update({
        master_product_id: image.product_id,
        master_image_id: image.id,
        shared_image_id: null,
        image_reference_type: "master_shared",
      })
      .eq("id", vendorItemId)
      .eq("vendor_id", vendorId)
      .select()
      .single();

    if (itemError) throw itemError;

    return res.json({
      success: true,
      item,
      quota_note: "Reference created only. No S3 copy was created and vendor product-image quota was not consumed.",
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, error: err.message });
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
