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
  const [priceDisplayMode, setPriceDisplayMode] = useState<"show_price" | "hide_price" | "market_price">("show_price");
  const [unitLabel, setUnitLabel] = useState("");
  const [mrp, setMrp] = useState("");
  const [brandName, setBrandName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [variantName, setVariantName] = useState("");
  const [packSize, setPackSize] = useState("");
  const [packUnit, setPackUnit] = useState("");
  const [availableQty, setAvailableQty] = useState("");
  const [barcode, setBarcode] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [substitutionPolicy, setSubstitutionPolicy] = useState("customer_approval_required");
  const [variantMissing, setVariantMissing] = useState(false);
  const [shareImage, setShareImage] = useState(false);
  const [sharedImages, setSharedImages] = useState<any[]>([]);
  const [selectedSharedImage, setSelectedSharedImage] = useState<any>(null);
  const [masterImages, setMasterImages] = useState<any[]>([]);
  const [selectedMasterImage, setSelectedMasterImage] = useState<any>(null);

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
    try {
      const response = await fetch(apiUrl("/api/catalog/list"));
      const json = await response.json();
      if (response.ok && json.success) {
        setCatalog(json.items || []);
        return;
      }
    } catch {
      // Fallback to Supabase direct read for local/dev sessions.
    }

    const { data } = await supabase.from("master_product_catalog").select("*").eq("is_active", true).order("standard_title");
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
      setSelectedSharedImage(null);
      setSelectedMasterImage(null);
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

  async function searchMasterImages() {
    const response = await fetch(apiUrl(`/api/storage/s3/master-product-images?search=${encodeURIComponent(itemName)}`));
    const json = await response.json();
    if (!response.ok || !json.success) {
      alert(json.error || "Unable to search master catalogue images.");
      return;
    }
    setMasterImages(json.images || []);
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

    if (priceDisplayMode === "show_price" && !price) {
      alert("Please enter a selling price or choose Ask Vendor / Market Price.");
      return;
    }

    setLoading(true);

    let finalImageUrl = null;
    let finalItemName = itemName;
    let sharedImageId = null;
    let masterProductId = null;
    let masterImageId = null;
    let imageReferenceType = "image_pending";

    // If vendor selected a catalog item
    if (selectedCatalogItem) {
      finalImageUrl = selectedCatalogItem.image_url || null;
      finalItemName = selectedCatalogItem.standard_title || selectedCatalogItem.name;
      masterProductId = selectedCatalogItem.id;
    }

    if (selectedSharedImage) {
      finalImageUrl = selectedSharedImage.public_url;
      finalItemName = finalItemName || selectedSharedImage.product_name;
      sharedImageId = selectedSharedImage.id;
      imageReferenceType = "master_shared";
    }

    if (selectedMasterImage) {
      finalImageUrl = selectedMasterImage.thumbnail_url || selectedMasterImage.image_url;
      finalItemName = finalItemName || selectedMasterImage.product_title;
      masterProductId = selectedMasterImage.product_id;
      masterImageId = selectedMasterImage.id;
      imageReferenceType = "master_shared";
    }

    // If vendor uploaded a new photo
    if (photo) {
      const uploaded = await uploadToStorage(photo);
      finalImageUrl = uploaded?.publicUrl || null;
      sharedImageId = uploaded?.sharedImageId || null;
      imageReferenceType = uploaded?.sharedImageId ? "master_shared" : "vendor_private";
    }

    if (!finalItemName?.trim()) {
      alert("Please enter or select an item name.");
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
      master_product_id: masterProductId,
      master_image_id: masterImageId,
      image_reference_type: finalImageUrl ? imageReferenceType : "image_pending",
      generic_product_name: selectedCatalogItem?.standard_title || finalItemName,
      brand_name: brandName.trim() || null,
      manufacturer: manufacturer.trim() || null,
      variant_name: variantName.trim() || null,
      pack_size: packSize ? Number(packSize) : null,
      pack_unit: packUnit.trim() || null,
      barcode: barcode.trim() || null,
      mrp: mrp ? Number(mrp) : null,
      expiry_date: expiryDate.trim() || null,
      substitution_policy: substitutionPolicy,
      listing_review_status: variantMissing ? "pending_review" : "approved",
      listing_review_reason: variantMissing ? "Brand or pack-size variant submitted by vendor for company validation." : null,
      price: price ? Number(price) : 0,
      price_display_mode: priceDisplayMode,
      price_unit_label: unitLabel || packUnit || null,
      price_updated_at: new Date().toISOString(),
      price_updated_by: user?.id || null,
      is_available: true,
      available_today: true,
      stock_status: "in_stock",
      stock_quantity: availableQty ? Number(availableQty) : null,
      daily_stock_quantity: availableQty ? Number(availableQty) : null,
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
      <Text style={styles.section}>Choose from SabSewa Master Catalogue</Text>
      <Text style={styles.storageNote}>
        Product names, units and categories are standardised. Images are shown only when approved for reuse; otherwise the item remains image pending.
      </Text>

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
            setSelectedMasterImage(null);
            setPhoto(null); // clear uploaded image
            setItemName(item.standard_title || item.name);
          }}
        >
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.catalogImage} />
          ) : (
            <View style={styles.placeholderThumb}>
              <Text style={styles.placeholderText}>Image pending</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.catalogText}>{item.standard_title || item.name}</Text>
            <Text style={styles.storageNote}>
              {item.category} / {item.subcategory || "general"} | {(item.common_units || [item.default_unit]).filter(Boolean).join(", ")}
            </Text>
          </View>
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

      <TouchableOpacity style={styles.sharedBtn} onPress={searchMasterImages}>
        <Text style={styles.sharedText}>Search Approved Master Catalogue Images</Text>
      </TouchableOpacity>

      {sharedImages.map((image) => (
        <TouchableOpacity
          key={image.id}
          style={[styles.sharedImageRow, selectedSharedImage?.id === image.id && styles.selectedSharedImage]}
          onPress={() => {
            setSelectedSharedImage(image);
            setSelectedMasterImage(null);
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

      {masterImages.map((image) => (
        <TouchableOpacity
          key={image.id}
          style={[styles.sharedImageRow, selectedMasterImage?.id === image.id && styles.selectedSharedImage]}
          onPress={() => {
            setSelectedMasterImage(image);
            setSelectedSharedImage(null);
            setPhoto(null);
            setItemName(image.product_title);
          }}
        >
          <Image source={{ uri: image.thumbnail_url || image.image_url }} style={styles.sharedThumb} />
          <View style={{ flex: 1 }}>
            <Text style={styles.catalogText}>{image.product_title}</Text>
            <Text style={styles.storageNote}>Approved master image reference. No copy is created and your quota is not used.</Text>
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

      <Text style={styles.section}>Brand, Variant and Pack Size</Text>
      <TouchableOpacity style={styles.consentRow} onPress={() => setVariantMissing((value) => !value)}>
        <View style={[styles.checkbox, variantMissing && styles.checked]}>{variantMissing ? <Text style={styles.checkText}>✓</Text> : null}</View>
        <Text style={styles.consentText}>Brand/variant not listed. Submit this item for company review while using it in my shop subject to moderation.</Text>
      </TouchableOpacity>

      <TextInput
        placeholder="Brand name, e.g. Sunflower / Aastha / Raja"
        style={styles.input}
        value={brandName}
        onChangeText={setBrandName}
      />

      <TextInput
        placeholder="Manufacturer, if known"
        style={styles.input}
        value={manufacturer}
        onChangeText={setManufacturer}
      />

      <TextInput
        placeholder="Variant/type, e.g. Whole Wheat Atta"
        style={styles.input}
        value={variantName}
        onChangeText={setVariantName}
      />

      <View style={styles.row}>
        <TextInput
          placeholder="Pack size"
          keyboardType="numeric"
          style={[styles.input, styles.rowInput]}
          value={packSize}
          onChangeText={setPackSize}
        />
        <TextInput
          placeholder="Unit, e.g. kg"
          style={[styles.input, styles.rowInput]}
          value={packUnit}
          onChangeText={setPackUnit}
        />
      </View>

      <TextInput
        placeholder="Barcode / SKU / EAN, if available"
        style={styles.input}
        value={barcode}
        onChangeText={setBarcode}
      />

      <Text style={styles.section}>Price Display</Text>
      <View style={styles.optionRow}>
        {[
          ["show_price", "Show Price"],
          ["hide_price", "Ask Vendor"],
          ["market_price", "Market Price"],
        ].map(([value, label]) => (
          <TouchableOpacity
            key={value}
            style={[styles.optionChip, priceDisplayMode === value && styles.optionSelected]}
            onPress={() => setPriceDisplayMode(value as "show_price" | "hide_price" | "market_price")}
          >
            <Text style={[styles.optionText, priceDisplayMode === value && styles.optionSelectedText]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.storageNote}>
        Show Price displays the amount to customers. Ask Vendor hides the price until you quote. Market Price lets you revise the price before confirming the order.
      </Text>

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

      <TextInput
        placeholder="MRP, where applicable"
        keyboardType="numeric"
        style={styles.input}
        value={mrp}
        onChangeText={setMrp}
      />

      <TextInput
        placeholder="Available quantity"
        keyboardType="numeric"
        style={styles.input}
        value={availableQty}
        onChangeText={setAvailableQty}
      />

      <TextInput
        placeholder="Expiry / best-before date, e.g. 2026-12-31"
        style={styles.input}
        value={expiryDate}
        onChangeText={setExpiryDate}
      />

      <Text style={styles.section}>Substitution Policy</Text>
      <View style={styles.optionRow}>
        {[
          ["customer_approval_required", "Customer approval"],
          ["no_substitution", "No substitution"],
          ["allow_same_brand_different_pack", "Same brand only"],
          ["allow_any_brand_with_customer_approval", "Any brand with approval"],
        ].map(([value, label]) => (
          <TouchableOpacity
            key={value}
            style={[styles.optionChip, substitutionPolicy === value && styles.optionSelected]}
            onPress={() => setSubstitutionPolicy(value)}
          >
            <Text style={[styles.optionText, substitutionPolicy === value && styles.optionSelectedText]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={styles.saveBtn}
        onPress={saveItem}
        disabled={loading}
      >
        <Text style={styles.saveText}>{loading ? "Saving..." : "Save Item"}</Text>
      </TouchableOpacity>
      <Text style={styles.storageNote}>
        If no authorised image is selected, SabSewa Local saves the item with image_pending. Do not copy or upload images from third-party commercial websites.
      </Text>
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
  placeholderThumb: {
    width: 58,
    height: 58,
    marginRight: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { color: "#64748b", fontSize: 10, textAlign: "center", fontWeight: "800" },
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
  row: { flexDirection: "row", gap: 10 },
  rowInput: { flex: 1 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  optionChip: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  optionSelected: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  optionText: { color: "#334155", fontWeight: "800" },
  optionSelectedText: { color: "#fff" },
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


