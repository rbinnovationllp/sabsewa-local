import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet, Switch } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { apiUrl } from "@/lib/backend";
import { optimizeProductImage, validatePickedProductImage } from "@/lib/imageUploadPolicy";

const PRICE_MODES = [
  ["show_price", "Show Price"],
  ["hide_price", "Ask Vendor"],
  ["market_price", "Market Price"],
];

function priceText(item: any) {
  if (item.price_display_mode === "hide_price") return "Price on Request";
  if (item.price_display_mode === "market_price") return "Market Price";
  return `Rs ${Number(item.price || 0).toFixed(2)}${item.price_unit_label ? `/${item.price_unit_label}` : ""}`;
}

export default function EditItem() {
  const params: any = useLocalSearchParams();
  const terminalId = params.terminal;
  const vendorParam = params.vendor as string | undefined;
  const { user } = useAuth();

  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [newPrice, setNewPrice] = useState("");
  const [newStock, setNewStock] = useState("");
  const [newDailyStock, setNewDailyStock] = useState("");
  const [availableToday, setAvailableToday] = useState(true);
  const [priceDisplayMode, setPriceDisplayMode] = useState("show_price");
  const [priceUnitLabel, setPriceUnitLabel] = useState("");
  const [previousPrice, setPreviousPrice] = useState("");
  const [discountLabel, setDiscountLabel] = useState("");
  const [newPhoto, setNewPhoto] = useState<any>(null);
  const [vendorId, setVendorId] = useState<string | null>(vendorParam || null);

  useEffect(() => {
    resolveVendorIdAndLoadItems();
  }, []);

  async function resolveVendorIdAndLoadItems() {
    let resolvedVendorId = vendorParam || null;

    if (!resolvedVendorId && user?.id) {
      const { data } = await supabase
        .from("vendors")
        .select("id")
        .eq("owner_user_id", user.id)
        .single();
      resolvedVendorId = data?.id || null;
    }

    setVendorId(resolvedVendorId);
    if (resolvedVendorId) loadItems(resolvedVendorId);
  }

  async function loadItems(nextVendorId = vendorId) {
    if (!nextVendorId) return;

    const { data, error } = await supabase
      .from("vendor_items")
      .select("*")
      .eq("vendor_id", nextVendorId)
      .eq("terminal_id", terminalId)
      .order("created_at", { ascending: false });

    if (!error) setItems(data || []);
  }

  function startEditing(item: any) {
    setEditing(item);
    setNewPrice(String(item.price || ""));
    setNewStock(item.stock_status || "in_stock");
    setNewDailyStock(item.daily_stock_quantity == null ? "" : String(item.daily_stock_quantity));
    setAvailableToday(item.available_today !== false);
    setPriceDisplayMode(item.price_display_mode || "show_price");
    setPriceUnitLabel(item.price_unit_label || "");
    setPreviousPrice(item.previous_price == null ? "" : String(item.previous_price));
    setDiscountLabel(item.discount_label || "");
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.45,
    });

    if (!result.canceled) {
      const validationError = validatePickedProductImage(result.assets[0]);
      if (validationError) {
        alert(validationError);
        return;
      }
      setNewPhoto(result.assets[0]);
    }
  }

  async function uploadImage(file: any) {
    if (!vendorId) return null;

    const optimizedImage = await optimizeProductImage(file);
    const blob = optimizedImage.blob;
    const fileName = file.fileName || file.uri.split("/").pop() || `product-${Date.now()}.jpg`;
    const contentType = optimizedImage.contentType || file.mimeType || "image/jpeg";

    const presignResponse = await fetch(apiUrl("/api/storage/s3/presign-product-image"), {
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

    return presignJson.public_url;
  }

  async function updateItem(item: any) {
    let updatedPhoto = item.item_pic;
    if (newPhoto) {
      const uploaded = await uploadImage(newPhoto);
      if (uploaded) updatedPhoto = uploaded;
    }

    const updateData: any = {
      price: Number(newPrice || item.price),
      is_available: true,
      available_today: availableToday,
      price_display_mode: priceDisplayMode,
      price_unit_label: priceUnitLabel || null,
      previous_price: previousPrice ? Number(previousPrice) : null,
      discount_label: discountLabel || null,
      price_updated_at: new Date().toISOString(),
      price_updated_by: user?.id || null,
      item_pic: updatedPhoto,
      daily_availability_updated_at: new Date().toISOString(),
    };

    if (newStock) updateData.stock_status = newStock;
    if (newDailyStock) updateData.daily_stock_quantity = Number(newDailyStock);

    const { error } = await supabase.from("vendor_items").update(updateData).eq("id", item.id);
    if (error) {
      alert(error.message);
      return;
    }

    alert("Item updated successfully.");
    setEditing(null);
    setNewPrice("");
    setNewStock("");
    setNewDailyStock("");
    setPriceUnitLabel("");
    setPreviousPrice("");
    setDiscountLabel("");
    setNewPhoto(null);
    loadItems();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Edit Items, Prices & Stock</Text>

      {items.map((item) => (
        <View key={item.id} style={styles.itemBox}>
          <Image source={{ uri: item.item_pic }} style={styles.itemImage} />
          <Text style={styles.itemTitle}>{item.item_name}</Text>
          <Text style={styles.itemDetails}>{priceText(item)}</Text>
          {item.previous_price ? <Text style={styles.muted}>Previous: Rs {Number(item.previous_price).toFixed(2)}</Text> : null}
          {item.discount_label ? <Text style={styles.discount}>{item.discount_label}</Text> : null}
          {item.price_updated_at ? <Text style={styles.muted}>Updated: {new Date(item.price_updated_at).toLocaleString()}</Text> : null}
          <Text style={styles.itemStock}>Stock: {item.stock_status ?? "Available"}</Text>
          <Text style={styles.itemStock}>
            Today: {item.available_today === false ? "Not available" : "Available"}
            {item.daily_stock_quantity != null ? ` | Qty ${item.daily_stock_quantity}` : ""}
          </Text>

          <TouchableOpacity style={styles.editBtn} onPress={() => startEditing(item)}>
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>

          {editing?.id === item.id && (
            <View style={styles.editPanel}>
              <TextInput
                placeholder="Current price"
                style={styles.input}
                keyboardType="numeric"
                value={newPrice}
                onChangeText={setNewPrice}
              />

              <Text style={styles.switchLabel}>Customer price display</Text>
              <View style={styles.modeRow}>
                {PRICE_MODES.map(([value, label]) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.modeBtn, priceDisplayMode === value && styles.modeBtnActive]}
                    onPress={() => setPriceDisplayMode(value)}
                  >
                    <Text style={[styles.modeText, priceDisplayMode === value && styles.modeTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                placeholder="Unit label, e.g. kg / litre / piece / pack"
                style={styles.input}
                value={priceUnitLabel}
                onChangeText={setPriceUnitLabel}
              />
              <TextInput
                placeholder="Previous price, only for genuine discount"
                style={styles.input}
                keyboardType="numeric"
                value={previousPrice}
                onChangeText={setPreviousPrice}
              />
              <TextInput
                placeholder="Discount label, e.g. 10% off"
                style={styles.input}
                value={discountLabel}
                onChangeText={setDiscountLabel}
              />

              <TextInput
                placeholder="Stock Status (in_stock / low_stock / out_of_stock)"
                style={styles.input}
                value={newStock}
                onChangeText={setNewStock}
              />

              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchLabel}>Available today</Text>
                  <Text style={styles.helpText}>Customers can order this item only when this is on.</Text>
                </View>
                <Switch value={availableToday} onValueChange={setAvailableToday} />
              </View>

              <TextInput
                placeholder="Today's available quantity"
                style={styles.input}
                keyboardType="numeric"
                value={newDailyStock}
                onChangeText={setNewDailyStock}
              />

              <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
                <Text style={styles.uploadText}>Upload New Photo</Text>
              </TouchableOpacity>
              <Text style={styles.storageNote}>Allowed: JPEG, PNG, WebP. Original max: 5 MB. Images are compressed to about 100-200 KB before storage.</Text>

              {newPhoto ? <Image source={{ uri: newPhoto.uri }} style={styles.preview} /> : null}

              <TouchableOpacity style={styles.saveBtn} onPress={() => updateItem(item)}>
                <Text style={styles.saveText}>Update</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60 },
  heading: { fontSize: 26, fontWeight: "900", marginBottom: 20 },
  itemBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    backgroundColor: "#f7f7f7",
  },
  itemImage: { width: "100%", height: 150, borderRadius: 10, marginBottom: 10 },
  itemTitle: { fontSize: 18, fontWeight: "900" },
  itemDetails: { color: "#111", fontWeight: "900", marginTop: 4 },
  muted: { color: "#666", fontSize: 12, marginTop: 4 },
  discount: { color: "#16a34a", fontWeight: "900", marginTop: 4 },
  itemStock: { marginTop: 5, fontWeight: "700", color: "green" },
  editBtn: { marginTop: 10, backgroundColor: "#007bff", padding: 10, borderRadius: 8 },
  editText: { color: "#fff", textAlign: "center", fontWeight: "800" },
  editPanel: { marginTop: 15, padding: 15, borderWidth: 1, borderRadius: 10, backgroundColor: "#fff" },
  input: { borderWidth: 1, padding: 12, borderRadius: 8, marginBottom: 10 },
  modeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  modeBtn: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  modeBtnActive: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  modeText: { color: "#333", fontWeight: "800" },
  modeTextActive: { color: "#fff" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, marginBottom: 10 },
  switchLabel: { fontWeight: "900", marginBottom: 6 },
  helpText: { color: "#666", fontSize: 12, lineHeight: 18, marginTop: 2 },
  uploadBtn: { backgroundColor: "#6c757d", padding: 10, borderRadius: 8 },
  uploadText: { color: "#fff", textAlign: "center", fontWeight: "700" },
  storageNote: { color: "#666", fontSize: 12, lineHeight: 18, marginTop: 8, marginBottom: 8 },
  preview: { width: "100%", height: 150, borderRadius: 10, marginVertical: 10 },
  saveBtn: { backgroundColor: "green", padding: 12, borderRadius: 10 },
  saveText: { color: "#fff", textAlign: "center", fontWeight: "800" },
  cancelBtn: { marginTop: 10, backgroundColor: "#dc3545", padding: 12, borderRadius: 10 },
  cancelText: { color: "#fff", textAlign: "center", fontWeight: "800" },
});
