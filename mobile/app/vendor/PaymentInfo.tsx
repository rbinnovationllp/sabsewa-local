import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { apiUrl } from "@/lib/backend";
import { optimizeProductImage, validatePickedProductImage } from "@/lib/imageUploadPolicy";

const METHOD_OPTIONS = [
  { key: "vendor_qr", label: "UPI QR" },
  { key: "cash", label: "Cash" },
  { key: "bank_transfer", label: "Bank Transfer" },
  { key: "other_digital", label: "Other Digital" },
];

export default function VendorPaymentInfoScreen() {
  const params: any = useLocalSearchParams();
  const vendorId = params.vendor ? String(params.vendor) : "";
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [qrCodes, setQrCodes] = useState<any[]>([]);
  const [upiId, setUpiId] = useState("");
  const [methods, setMethods] = useState<string[]>(["vendor_qr", "cash"]);
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankAccountHolder, setBankAccountHolder] = useState("");
  const [otherInstructions, setOtherInstructions] = useState("");
  const [qrAsset, setQrAsset] = useState<any>(null);

  useEffect(() => {
    loadProfile();
  }, [vendorId]);

  async function loadProfile() {
    if (!vendorId) return;
    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/settlement/vendor/${vendorId}/payment-profile`));
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load payment profile.");
      setProfile(json.profile);
      setQrCodes(json.qr_codes || []);
      setUpiId(json.profile?.upi_id || "");
      setMethods(json.profile?.preferred_methods?.length ? json.profile.preferred_methods : ["vendor_qr", "cash"]);
      setBankAccountHolder(json.profile?.bank_account_holder || "");
      setOtherInstructions(json.profile?.other_payment_instructions || "");
    } catch (error) {
      Alert.alert("Payment profile", error instanceof Error ? error.message : "Unable to load payment profile.");
    } finally {
      setLoading(false);
    }
  }

  function toggleMethod(key: string) {
    setMethods((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function pickQr() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: false,
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled) return;
    const validationError = validatePickedProductImage(result.assets[0]);
    if (validationError) {
      Alert.alert("QR image", validationError);
      return;
    }
    setQrAsset(result.assets[0]);
  }

  async function uploadQrIfSelected() {
    if (!qrAsset) return null;
    const optimized = await optimizeProductImage(qrAsset);
    const fileName = qrAsset.fileName || qrAsset.uri.split("/").pop() || `payment-qr-${Date.now()}.jpg`;
    const contentType = optimized.contentType || qrAsset.mimeType || "image/jpeg";

    const presignResponse = await fetch(apiUrl("/api/storage/s3/presign-payment-qr"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorId,
        fileName,
        contentType,
        fileSize: optimized.optimizedSize,
        originalFileSize: optimized.originalSize,
        imageWidth: optimized.width,
        imageHeight: optimized.height,
        optimized: true,
        label: "UPI QR",
        upiId,
        uploadedBy: user?.id,
      }),
    });
    const presignJson = await presignResponse.json();
    if (!presignResponse.ok || !presignJson.success) throw new Error(presignJson.error || "Unable to prepare QR upload.");

    const uploadResponse = await fetch(presignJson.upload_url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: optimized.blob,
    });
    if (!uploadResponse.ok) throw new Error("QR image upload failed.");

    const confirmResponse = await fetch(apiUrl("/api/storage/s3/confirm-payment-qr"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorId,
        storageFileId: presignJson.storage_file_id,
        objectKey: presignJson.object_key,
        label: "UPI QR",
        upiId,
        uploadedBy: user?.id,
        makePrimary: true,
      }),
    });
    const confirmJson = await confirmResponse.json();
    if (!confirmResponse.ok || !confirmJson.success) throw new Error(confirmJson.error || "QR uploaded, but confirmation failed.");
    return confirmJson.qr_code;
  }

  async function saveProfile() {
    if (!vendorId) return;
    if (methods.includes("vendor_qr") && !upiId.trim()) {
      Alert.alert("UPI required", "Add a UPI ID before enabling UPI QR payments.");
      return;
    }
    setSaving(true);
    try {
      await uploadQrIfSelected();
      const response = await fetch(apiUrl(`/api/settlement/vendor/${vendorId}/payment-profile`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upi_id: upiId.trim() || null,
          preferred_methods: methods,
          bank_account_number: bankAccountNumber.trim() || null,
          bank_ifsc: bankIfsc.trim() || null,
          bank_account_holder: bankAccountHolder.trim() || null,
          other_payment_instructions: otherInstructions.trim() || null,
          actor_user_id: user?.id,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to save payment profile.");
      setQrAsset(null);
      setBankAccountNumber("");
      setBankIfsc("");
      await loadProfile();
      Alert.alert("Saved", "Vendor payment information updated.");
    } catch (error) {
      Alert.alert("Payment profile", error instanceof Error ? error.message : "Unable to save payment profile.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading payment information...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Payment Information</Text>
      <Text style={styles.subtitle}>Customers pay your shop directly. SabSewa Local stores only the details needed to show your accepted payment methods during delivery.</Text>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Preferred Methods</Text>
        <View style={styles.methodGrid}>
          {METHOD_OPTIONS.map((option) => (
            <TouchableOpacity key={option.key} style={[styles.methodBtn, methods.includes(option.key) && styles.methodActive]} onPress={() => toggleMethod(option.key)}>
              <Text style={[styles.methodText, methods.includes(option.key) && styles.methodTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TextInput style={styles.input} value={upiId} onChangeText={setUpiId} placeholder="UPI ID, e.g. vendor@upi" autoCapitalize="none" />
      <TextInput style={styles.input} value={bankAccountHolder} onChangeText={setBankAccountHolder} placeholder="Bank account holder (optional)" />
      <TextInput style={styles.input} value={bankAccountNumber} onChangeText={setBankAccountNumber} placeholder={profile?.bank_account_last4 ? `Bank account ending ${profile.bank_account_last4}` : "Bank account number (optional)"} secureTextEntry />
      <TextInput style={styles.input} value={bankIfsc} onChangeText={setBankIfsc} placeholder="IFSC (optional)" autoCapitalize="characters" secureTextEntry />
      <TextInput style={[styles.input, styles.multiline]} value={otherInstructions} onChangeText={setOtherInstructions} placeholder="Other payment instructions" multiline />

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>QR Code</Text>
        {qrAsset ? <Image source={{ uri: qrAsset.uri }} style={styles.qrPreview} resizeMode="contain" /> : null}
        <TouchableOpacity style={styles.secondaryBtn} onPress={pickQr}>
          <Text style={styles.btnText}>{qrAsset ? "Replace Selected QR" : "Upload / Replace QR"}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={saveProfile} disabled={saving}>
        <Text style={styles.btnText}>{saving ? "Saving..." : "Save Payment Information"}</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Saved QR Codes</Text>
      {qrCodes.length === 0 ? <Text style={styles.muted}>No QR code uploaded yet.</Text> : null}
      {qrCodes.map((qr) => (
        <View key={qr.id} style={styles.qrCard}>
          <Image source={{ uri: qr.public_url }} style={styles.qrThumb} resizeMode="contain" />
          <View style={styles.qrMeta}>
            <Text style={styles.qrTitle}>{qr.label || "UPI QR"}</Text>
            <Text style={styles.muted}>{qr.upi_id || upiId || "UPI not saved"}</Text>
            <Text style={styles.muted}>{qr.is_primary ? "Primary" : qr.status}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  heading: { fontSize: 26, fontWeight: "900", color: "#111827" },
  subtitle: { color: "#555", lineHeight: 20, marginTop: 6, marginBottom: 18 },
  panel: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 14, backgroundColor: "#f9fafb" },
  panelTitle: { fontSize: 16, fontWeight: "900", marginBottom: 10 },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodBtn: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#fff" },
  methodActive: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  methodText: { fontWeight: "800", color: "#374151" },
  methodTextActive: { color: "#fff" },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: "#fff" },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  qrPreview: { width: 220, height: 220, alignSelf: "center", backgroundColor: "#fff", marginBottom: 12 },
  secondaryBtn: { backgroundColor: "#475569", padding: 13, borderRadius: 8 },
  saveBtn: { backgroundColor: "#16a34a", padding: 14, borderRadius: 8, marginBottom: 18 },
  btnText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  sectionTitle: { fontSize: 18, fontWeight: "900", marginBottom: 10 },
  muted: { color: "#6b7280", marginTop: 3 },
  qrCard: { flexDirection: "row", gap: 12, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, marginBottom: 10, backgroundColor: "#fff" },
  qrThumb: { width: 96, height: 96, backgroundColor: "#f9fafb" },
  qrMeta: { flex: 1, justifyContent: "center" },
  qrTitle: { fontWeight: "900", color: "#111827" },
});
