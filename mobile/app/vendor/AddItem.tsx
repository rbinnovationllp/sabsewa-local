import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Image,
  StyleSheet,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { apiUrl } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";

export default function AddItem() {
  const { user } = useAuth();
  const params: any = useLocalSearchParams();
  const router = useRouter();

  const terminalId = params.terminal;
  const vendorParam = params.vendor as string | undefined;

  const [catalog, setCatalog] = useState<any[]>([]);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<any>(null);

  const [photo, setPhoto] = useState<any>(null);
  const [itemName, setItemName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [price, setPrice] = useState("");
  const [priceType, setPriceType] = useState<"actual" | "mrp">("actual");
  const [unitLabel, setUnitLabel] = useState("pcs");
  const [availableQty, setAvailableQty] = useState("100");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [declarationModalVisible, setDeclarationModalVisible] = useState(false);

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

    const { data } = await supabase
      .from("vendors")
      .select("id")
      .eq("owner_user_id", user.id)
      .single();

    if (data?.id) setVendorId(data.id);
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
      // Fallback
    }
    const { data } = await supabase.from("master_product_catalog").select("*").eq("is_active", true).limit(50);
    if (data) setCatalog(data);
  }

  // Camera Capture
  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera Access", "Camera permission is required to capture product photos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0]);
      setSelectedCatalogItem(null);
    }
  }

  // Gallery Picker
  async function pickGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0]);
      setSelectedCatalogItem(null);
    }
  }

  async function saveItem() {
    if (!vendorId) {
      Alert.alert("Vendor Required", "Vendor profile not found.");
      return;
    }
    if (!terminalId) {
      Alert.alert("Terminal Required", "Please select a terminal before adding an item.");
      return;
    }
    if (!selectedCatalogItem && !itemName.trim()) {
      Alert.alert("Required", "Product Name is mandatory.");
      return;
    }
    if (!price || isNaN(Number(price))) {
      Alert.alert("Required", "Please enter a valid selling price.");
      return;
    }
    if (!declarationAccepted) {
      setDeclarationModalVisible(true);
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("vendor_id", vendorId);
      formData.append("terminal_id", String(terminalId));
      formData.append("product_name", selectedCatalogItem ? selectedCatalogItem.standard_title : itemName.trim());
      formData.append("brand_name", brandName.trim());
      formData.append("price", price);
      formData.append("price_type", priceType);
      formData.append("unit", unitLabel.trim() || "pcs");
      formData.append("stock", availableQty || "100");
      formData.append("vendor_declaration_accepted", "true");

      if (selectedCatalogItem?.id) {
        formData.append("master_product_id", selectedCatalogItem.id);
      }

      if (photo) {
        const filename = photo.uri.split("/").pop() || "product.jpg";
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;
        formData.append("image", { uri: photo.uri, name: filename, type } as any);
      }

      const response = await fetch(apiUrl("/api/catalog/upload-product"), {
        method: "POST",
        body: formData,
      });

      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Failed to publish item.");

      if (json.requires_licence) {
        Alert.alert("Restricted Product", json.message);
      } else {
        Alert.alert("Success", "Item published to your store!");
      }
      router.back();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Unable to save item.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Add Product</Text>

      {/* 1. Camera / Photo Capture */}
      <View style={styles.panel}>
        {photo ? (
          <View style={styles.previewContainer}>
            <Image source={{ uri: photo.uri }} style={styles.previewImage} />
            <TouchableOpacity style={styles.retakeBtn} onPress={takePhoto}>
              <Text style={styles.retakeText}>📷 Retake Photo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
              <Text style={styles.btnText}>📷 Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.galleryBtn} onPress={pickGallery}>
              <Text style={styles.secondaryText}>🖼 Choose Gallery</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* 2. Choose from Master Catalogue */}
      <Text style={styles.section}>Or Choose from Master Catalogue</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        {catalog.slice(0, 10).map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.catalogChip, selectedCatalogItem?.id === item.id && styles.catalogChipSelected]}
            onPress={() => {
              setSelectedCatalogItem(item);
              setItemName(item.standard_title || item.name);
            }}
          >
            <Text style={[styles.chipText, selectedCatalogItem?.id === item.id && styles.chipTextSelected]}>
              {item.standard_title || item.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 3. Item Information */}
      <View style={styles.panel}>
        <Text style={styles.label}>Product Name *</Text>
        <TextInput
          placeholder="Product Name"
          style={styles.input}
          value={selectedCatalogItem ? selectedCatalogItem.standard_title : itemName}
          onChangeText={setItemName}
          editable={!selectedCatalogItem}
        />

        <Text style={styles.label}>Brand Name (Optional)</Text>
        <TextInput placeholder="Brand Name" style={styles.input} value={brandName} onChangeText={setBrandName} />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Price (₹) *</Text>
            <TextInput placeholder="Price" keyboardType="numeric" style={styles.input} value={price} onChangeText={setPrice} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.label}>Price Type</Text>
            <TouchableOpacity style={styles.input} onPress={() => setPriceType(priceType === "actual" ? "mrp" : "actual")}>
              <Text style={{ fontWeight: "800" }}>{priceType === "mrp" ? "MRP" : "Selling Price"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Unit</Text>
            <TextInput placeholder="pcs / kg / ltr" style={styles.input} value={unitLabel} onChangeText={setUnitLabel} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.label}>Stock Quantity</Text>
            <TextInput placeholder="100" keyboardType="numeric" style={styles.input} value={availableQty} onChangeText={setAvailableQty} />
          </View>
        </View>
      </View>

      {/* Declaration */}
      <TouchableOpacity style={styles.checkboxRow} onPress={() => setDeclarationAccepted(!declarationAccepted)}>
        <Text style={styles.checkbox}>{declarationAccepted ? "☑" : "☐"}</Text>
        <Text style={styles.declarationText}>I confirm product details, pricing, and regulatory compliance are accurate.</Text>
      </TouchableOpacity>

      {/* Save Button */}
      <TouchableOpacity style={[styles.saveBtn, loading && styles.disabled]} onPress={saveItem} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Publish Product</Text>}
      </TouchableOpacity>

      {/* Declaration Modal */}
      <Modal visible={declarationModalVisible} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>Vendor Declaration</Text>
            <ScrollView style={{ maxHeight: 200 }}>
              <Text style={styles.modalText}>
                I confirm that the information, images, descriptions, pricing, licences, and regulatory compliance relating to the products uploaded by me are true and accurate. I understand that I am solely responsible for ensuring that all products offered for sale comply with the applicable laws of India.
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => {
                setDeclarationAccepted(true);
                setDeclarationModalVisible(false);
              }}
            >
              <Text style={styles.saveText}>I Agree & Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 50, backgroundColor: "#fff" },
  heading: { fontSize: 26, fontWeight: "900", marginBottom: 16 },
  section: { fontSize: 16, fontWeight: "800", marginVertical: 10 },
  panel: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, marginBottom: 12 },
  actionRow: { flexDirection: "row", gap: 10 },
  photoBtn: { flex: 1, backgroundColor: "#1166ff", padding: 14, borderRadius: 8, alignItems: "center" },
  galleryBtn: { flex: 1, borderWidth: 1, borderColor: "#1166ff", padding: 14, borderRadius: 8, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "900" },
  secondaryText: { color: "#1166ff", fontWeight: "900" },
  previewContainer: { alignItems: "center" },
  previewImage: { width: 160, height: 160, borderRadius: 8 },
  retakeBtn: { marginTop: 8 },
  retakeText: { color: "#d97706", fontWeight: "900" },
  label: { fontSize: 12, fontWeight: "700", color: "#374151", marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 6, padding: 10, marginTop: 4 },
  row: { flexDirection: "row" },
  catalogChip: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14, marginRight: 8 },
  catalogChipSelected: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  chipText: { color: "#374151", fontWeight: "700" },
  chipTextSelected: { color: "#fff" },
  checkboxRow: { flexDirection: "row", alignItems: "center", marginVertical: 10 },
  checkbox: { fontSize: 20, marginRight: 8 },
  declarationText: { fontSize: 12, color: "#4b5563", flex: 1 },
  saveBtn: { backgroundColor: "#16a34a", padding: 15, borderRadius: 8, marginTop: 10 },
  saveText: { color: "#fff", fontWeight: "900", textAlign: "center", fontSize: 16 },
  disabled: { opacity: 0.6 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 8, padding: 16 },
  modalHeading: { fontSize: 18, fontWeight: "900", marginBottom: 8 },
  modalText: { fontSize: 12, lineHeight: 18, color: "#374151" },
});