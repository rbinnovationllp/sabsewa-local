import React, { useState } from "react";
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
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";

export default function CatalogueUploadScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<"EXCEL" | "VISION">("EXCEL");
  const [loading, setLoading] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [imageConsent, setImageConsent] = useState(false);

  // Helper to convert blob/uri to base64
  const uriToBase64 = async (uri: string): Promise<string> => {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(",")[1];
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // 1. Pick and upload Excel / CSV
  const handleSpreadsheetPick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "text/csv",
        ],
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      setLoading(true);

      const base64Content = await uriToBase64(file.uri);

      const res = await authenticatedFetch("/api/gemini/inventory/spreadsheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64: base64Content,
          fileName: file.name,
          vendorId: user?.id,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) throw new Error(data.error || "Failed to process spreadsheet.");

      setItems(
        (data.items || []).map((i: any) => ({
          ...i,
          productName: i.canonicalName || i.rawName,
          selectedForStorefront: i.status !== "INVALID",
          submitForMasterReview: i.status === "UNMATCHED_NEW",
        }))
      );
    } catch (err: any) {
      Alert.alert("Spreadsheet Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Capture or Pick Handwritten Slip Image
  const handleCaptureImage = async (useCamera: boolean) => {
    try {
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        base64: true,
      };

      const result = useCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      setSelectedImageUri(asset.uri);
      setLoading(true);

      const base64Data = asset.base64 || (await uriToBase64(asset.uri));

      const res = await authenticatedFetch("/api/gemini/inventory/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64Data,
          mimeType: asset.mimeType || "image/jpeg",
          vendorId: user?.id,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) throw new Error(data.error || "OCR extraction failed.");

      setItems(
        (data.data?.items || []).map((i: any) => ({
          ...i,
          productName: i.matchedMaster?.canonicalName || i.name,
          localName: i.local_name,
          unit: i.unit || "kg",
          price: i.price || null,
          category: i.category || "vegetables_fruits",
          selectedForStorefront: true,
          submitForMasterReview: !i.matchedMaster,
        }))
      );
    } catch (err: any) {
      Alert.alert("Vision Extraction Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. Save Confirmed Items to Storefront
  const handleCommit = async () => {
    setLoading(true);
    try {
      const payload = {
        vendorId: user?.id,
        imageConsent,
        confirmedItems: items.map((i) => ({
          productName: i.productName || i.rawName,
          localName: i.localName || null,
          category: i.category || "vegetables_fruits",
          brand: i.brand || null,
          variant: i.variant || null,
          unit: i.unit || "kg",
          price: i.price,
          displayPrice: i.displayPrice ?? true,
          available: i.available ?? true,
          matchedMasterId: i.masterProductId || i.matchedMaster?.id || null,
          imageUrl: i.imageUrl || i.matchedMaster?.approvedImageUrl || null,
          selectedForStorefront: i.selectedForStorefront,
          submitForMasterReview: i.submitForMasterReview,
          sourceType: activeTab === "EXCEL" ? "EXCEL" : "HANDWRITTEN_IMAGE",
        })),
      };

      const res = await authenticatedFetch("/api/gemini/inventory/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Commit failed.");

      Alert.alert("Catalogue Updated", data.message, [
        { text: "View Storefront", onPress: () => router.push("/vendor/CatalogueSetup") },
      ]);
    } catch (err: any) {
      Alert.alert("Save Error", err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Vendor Storefront Creator" />
      <Text style={styles.heading}>Bulk Product Catalogue Upload</Text>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "EXCEL" && styles.tabActive]}
          onPress={() => {
            setActiveTab("EXCEL");
            setItems([]);
          }}
        >
          <Text style={[styles.tabText, activeTab === "EXCEL" && styles.tabTextActive]}>
            📊 Excel / CSV File
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "VISION" && styles.tabActive]}
          onPress={() => {
            setActiveTab("VISION");
            setItems([]);
          }}
        >
          <Text style={[styles.tabText, activeTab === "VISION" && styles.tabTextActive]}>
            📝 Handwritten / Slip Photo
          </Text>
        </TouchableOpacity>
      </View>

      {/* Excel Mode */}
      {activeTab === "EXCEL" && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Upload Product List (Excel / CSV)</Text>
          <Text style={styles.muted}>
            Supported format: .xlsx, .xls, or .csv (Up to 500 products per upload).
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleSpreadsheetPick}>
            <Text style={styles.primaryBtnText}>📁 Choose Spreadsheet File</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Vision Mode */}
      {activeTab === "VISION" && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Upload Handwritten or Printed Slip</Text>
          <Text style={styles.infoBanner}>
            💡 Supported in English, हिंदी, and ಕನ್ನಡ. Place slip on a flat surface in good lighting.
          </Text>
          <View style={styles.rowBtn}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => handleCaptureImage(true)}>
              <Text style={styles.primaryBtnText}>📷 Camera Capture</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => handleCaptureImage(false)}>
              <Text style={styles.secondaryBtnText}>🖼 Choose Photo</Text>
            </TouchableOpacity>
          </View>
          {selectedImageUri && (
            <Image source={{ uri: selectedImageUri }} style={styles.previewImage} resizeMode="contain" />
          )}
        </View>
      )}

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#1166ff" />
          <Text style={styles.loadingText}>Processing items & matching catalogue...</Text>
        </View>
      )}

      {/* Review Table */}
      {items.length > 0 && !loading && (
        <View style={styles.reviewPanel}>
          <Text style={styles.sectionHeading}>Verify Products ({items.length})</Text>
          {items.map((item, index) => (
            <View key={index} style={[styles.itemCard, item.status === "INVALID" && styles.invalidCard]}>
              <View style={styles.itemHeader}>
                <Text style={styles.itemName}>
                  {item.productName || item.rawName || item.localName}
                </Text>
                {item.matchedMaster || item.status === "MATCHED" ? (
                  <Text style={styles.matchedBadge}>✓ Matched Master Image</Text>
                ) : (
                  <Text style={styles.unmatchedBadge}>★ New Product</Text>
                )}
              </View>

              <View style={styles.gridRow}>
                <View style={styles.gridCol}>
                  <Text style={styles.inputLabel}>Unit / Pack Size</Text>
                  <TextInput
                    style={styles.smallInput}
                    value={item.unit}
                    onChangeText={(val) => {
                      const updated = [...items];
                      updated[index].unit = val;
                      setItems(updated);
                    }}
                  />
                </View>

                <View style={styles.gridCol}>
                  <Text style={styles.inputLabel}>Price (₹) (Optional)</Text>
                  <TextInput
                    style={styles.smallInput}
                    placeholder="Optional"
                    keyboardType="numeric"
                    value={item.price !== null && item.price !== undefined ? String(item.price) : ""}
                    onChangeText={(val) => {
                      const updated = [...items];
                      updated[index].price = val ? Number(val) : null;
                      setItems(updated);
                    }}
                  />
                </View>
              </View>

              {(item.matchedMaster?.approvedImageUrl || item.imageUrl) ? (
                <Image
                  source={{ uri: item.matchedMaster?.approvedImageUrl || item.imageUrl }}
                  style={styles.masterThumbnail}
                />
              ) : (
                <View style={styles.textPlaceholder}>
                  <Text style={styles.placeholderText}>
                    📦 {item.productName || item.rawName} (Text Listing)
                  </Text>
                </View>
              )}
            </View>
          ))}

          <TouchableOpacity
            style={styles.consentRow}
            onPress={() => setImageConsent(!imageConsent)}
          >
            <Text style={styles.checkbox}>{imageConsent ? "☑" : "☐"}</Text>
            <Text style={styles.consentText}>
              I confirm ownership/permission for custom items and agree to contribute standardized metadata upon admin approval.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.commitBtn} onPress={handleCommit}>
            <Text style={styles.commitBtnText}>Publish to Vendor Storefront</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#ffffff" },
  heading: { fontSize: 24, fontWeight: "900", color: "#111827", marginBottom: 16 },
  tabBar: { flexDirection: "row", gap: 10, marginBottom: 16 },
  tab: { flex: 1, padding: 12, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, alignItems: "center" },
  tabActive: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  tabText: { fontWeight: "700", color: "#475569" },
  tabTextActive: { color: "#ffffff" },
  card: { padding: 16, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, backgroundColor: "#f8fafc", marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: "800", color: "#1e293b", marginBottom: 6 },
  muted: { color: "#64748b", fontSize: 13, marginBottom: 12 },
  infoBanner: { backgroundColor: "#eff6ff", borderColor: "#bfdbfe", borderWidth: 1, padding: 10, borderRadius: 6, color: "#1e40af", fontSize: 13, marginBottom: 12 },
  rowBtn: { flexDirection: "row", gap: 10, marginTop: 8 },
  primaryBtn: { flex: 1, backgroundColor: "#1166ff", padding: 14, borderRadius: 8, alignItems: "center" },
  primaryBtnText: { color: "#fff", fontWeight: "800" },
  secondaryBtn: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", padding: 14, borderRadius: 8, alignItems: "center" },
  secondaryBtnText: { color: "#1e293b", fontWeight: "800" },
  previewImage: { width: "100%", height: 200, borderRadius: 8, marginTop: 14 },
  loadingBox: { padding: 30, alignItems: "center" },
  loadingText: { marginTop: 10, color: "#475569", fontWeight: "600" },
  reviewPanel: { marginTop: 10 },
  sectionHeading: { fontSize: 20, fontWeight: "800", color: "#0f172a", marginBottom: 12 },
  itemCard: { padding: 14, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, marginBottom: 10, backgroundColor: "#ffffff" },
  invalidCard: { borderColor: "#fca5a5", backgroundColor: "#fef2f2" },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  itemName: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  matchedBadge: { backgroundColor: "#dcfce7", color: "#166534", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, fontSize: 12, fontWeight: "700" },
  unmatchedBadge: { backgroundColor: "#fef3c7", color: "#92400e", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, fontSize: 12, fontWeight: "700" },
  gridRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  gridCol: { flex: 1 },
  inputLabel: { fontSize: 12, fontWeight: "700", color: "#64748b", marginBottom: 2 },
  smallInput: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 6, padding: 8, backgroundColor: "#fff" },
  masterThumbnail: { width: 60, height: 60, borderRadius: 6, marginTop: 6 },
  textPlaceholder: { backgroundColor: "#f1f5f9", padding: 10, borderRadius: 6, marginTop: 6 },
  placeholderText: { color: "#475569", fontSize: 12, fontWeight: "600" },
  consentRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginVertical: 14 },
  checkbox: { fontSize: 18, color: "#1166ff" },
  consentText: { flex: 1, fontSize: 12, color: "#475569", lineHeight: 18 },
  commitBtn: { backgroundColor: "#16a34a", padding: 16, borderRadius: 8, alignItems: "center", marginBottom: 40 },
  commitBtnText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});