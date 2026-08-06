declare const require: any;

export const ALLOWED_PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_ORIGINAL_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1200;
export const TARGET_COMPRESSED_IMAGE_BYTES = 200 * 1024;
export const MAX_PAYMENT_QR_IMAGE_BYTES = 500 * 1024;
export const QR_IMAGE_DIMENSION = 900;

export function validatePickedProductImage(asset: any) {
  const mimeType = asset?.mimeType || asset?.type || "image/jpeg";
  const fileSize = Number(asset?.fileSize || 0);

  if (!ALLOWED_PRODUCT_IMAGE_TYPES.includes(mimeType)) {
    return "Only JPEG, PNG and WebP product images are allowed.";
  }

  if (fileSize && fileSize > MAX_ORIGINAL_IMAGE_BYTES) {
    return "Image is too large. Maximum original upload size is 5 MB.";
  }

  return null;
}

export async function optimizeProductImage(asset: any) {
  const validationError = validatePickedProductImage(asset);
  if (validationError) throw new Error(validationError);

  let optimized = asset;
  try {
    const ImageManipulator = require("expo-image-manipulator");
    optimized = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION } }],
      {
        compress: 0.55,
        format: ImageManipulator.SaveFormat?.WEBP || ImageManipulator.SaveFormat?.JPEG,
      }
    );
  } catch {
    optimized = asset;
  }

  const response = await fetch(optimized.uri);
  const blob = await response.blob();
  const optimizedSize = Number(blob.size || 0);

  if (optimizedSize > TARGET_COMPRESSED_IMAGE_BYTES) {
    throw new Error("Image could not be compressed enough. Please choose a smaller or clearer product image.");
  }

  return {
    asset: optimized,
    blob,
    contentType: blob.type || asset.mimeType || "image/jpeg",
    originalSize: Number(asset.fileSize || blob.size || 0),
    optimizedSize,
    width: Number(optimized.width || asset.width || 0),
    height: Number(optimized.height || asset.height || 0),
  };
}

export async function optimizeQrImage(asset: any) {
  const validationError = validatePickedProductImage(asset);
  if (validationError) throw new Error(validationError);

  let optimized = asset;
  try {
    const ImageManipulator = require("expo-image-manipulator");
    optimized = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: QR_IMAGE_DIMENSION, height: QR_IMAGE_DIMENSION } }],
      {
        compress: 0.9,
        format: ImageManipulator.SaveFormat?.PNG || ImageManipulator.SaveFormat?.JPEG,
      }
    );
  } catch {
    optimized = asset;
  }

  const response = await fetch(optimized.uri);
  const blob = await response.blob();
  const optimizedSize = Number(blob.size || 0);

  if (optimizedSize > MAX_PAYMENT_QR_IMAGE_BYTES) {
    throw new Error("QR image is still too large. Please crop around the QR code and try again.");
  }

  return {
    asset: optimized,
    blob,
    contentType: blob.type || asset.mimeType || "image/png",
    originalSize: Number(asset.fileSize || blob.size || 0),
    optimizedSize,
    width: Number(optimized.width || asset.width || 0),
    height: Number(optimized.height || asset.height || 0),
  };
}
