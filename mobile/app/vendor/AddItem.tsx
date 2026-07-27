import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, TextInput, Image, StyleSheet, ScrollView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { apiUrl } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";
import { optimizeProductImage, validatePickedProductImage } from "@/lib/imageUploadPolicy";

const SHARED_IMAGE_RIGHTS_TEXT =
  "I own this image or have permission to use it, and I authorise SabSewa Local to make it available to other registered vendors for use in their digital shops.";

export default function AddItem() {
  const { user } = useAuth();
  const params: any = useLocalSearchParams();
  const router = useRouter();

  const terminalId = params.terminal;
  const vendorParam = params.vendor as string | undefined;

  const [catalog, setCatalog] = useState([]);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState(null);

  const [photo, setPhoto] = useState(null);
  const [itemName, setItemName] = useState("");
  const [price, setPrice] = useState("");
  const [unitLabel, setUnitLabel] = useState("");
  const [shareImage, setShareImage] = useState(false);
  const [sharedImages, setSharedImages] = useState<any[]>([]);
  const [selectedSharedImage, setSelectedSharedImage] = useState<any>(null);

  const [loading, setLoading] = useState(false);
  const [vendorId, setVendorId] = useState<string | null>(vendorParam || null);

  useEffect(() => {
    loadCatalog();
    resolveVendorId();
  }, []);

  async function resolveVendorId() {
    if (vendorParam) {
      setVendorId(vendorParam);
      return;
    }

    if (!user?.id) return;

    const { data, error } = await supabase
      .from("vendors")
      .select("id")
      .eq("owner_user_id", user.id)
      .single();

    if (!error && data?.id) setVendorId(data.id);
  }

  async function loadCatalog() {
    const { data } = await supabase.from("catalog_items").select("*").order("name");
    if (data) setCatalog(data);
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: false,
      allowsEditing: true,
      quality: 0.45,
    });

    if (!result.canceled) {
      const validationError = validatePickedProductImage(result.assets[0]);
      if (validationError) {
        alert(validationError);
        return;
      }
      setPhoto(result.assets[0]);
      setSelectedCatalogItem(null); // clear selection
    }
  }

  async function uploadToStorage(file) {
    if (!vendorId) return null;

    const optimizedImage = await optimizeProductImage(file);
    const blob = optimizedImage.blob;
    const fileName = file.fileName || file.uri.split("/").pop() || `product-${Date.now()}.jpg`;
    const contentType = optimizedImage.contentType || file.mimeType || "image/jpeg";

    const endpoint = shareImage
      ? "/api/storage/s3/presign-shared-product-image"
      : "/api/storage/s3/presign-product-image";

    const presignResponse = await fetch(apiUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorId,
        fileName,
        contentType,
        fileSize: optimizedImage.optimizedSize,
        originalFileSize: optimizedImage.originalSize,
        imageWidth: optimizedImage.width,
        imageHeight: optimizedImage.height,
        optimized: true,
        productName: itemName,
        rightsConfirmed: shareImage,
        rightsConfirmationText: shareImage ? SHARED_IMAGE_RIGHTS_TEXT : undefined,
      }),
    });

    const presignJson = await presignResponse.json();
    if (!presignResponse.ok || !presignJson.success) {
      alert(presignJson.error || "Unable to prepare image upload.");
      return null;
    }

    const uploadResponse = await fetch(presignJson.upload_url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });

    if (!uploadResponse.ok) {
      alert("Image upload failed. Please try again.");
      return null;
    }

    if (!shareImage) {
      const confirmResponse = await fetch(apiUrl("/api/storage/s3/confirm-product-image"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId,
          storageFileId: presignJson.storage_file_id,
          objectKey: presignJson.object_key,
        }),
      });

      const confirmJson = await confirmResponse.json();
      if (!confirmResponse.ok || !confirmJson.success) {
        alert(confirmJson.error || "Image uploaded, but storage usage could not be confirmed.");
        return null;
      }

      const warning = confirmJson.usage?.warning_level;
      if (warning && warning !== "none") {
        alert(`Storage warning: ${warning.replace("_", "% ")} used. Uploads stop at 100% quota.`);
      }
    } else {
      alert("Shared image submitted. Other vendors can reuse it only after company approval.");
    }

    return {
      publicUrl: presignJson.public_url,
      sharedImageId: presignJson.shared_image_id || null,
    };
  }

  async function searchSharedImages() {
    const response = await fetch(apiUrl(`/api/storage/s3/shared-product-images?search=${encodeURIComponent(itemName)}`));
    const json = await response.json();
    if (!response.ok || !json.success) {
      alert(json.error || "Unable to search shared images.");
      return;
    }
    setSharedImages(json.images || []);
  }

  async function saveItem() {
    if (!vendorId) {
      alert("Vendor profile not found. Please complete vendor setup first.");
      return;
    }

    if (!terminalId) {
      alert("Please select a terminal before adding an item.");
      return;
    }

    if (!price) {
      alert("Please enter a price");
      return;
    }

    setLoading(true);

    let finalImageUrl = null;
    let finalItemName = itemName;
    let sharedImageId = null;

    // If vendor selected a catalog item
    if (selectedCatalogItem) {
      finalImageUrl = selectedCatalogItem.image_url;
      finalItemName = selectedCatalogItem.name;
    }

    if (selectedSharedImage) {
      finalImageUrl = selectedSharedImage.public_url;
      finalItemName = finalItemName || selectedSharedImage.product_name;
      sharedImageId = selectedSharedImage.id;
    }

    // If vendor uploaded a new photo
    if (photo) {
      const uploaded = await uploadToStorage(photo);
      finalImageUrl = uploaded?.publicUrl || null;
      sharedImageId = uploaded?.sharedImageId || null;
    }

    if (!finalImageUrl) {
      alert("Please select or upload an image.");
      setLoading(false);
      return;
    }

    // INSERT ITEM
    const { error } = await supabase.from("vendor_items").insert({
      vendor_id: vendorId,
      terminal_id: terminalId,
      item_name: finalItemName,
      item_pic: finalImageUrl,
      shared_image_id: sharedImageId,
      price: Number(price),
      price_display_mode: "show_price",
      price_unit_label: unitLabel || null,
      price_updated_at: new Date().toISOString(),
      price_updated_by: user?.id || null,
      is_available: true,
      available_today: true,
      stock_status: "in_stock",
      daily_availability_updated_at: new Date().toISOString(),
    });

    setLoading(false);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Item added successfully!");
    router.back();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Add Item</Text>

      {/* Select from Company Catalog */}
      <Text style={styles.section}>Choose from Company List</Text>

      {catalog.map((item) => (
        <TouchableOpacity
          key={item.id}
          style={[
            styles.catalogItem,
            selectedCatalogItem?.id === item.id && { borderColor: "green" },
          ]}
          onPress={() => {
            setSelectedCatalogItem(item);
            setSelectedSharedImage(null);
            setPhoto(null); // clear uploaded image
            setItemName(item.name);
          }}
        >
          <Image source={{ uri: item.image_url }} style={styles.catalogImage} />
          <Text style={styles.catalogText}>{item.name}</Text>
        </TouchableOpacity>
      ))}

      {/* Upload Photo */}
      <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
        <Text style={styles.uploadText}>📸 Upload Your Item Photo</Text>
      </TouchableOpacity>
      <Text style={styles.storageNote}>
        Allowed: JPEG, PNG, WebP. Original image max: 5 MB. The app compresses images to about 100-200 KB and max 1200 x 1200 before storage.
      </Text>

      <TouchableOpacity style={styles.consentRow} onPress={() => setShareImage((value) => !value)}>
        <View style={[styles.checkbox, shareImage && styles.checked]}>{shareImage ? <Text style={styles.checkText}>✓</Text> : null}</View>
        <Text style={styles.consentText}>{SHARED_IMAGE_RIGHTS_TEXT}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.sharedBtn} onPress={searchSharedImages}>
        <Text style={styles.sharedText}>Search Approved Shared Images</Text>
      </TouchableOpacity>

      {sharedImages.map((image) => (
        <TouchableOpacity
          key={image.id}
          style={[styles.sharedImageRow, selectedSharedImage?.id === image.id && styles.selectedSharedImage]}
          onPress={() => {
            setSelectedSharedImage(image);
            setPhoto(null);
            setSelectedCatalogItem(null);
            setItemName(image.product_name);
          }}
        >
          <Image source={{ uri: image.public_url }} style={styles.sharedThumb} />
          <View style={{ flex: 1 }}>
            <Text style={styles.catalogText}>{image.product_name}</Text>
            <Text style={styles.storageNote}>Approved shared image. Does not count against your storage quota.</Text>
          </View>
        </TouchableOpacity>
      ))}

      {photo && (
        <Image source={{ uri: photo.uri }} style={styles.preview} />
      )}

      {/* Item Name (editable if custom) */}
      {!selectedCatalogItem && (
        <TextInput
          placeholder="Item Name"
          style={styles.input}
          value={itemName}
          onChangeText={setItemName}
        />
      )}

      {/* Price */}
      <TextInput
        placeholder="Set Price (₹)"
        keyboardType="numeric"
        style={styles.input}
        value={price}
        onChangeText={setPrice}
      />

      <TextInput
        placeholder="Unit label, e.g. kg / litre / piece / pack"
        style={styles.input}
        value={unitLabel}
        onChangeText={setUnitLabel}
      />

      {/* Save Button */}
      <TouchableOpacity
        style={styles.saveBtn}
        onPress={saveItem}
        disabled={loading}
      >
        <Text style={styles.saveText}>{loading ? "Saving..." : "Save Item"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60 },
  heading: { fontSize: 26, fontWeight: "900", marginBottom: 20 },
  section: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  catalogItem: {
    flexDirection: "row",
    padding: 10,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: "center",
  },
  catalogImage: { width: 50, height: 50, marginRight: 10 },
  catalogText: { fontSize: 16, fontWeight: "600" },
  uploadBtn: {
    marginVertical: 20,
    backgroundColor: "#007bff",
    padding: 12,
    borderRadius: 10,
  },
  uploadText: { color: "#fff", fontWeight: "700", textAlign: "center" },
  storageNote: { color: "#666", fontSize: 12, lineHeight: 18, marginTop: -12, marginBottom: 16 },
  consentRow: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 12 },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: "#777", borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: "#007bff", borderColor: "#007bff" },
  checkText: { color: "#fff", fontWeight: "900" },
  consentText: { flex: 1, color: "#444", lineHeight: 19, fontSize: 12 },
  sharedBtn: { borderWidth: 1, borderColor: "#007bff", padding: 12, borderRadius: 10, marginBottom: 12 },
  sharedText: { color: "#007bff", fontWeight: "900", textAlign: "center" },
  sharedImageRow: { flexDirection: "row", gap: 10, borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, marginBottom: 10 },
  selectedSharedImage: { borderColor: "green", backgroundColor: "#f0fdf4" },
  sharedThumb: { width: 54, height: 54, borderRadius: 8 },
  preview: { width: "100%", height: 200, borderRadius: 10, marginBottom: 20 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
  },
  saveBtn: {
    backgroundColor: "green",
    padding: 15,
    borderRadius: 10,
  },
  saveText: {
    color: "#fff",
    fontWeight: "800",
    textAlign: "center",
    fontSize: 16,
  },
});


