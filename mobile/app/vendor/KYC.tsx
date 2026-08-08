import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

function statusLabel(value: unknown) {
  return String(value || "pending").replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function VendorKycScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ vendor?: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [vendor, setVendor] = useState<any>(null);
  const [requiredDocs, setRequiredDocs] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedType, setSelectedType] = useState<string>("");
  const [pickedFile, setPickedFile] = useState<any>(null);

  useEffect(() => {
    loadKyc();
  }, [user?.id, params.vendor]);

  async function resolveVendorId() {
    if (params.vendor) return String(params.vendor);
    if (!user?.id) return "";
    const { data } = await supabase.from("vendors").select("id").eq("owner_user_id", user.id).single();
    return data?.id || "";
  }

  async function loadKyc() {
    setLoading(true);
    try {
      const vendorId = await resolveVendorId();
      if (!vendorId) throw new Error("Vendor profile was not found.");
      const response = await authenticatedFetch(`/api/vendor/onboarding/${vendorId}/kyc-requirements`);
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load KYC requirements.");
      setVendor(json.vendor);
      setRequiredDocs(json.required_documents || []);
      setDocuments(json.documents || []);
      setSelectedType((json.required_documents || [])[0]?.type || "");
    } catch (error) {
      Alert.alert("KYC", error instanceof Error ? error.message : "Unable to load KYC.");
    } finally {
      setLoading(false);
    }
  }

  async function pickFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera permission required", "Allow camera access to capture KYC documents.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]) setPickedFile(result.assets[0]);
  }

  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]) setPickedFile(result.assets[0]);
  }

  async function appendPickedFile(formData: FormData) {
    if (Platform.OS === "web") {
      const response = await fetch(pickedFile.uri);
      const blob = await response.blob();
      formData.append("document", blob, pickedFile.fileName || `${selectedType}.jpg`);
      return;
    }
    formData.append("document", {
      uri: pickedFile.uri,
      name: pickedFile.fileName || `${selectedType}.jpg`,
      type: pickedFile.mimeType || "image/jpeg",
    } as any);
  }

  async function uploadSelectedDocument() {
    if (!vendor?.id || !selectedType || !pickedFile) {
      Alert.alert("KYC document required", "Select a document type and choose an image first.");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("document_type", selectedType);
      await appendPickedFile(formData);
      const response = await authenticatedFetch(`/api/vendor/onboarding/${vendor.id}/kyc-documents`, {
        method: "POST",
        body: formData,
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to upload KYC document.");
      setPickedFile(null);
      Alert.alert("KYC submitted", "Document uploaded for verification.");
      await loadKyc();
    } catch (error) {
      Alert.alert("Upload failed", error instanceof Error ? error.message : "Unable to upload KYC document.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1166ff" />
        <Text style={styles.muted}>Loading KYC...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Vendor KYC" />
      <Text style={styles.heading}>KYC Verification</Text>
      <Text style={styles.subtle}>Upload clear legal/business documents. Images are compressed only to reduce storage use; document content is not altered.</Text>

      <View style={styles.panel}>
        <Text style={styles.section}>Current Status</Text>
        <Text style={styles.status}>{statusLabel(vendor?.kyc_status)}</Text>
        <Text style={styles.muted}>Payment unlocks only after KYC is approved by SabSewa.</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>Required Documents</Text>
        {requiredDocs.map((doc) => {
          const latest = documents.find((item) => item.document_type === doc.type);
          const selected = selectedType === doc.type;
          return (
            <TouchableOpacity
              key={doc.type}
              style={[styles.docCard, selected && styles.docCardSelected]}
              onPress={() => setSelectedType(doc.type)}
            >
              <Text style={styles.docTitle}>{doc.label}</Text>
              <Text style={styles.muted}>{doc.required ? "Mandatory" : "Optional"} | {latest ? statusLabel(latest.status) : "Not uploaded"}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>Upload Document</Text>
        <Text style={styles.muted}>Selected: {requiredDocs.find((doc) => doc.type === selectedType)?.label || selectedType || "None"}</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={pickFromCamera}>
            <Text style={styles.secondaryText}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={pickFromGallery}>
            <Text style={styles.secondaryText}>Gallery</Text>
          </TouchableOpacity>
        </View>
        {pickedFile ? <Text style={styles.fileName}>{pickedFile.fileName || pickedFile.uri}</Text> : null}
        <TouchableOpacity
          style={[styles.primaryBtn, (!pickedFile || uploading) && styles.disabled]}
          disabled={!pickedFile || uploading}
          onPress={uploadSelectedDocument}
        >
          <Text style={styles.primaryText}>{uploading ? "Uploading..." : "Submit For Verification"}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.backBtn} onPress={() => router.push("/vendor/Onboarding" as any)}>
        <Text style={styles.backText}>Back to Onboarding</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 20, paddingHorizontal: 20, paddingBottom: 48, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  heading: { fontSize: 28, fontWeight: "900", color: "#111827", marginBottom: 8 },
  subtle: { color: "#475569", lineHeight: 20, marginBottom: 14 },
  panel: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 14, backgroundColor: "#fff" },
  section: { fontSize: 18, fontWeight: "900", color: "#111827", marginBottom: 10 },
  status: { fontSize: 18, fontWeight: "900", color: "#1166ff", marginBottom: 6 },
  muted: { color: "#6b7280", fontSize: 12, lineHeight: 18 },
  docCard: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: "#f9fafb" },
  docCardSelected: { borderColor: "#1166ff", backgroundColor: "#eff6ff" },
  docTitle: { color: "#111827", fontWeight: "900", marginBottom: 4 },
  actions: { flexDirection: "row", gap: 10, marginVertical: 12 },
  primaryBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14, marginTop: 12 },
  primaryText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: "#1166ff", borderRadius: 8, padding: 12, backgroundColor: "#fff" },
  secondaryText: { color: "#1166ff", textAlign: "center", fontWeight: "900" },
  backBtn: { padding: 14 },
  backText: { color: "#1166ff", textAlign: "center", fontWeight: "900" },
  fileName: { color: "#334155", fontSize: 12, marginTop: 4 },
  disabled: { opacity: 0.6 },
});
