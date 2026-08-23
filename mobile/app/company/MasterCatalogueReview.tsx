import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";
import { optimizeProductImage } from "@/lib/imageUploadPolicy";

const MASTER_IMAGE_RIGHTS_TEXT =
  "I own this image or have permission to use it, and I authorise SabSewa Local to include it in the shared master catalogue and allow other registered vendors to reference it in their digital shops.";

type MasterProduct = {
  id: string;
  standard_title: string;
  category: string;
  subcategory: string;
  image_status?: string;
  generic_image_url?: string | null;
  local_names?: Record<string, any>;
};

async function sha256Hex(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function makeThumbnail(assetUri: string) {
  const optimized = await ImageManipulator.manipulateAsync(
    assetUri,
    [{ resize: { width: 320, height: 320 } }],
    { compress: 0.45, format: ImageManipulator.SaveFormat.WEBP || ImageManipulator.SaveFormat.JPEG }
  );
  const response = await fetch(optimized.uri);
  const blob = await response.blob();
  if (blob.size > 40 * 1024) {
    throw new Error("Thumbnail is larger than 40 KB. Please crop a clearer square image and try again.");
  }
  return { blob, contentType: blob.type || "image/webp", size: blob.size };
}

export default function MasterCatalogueReviewScreen() {
  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState<MasterProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<MasterProduct | null>(null);
  const [recentImages, setRecentImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const selectedTitle = useMemo(() => selectedProduct?.standard_title || "No product selected", [selectedProduct]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (productSearch.trim()) query.set("search", productSearch.trim());
      const response = await authenticatedFetch(`/api/catalog/setup/products?${query.toString()}`);
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load master catalogue.");
      setProducts((json.products || []).slice(0, 40));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to load master catalogue.");
    } finally {
      setLoading(false);
    }
  };

  const loadRecentImages = async () => {
    try {
      const response = await authenticatedFetch("/api/storage/s3/admin/master-product-images");
      const json = await response.json();
      if (response.ok && json.success) setRecentImages(json.images || []);
    } catch {
      // Non-blocking: upload form remains usable even if recent image list fails.
    }
  };

  useEffect(() => {
    loadProducts();
    loadRecentImages();
  }, []);

  const uploadMasterImage = async () => {
    setStatusMessage("");
    if (!selectedProduct) {
      setStatusMessage("Select a master product before uploading an image.");
      return;
    }
    if (!rightsConfirmed) {
      setStatusMessage("Confirm the image rights declaration before upload.");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setStatusMessage("Photo permission was not granted.");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (picked.canceled || !picked.assets?.[0]) return;

    setUploading(true);
    try {
      const asset = picked.assets[0];
      const optimized = await optimizeProductImage(asset);
      const thumbnail = await makeThumbnail(optimized.asset.uri);
      const checksum = await sha256Hex(optimized.blob);
      const fileName = asset.fileName || `${selectedProduct.standard_title}.webp`;

      const presignResponse = await authenticatedFetch("/api/storage/s3/admin/presign-master-catalog-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          fileName,
          mainFileSize: optimized.optimizedSize,
          thumbnailFileSize: thumbnail.size,
          contentChecksum: checksum,
          productTitle: selectedProduct.standard_title,
          category: selectedProduct.category,
          subcategory: selectedProduct.subcategory,
          rightsConfirmed: true,
          rightsConfirmationText: MASTER_IMAGE_RIGHTS_TEXT,
          sourceType: "sabsewa_commissioned",
          metadataRemoved: true,
          squareCrop: true,
          moderationStatus: "approved",
        }),
      });
      const presignJson = await presignResponse.json();
      if (!presignResponse.ok || !presignJson.success) throw new Error(presignJson.error || "Unable to prepare upload.");

      const [mainUpload, thumbUpload] = await Promise.all([
        fetch(presignJson.main_upload_url, { method: "PUT", headers: { "Content-Type": optimized.contentType || "image/webp" }, body: optimized.blob }),
        fetch(presignJson.thumbnail_upload_url, { method: "PUT", headers: { "Content-Type": thumbnail.contentType || "image/webp" }, body: thumbnail.blob }),
      ]);
      if (!mainUpload.ok || !thumbUpload.ok) throw new Error("S3 upload failed. Please try again.");

      setStatusMessage(`Master image uploaded and approved for ${selectedProduct.standard_title}.`);
      setRightsConfirmed(false);
      await loadProducts();
      await loadRecentImages();
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Master image upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Master Catalogue Governance" />
      <Text style={styles.heading}>Master Catalogue Image Review</Text>
      <Text style={styles.subtitle}>
        Upload only owned, authorised, licensed or SabSewa-commissioned product images. Approved images are stored privately and served through controlled URLs.
      </Text>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Find Master Product</Text>
        <TextInput
          style={styles.input}
          value={productSearch}
          onChangeText={setProductSearch}
          placeholder="Search product name, category or local name"
        />
        <TouchableOpacity style={styles.primaryBtn} onPress={loadProducts} disabled={loading}>
          <Text style={styles.primaryText}>{loading ? "Searching..." : "Search Master Catalogue"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.productGrid}>
        {products.map((product) => (
          <TouchableOpacity
            key={product.id}
            style={[styles.productCard, selectedProduct?.id === product.id && styles.productSelected]}
            onPress={() => setSelectedProduct(product)}
          >
            <Text style={styles.productTitle}>{product.standard_title}</Text>
            <Text style={styles.meta}>{product.category} | {product.subcategory}</Text>
            <Text style={styles.meta}>Image: {product.image_status || "image_pending"}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Upload Image For: {selectedTitle}</Text>
        <TouchableOpacity style={styles.checkboxRow} onPress={() => setRightsConfirmed((current) => !current)}>
          <View style={[styles.checkbox, rightsConfirmed && styles.checkboxSelected]}>
            <Text style={styles.checkboxMark}>{rightsConfirmed ? "✓" : ""}</Text>
          </View>
          <Text style={styles.rightsText}>{MASTER_IMAGE_RIGHTS_TEXT}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.uploadBtn} onPress={uploadMasterImage} disabled={uploading || !selectedProduct}>
          <Text style={styles.primaryText}>{uploading ? "Uploading..." : "Choose Image and Upload"}</Text>
        </TouchableOpacity>
        {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Recent Master Images</Text>
        {recentImages.length === 0 ? (
          <Text style={styles.muted}>No recent master images found.</Text>
        ) : (
          recentImages.map((image) => (
            <View key={image.id} style={styles.imageRow}>
              {image.thumbnail_url ? <Image source={{ uri: image.thumbnail_url }} style={styles.thumb} /> : null}
              <View style={styles.imageBody}>
                <Text style={styles.productTitle}>{image.product_title}</Text>
                <Text style={styles.meta}>{image.category} | {image.subcategory}</Text>
                <Text style={styles.meta}>Status: {image.moderation_status} | Source: {image.source_type}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#ffffff", paddingBottom: 50 },
  heading: { fontSize: 24, fontWeight: "900", color: "#111827", marginBottom: 8 },
  subtitle: { color: "#475569", lineHeight: 20, marginBottom: 14 },
  panel: { padding: 14, borderWidth: 1, borderColor: "#dbeafe", borderRadius: 8, marginBottom: 14, backgroundColor: "#f8fbff" },
  panelTitle: { fontSize: 17, fontWeight: "900", color: "#0f172a", marginBottom: 10 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, backgroundColor: "#fff", marginBottom: 10 },
  primaryBtn: { backgroundColor: "#1166ff", padding: 13, borderRadius: 8, alignItems: "center" },
  uploadBtn: { backgroundColor: "#16a34a", padding: 13, borderRadius: 8, alignItems: "center", marginTop: 12 },
  primaryText: { color: "#fff", fontWeight: "900" },
  productGrid: { gap: 10, marginBottom: 14 },
  productCard: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 12, backgroundColor: "#fff" },
  productSelected: { borderColor: "#16a34a", backgroundColor: "#f0fdf4" },
  productTitle: { fontSize: 15, fontWeight: "900", color: "#0f172a" },
  meta: { color: "#64748b", marginTop: 3, lineHeight: 18 },
  checkboxRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  checkbox: { width: 26, height: 26, borderWidth: 1, borderColor: "#0f766e", borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  checkboxSelected: { backgroundColor: "#0f766e" },
  checkboxMark: { color: "#fff", fontWeight: "900" },
  rightsText: { flex: 1, color: "#334155", lineHeight: 20 },
  statusText: { marginTop: 10, color: "#1e40af", fontWeight: "800", lineHeight: 20 },
  muted: { color: "#64748b" },
  imageRow: { flexDirection: "row", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: "#e5e7eb" },
  imageBody: { flex: 1 },
});
