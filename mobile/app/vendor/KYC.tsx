import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

type KycOption = { type: string; label: string };
type KycSection = {
  id: string;
  title: string;
  required: boolean;
  conditional?: boolean;
  note: string;
  options: KycOption[];
};
type PickedFile = { uri: string; fileName?: string; mimeType?: string; nativeFile?: any };
type KycDocument = {
  id: string;
  document_type: string;
  status?: string;
  file_name?: string;
  mime_type?: string;
  file_size_bytes?: number;
  rejection_reason?: string | null;
  metadata?: Record<string, any>;
  created_at?: string;
  reviewed_at?: string | null;
};

function statusLabel(value: unknown) {
  return String(value || "pending").replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function categoryNeedsSpecialLicence(category: unknown) {
  const lower = String(category || "").toLowerCase();
  return (
    lower.includes("pharma") ||
    lower.includes("medical") ||
    lower.includes("chemist") ||
    lower.includes("drug") ||
    lower.includes("medicine") ||
    lower.includes("restaurant") ||
    lower.includes("tiffin") ||
    lower.includes("food") ||
    lower.includes("liquor") ||
    lower.includes("alcohol") ||
    lower.includes("restricted")
  );
}

function specialLicenceOptions(category: unknown): KycOption[] {
  const lower = String(category || "").toLowerCase();
  if (lower.includes("pharma") || lower.includes("medical") || lower.includes("chemist") || lower.includes("drug") || lower.includes("medicine")) {
    return [
      { type: "drug_license", label: "Drug licence / pharmacy licence" },
      { type: "restricted_goods_license", label: "Other medicine or restricted goods licence" },
      { type: "other_regulatory_license", label: "Other applicable regulatory licence" },
    ];
  }
  if (lower.includes("restaurant") || lower.includes("tiffin") || lower.includes("food")) {
    return [
      { type: "fssai_license", label: "FSSAI licence / food business registration" },
      { type: "other_regulatory_license", label: "Other applicable food licence" },
    ];
  }
  if (lower.includes("liquor") || lower.includes("alcohol")) {
    return [
      { type: "liquor_license", label: "Liquor / alcohol sales licence" },
      { type: "restricted_goods_license", label: "Restricted goods licence" },
      { type: "other_regulatory_license", label: "Other applicable regulatory licence" },
    ];
  }
  return [
    { type: "restricted_goods_license", label: "Restricted goods licence" },
    { type: "other_regulatory_license", label: "Other applicable regulatory licence" },
  ];
}

function buildKycSections(category: unknown, serverSections: any[] = []): KycSection[] {
  if (serverSections[0]?.options) return serverSections as KycSection[];
  const specialRequired = categoryNeedsSpecialLicence(category);
  return [
    {
      id: "identity_proof",
      title: "Identity Proof",
      required: true,
      note: "Select one government-issued identity proof for the shop owner, authorised person or caretaker.",
      options: [
        { type: "aadhaar", label: "Aadhaar Card" },
        { type: "pan_card", label: "PAN Card" },
        { type: "passport", label: "Passport" },
        { type: "voter_id", label: "Voter ID Card" },
        { type: "driving_licence", label: "Driving Licence" },
        { type: "other_identity_proof", label: "Other valid government-issued identity proof" },
      ],
    },
    {
      id: "business_address_proof",
      title: "Address / Business Proof",
      required: true,
      note: "Select one document proving the shop address or lawful business presence at this location.",
      options: [
        { type: "shop_establishment", label: "Shop & Establishment Certificate" },
        { type: "rent_agreement", label: "Rent / Lease Agreement" },
        { type: "utility_bill", label: "Electricity / Utility Bill" },
        { type: "municipal_document", label: "Municipal / Local Authority document" },
        { type: "business_registration_address", label: "Business registration with shop address" },
        { type: "gst_certificate", label: "GST registration certificate, where applicable" },
        { type: "other_business_proof", label: "Other legal address/business proof" },
      ],
    },
    {
      id: "owner_photo",
      title: "Owner / Authorized Person Photograph with Shop View",
      required: true,
      note: "Please stand in front of your shop and take a clear photograph showing your face, shop front, shop name/signboard if available, and some shop items or business activity.",
      options: [
        { type: "owner_shop_photo", label: "Owner + Shop Photograph" },
      ],
    },
    {
      id: "regulated_license",
      title: "Restricted / Regulated Business Licence",
      required: specialRequired,
      conditional: true,
      note: specialRequired
        ? "Mandatory for this category. Upload the applicable valid licence before KYC can be submitted."
        : "Normally not applicable. Upload only if your shop sells restricted or regulated products.",
      options: specialLicenceOptions(category),
    },
  ];
}

function sortDocuments(documents: KycDocument[]) {
  return [...documents].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function documentBelongsToSection(section: KycSection, document: KycDocument) {
  const allowed = new Set(section.options.map((option) => option.type));
  const metadataSection = document.metadata?.document_section;
  if (metadataSection) return metadataSection === section.id && allowed.has(document.document_type);
  return allowed.has(document.document_type);
}

function latestDocumentForSection(section: KycSection, documents: KycDocument[]) {
  return sortDocuments(documents).find((item) => documentBelongsToSection(section, item));
}

function selectedOptionFor(section: KycSection, selectedTypes: Record<string, string>) {
  return section.options.find((option) => option.type === selectedTypes[section.id]) || section.options[0];
}

function isUploaded(document: KycDocument | undefined) {
  return Boolean(document && !["rejected", "additional_information_required"].includes(String(document.status || "")));
}

function fileSizeLabel(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function upsertDocument(documents: KycDocument[], next: KycDocument) {
  return sortDocuments([next, ...documents.filter((item) => item.id !== next.id)]);
}

export default function VendorKycScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ vendor?: string }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [uploadingSectionId, setUploadingSectionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [vendor, setVendor] = useState<any>(null);
  const [resolvedVendorId, setResolvedVendorId] = useState("");
  const [requiredDocs, setRequiredDocs] = useState<any[]>([]);
  const [documents, setDocuments] = useState<KycDocument[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<Record<string, string>>({});
  const [pickedFiles, setPickedFiles] = useState<Record<string, PickedFile | null>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string | null>>({});

  const sections = useMemo(() => buildKycSections(vendor?.category, requiredDocs), [requiredDocs, vendor?.category]);
  const mandatorySections = sections.filter((section) => section.required);
  const missingMandatorySections = mandatorySections.filter((section) => !isUploaded(latestDocumentForSection(section, documents)));
  const canSubmitPackage = missingMandatorySections.length === 0 && !submitting;

  useEffect(() => {
    loadKyc();
  }, [user?.id, params.vendor]);

  async function resolveVendorId() {
    if (params.vendor) return String(params.vendor);
    if (!user?.id) return "";
    const { data } = await supabase.from("vendors").select("id").eq("owner_user_id", user.id).single();
    return data?.id || "";
  }

  function primeSelectedTypes(nextSections: KycSection[], nextDocuments: KycDocument[]) {
    const nextSelected: Record<string, string> = {};
    for (const section of nextSections) {
      const latest = latestDocumentForSection(section, nextDocuments);
      nextSelected[section.id] = latest?.document_type || selectedTypes[section.id] || section.options[0]?.type || "";
    }
    setSelectedTypes(nextSelected);
  }

  async function loadKyc() {
    setLoading(true);
    try {
      const vendorId = await resolveVendorId();
      if (!vendorId) throw new Error("Vendor profile was not found.");
      setResolvedVendorId(vendorId);
      const response = await authenticatedFetch(`/api/vendor/onboarding/${vendorId}/kyc-requirements`);
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load KYC requirements.");
      const nextDocuments = sortDocuments(json.documents || []);
      const nextSections = buildKycSections(json.vendor?.category, json.required_documents || []);
      setVendor({ ...(json.vendor || {}), id: json.vendor?.id || vendorId });
      setRequiredDocs(json.required_documents || []);
      setDocuments(nextDocuments);
      primeSelectedTypes(nextSections, nextDocuments);
    } catch (error) {
      Alert.alert("KYC", error instanceof Error ? error.message : "Unable to load KYC.");
    } finally {
      setLoading(false);
    }
  }

  function chooseOption(section: KycSection, option: KycOption) {
    setSelectedTypes((current) => ({ ...current, [section.id]: option.type }));
    setPickedFiles((current) => ({ ...current, [section.id]: null }));
  }

  function setSectionFile(sectionId: string, file: PickedFile) {
    setPickedFiles((current) => ({ ...current, [sectionId]: file }));
    setUploadErrors((current) => ({ ...current, [sectionId]: null }));
  }

  async function handlePickedFile(section: KycSection, file: PickedFile) {
    setSectionFile(section.id, file);
    await uploadSectionDocument(section, file);
  }

  async function pickFromCamera(section: KycSection) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera permission required", "Allow camera access to capture KYC documents.");
      return;
    }
    if (section.id === "owner_photo") {
      Alert.alert("Owner + Shop Photograph", "Please stand in front of your shop and take a clear photograph showing your face, shop front, shop name/signboard if available, and some shop items or business activity.");
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!result.canceled && result.assets?.[0]) {
      const asset: any = result.assets[0];
      await handlePickedFile(section, {
        uri: asset.uri,
        fileName: asset.fileName || asset.name || `${section.id}.jpg`,
        mimeType: asset.mimeType || asset.type || "image/jpeg",
        nativeFile: asset.file,
      });
    }
  }

  async function pickFromGallery(section: KycSection) {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!result.canceled && result.assets?.[0]) {
      const asset: any = result.assets[0];
      await handlePickedFile(section, {
        uri: asset.uri,
        fileName: asset.fileName || asset.name || `${section.id}.jpg`,
        mimeType: asset.mimeType || asset.type || "image/jpeg",
        nativeFile: asset.file,
      });
    }
  }

  async function pickFromStorage(section: KycSection) {
    const result = await DocumentPicker.getDocumentAsync({ type: section.id === "owner_photo" ? "image/*" : ["application/pdf", "image/*"], copyToCacheDirectory: true, multiple: false });
    if (!result.canceled && result.assets?.[0]) {
      const asset: any = result.assets[0];
      await handlePickedFile(section, {
        uri: asset.uri,
        fileName: asset.name || asset.fileName || `${section.id}`,
        mimeType: asset.mimeType || asset.type || "application/octet-stream",
        nativeFile: asset.file,
      });
    }
  }

  async function appendPickedFile(formData: FormData, file: PickedFile, documentType: string) {
    const fileName = file.fileName || `${documentType}.jpg`;
    if (Platform.OS === "web") {
      if (file.nativeFile) {
        formData.append("document", file.nativeFile, fileName);
        return;
      }
      const response = await fetch(file.uri);
      const blob = await response.blob();
      formData.append("document", blob, fileName);
      return;
    }
    formData.append("document", {
      uri: file.uri,
      name: fileName,
      type: file.mimeType || "image/jpeg",
    } as any);
  }

  async function uploadSectionDocument(section: KycSection, explicitFile?: PickedFile) {
    const option = selectedOptionFor(section, selectedTypes);
    const pickedFile = explicitFile || pickedFiles[section.id];
    if (uploadingSectionId === section.id) return;
    const uploadVendorId = vendor?.id || resolvedVendorId || await resolveVendorId();
    if (!uploadVendorId && pickedFile) {
      setResolvedVendorId("");
    }
    if (!uploadVendorId || !option?.type || !pickedFile) {
      const message = !pickedFile
        ? `Choose ${section.title} and select/take a document photo. Upload starts automatically after selection.`
        : "Vendor profile was not ready for upload. Please refresh the page and try again.";
      setUploadErrors((current) => ({ ...current, [section.id]: message }));
      Alert.alert("KYC upload", message);
      return;
    }

    setUploadingSectionId(section.id);
    setUploadErrors((current) => ({ ...current, [section.id]: null }));
    console.log("Starting KYC document upload", {
      vendor_id: uploadVendorId,
      document_section: section.id,
      document_type: option.type,
      file_name: pickedFile.fileName,
      platform: Platform.OS,
    });

    try {
      const formData = new FormData();
      formData.append("document_type", option.type);
      formData.append("document_section", section.id);
      formData.append("document_label", option.label);
      await appendPickedFile(formData, pickedFile, option.type);

      const response = await authenticatedFetch(`/api/vendor/onboarding/${uploadVendorId}/kyc-documents`, { method: "POST", body: formData });
      const raw = await response.text();
      let json: any = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch (parseError) {
        console.error("KYC upload returned non-JSON response", { status: response.status, raw });
        throw new Error(`Upload failed. Server returned ${response.status}. Please try again or contact support.`);
      }
      if (!response.ok || !json.success || !json.document?.id) {
        console.error("KYC upload API rejected request", { status: response.status, json });
        const diagnosticMessage = json.diagnostic?.stage
          ? `${json.error || "Upload failed"} [${json.diagnostic.stage}${json.diagnostic.code ? `/${json.diagnostic.code}` : ""}]`
          : (json.error || json.technical_error || "Upload failed. Please try again.");
        throw new Error(diagnosticMessage);
      }

      setDocuments((current) => upsertDocument(current, json.document));
      setPickedFiles((current) => ({ ...current, [section.id]: null }));
      setSelectedTypes((current) => ({ ...current, [section.id]: json.document.document_type || option.type }));
      setUploadErrors((current) => ({ ...current, [section.id]: null }));
      Alert.alert("Uploaded successfully", `${json.document.metadata?.document_label || option.label} was uploaded successfully.`);
      await loadKyc();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed. Please try again.";
      const visibleMessage = message === "Failed to fetch"
        ? "Upload failed before reaching SabSewa API. Check internet connection, login session, API URL, or CORS."
        : message;
      console.error("KYC upload failed", { section: section.id, document_type: option.type, error });
      setUploadErrors((current) => ({ ...current, [section.id]: visibleMessage }));
      Alert.alert("Upload failed", visibleMessage);
    } finally {
      setUploadingSectionId(null);
    }
  }

  async function previewDocument(document: KycDocument) {
    if (!vendor?.id || !document.id) return;
    try {
      const response = await authenticatedFetch(`/api/vendor/onboarding/${vendor.id}/kyc-documents/${document.id}/view`);
      const json = await response.json();
      if (!response.ok || !json.success || !json.url) throw new Error(json.error || "Unable to open this document.");
      await Linking.openURL(json.url);
    } catch (error) {
      Alert.alert("Preview unavailable", error instanceof Error ? error.message : "Unable to open this document.");
    }
  }

  async function deleteDocument(document: KycDocument) {
    if (!vendor?.id || !document.id) return;
    setDeletingDocumentId(document.id);
    try {
      const response = await authenticatedFetch(`/api/vendor/onboarding/${vendor.id}/kyc-documents/${document.id}`, { method: "DELETE" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to delete this document.");
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      Alert.alert("Document removed", "Upload the correct document again before submitting KYC.");
      await loadKyc();
    } catch (error) {
      Alert.alert("Delete failed", error instanceof Error ? error.message : "Unable to delete this document.");
    } finally {
      setDeletingDocumentId(null);
    }
  }

  async function submitForVerification() {
    if (!vendor?.id) return;
    if (missingMandatorySections.length > 0) {
      Alert.alert("Mandatory documents missing", missingMandatorySections.map((section) => `${section.title} missing - Please upload before submitting.`).join("\n"));
      return;
    }
    setSubmitting(true);
    try {
      const response = await authenticatedFetch(`/api/vendor/onboarding/${vendor.id}/submit-kyc`, { method: "POST" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to submit KYC for verification.");
      Alert.alert("KYC submitted", "Your KYC package is under verification. Payment remains locked until SabSewa approves KYC.");
      await loadKyc();
    } catch (error) {
      Alert.alert("Submission failed", error instanceof Error ? error.message : "Unable to submit KYC.");
    } finally {
      setSubmitting(false);
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
        <Text style={styles.muted}>Payment unlocks only after KYC is approved by SabSewa. Uploaded documents must be submitted and reviewed before approval.</Text>
        {vendor?.kyc_review_notes ? (
          <View style={styles.reviewNoteBox}>
            <Text style={styles.reviewNoteTitle}>Admin Review Notes</Text>
            <Text style={styles.reviewNoteText}>{vendor.kyc_review_notes}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>Required Documents</Text>
        {sections.map((section) => {
          const latest = latestDocumentForSection(section, documents);
          const uploaded = isUploaded(latest);
          const optionalAndNotRequired = !section.required && section.conditional && !uploaded;
          const option = selectedOptionFor(section, selectedTypes);
          const pickedFile = pickedFiles[section.id];
          const uploading = uploadingSectionId === section.id;
          const uploadError = uploadErrors[section.id];
          const uploadedLabel = latest?.metadata?.document_label || section.options.find((candidate) => candidate.type === latest?.document_type)?.label || latest?.document_type;
          return (
            <View key={section.id} style={[styles.docSection, uploaded && styles.docSectionUploaded]}>
              <View style={styles.docSectionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle}>{section.title}</Text>
                  <Text style={styles.muted}>{section.required ? "Mandatory" : section.conditional ? "Conditional / Optional" : "Optional"}</Text>
                </View>
                <Text style={[styles.uploadBadge, uploaded && styles.uploadBadgeDone, optionalAndNotRequired && styles.uploadBadgeOptional]}>
                  {uploading ? "Uploading..." : uploaded ? "Uploaded" : optionalAndNotRequired ? "Not Required / Optional" : "Missing"}
                </Text>
              </View>
              <Text style={styles.docNote}>{section.note}</Text>

              <View style={styles.optionList}>
                {section.options.map((candidate) => (
                  <TouchableOpacity key={candidate.type} style={[styles.optionChip, option?.type === candidate.type && styles.optionChipSelected]} onPress={() => chooseOption(section, candidate)}>
                    <Text style={[styles.optionText, option?.type === candidate.type && styles.optionTextSelected]}>{candidate.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.sectionUploadPanel}>
                <Text style={styles.selectedLine}>Selected: {option?.label || "None"}</Text>
                {uploaded ? (
                  <View style={styles.uploadedBox}>
                    <Text style={styles.successText}>{section.id === "owner_photo" ? "Owner + Shop Photograph" : uploadedLabel} - Uploaded Successfully</Text>
                    <Text style={styles.fileName}>{latest?.file_name || "Uploaded document"} {fileSizeLabel(latest?.file_size_bytes)}</Text>
                    <View style={styles.actions}>
                      <TouchableOpacity style={styles.secondaryBtn} onPress={() => latest && previewDocument(latest)}>
                        <Text style={styles.secondaryText}>View / Preview</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.secondaryBtn} onPress={() => latest && deleteDocument(latest)} disabled={deletingDocumentId === latest?.id}>
                        <Text style={styles.secondaryText}>{deletingDocumentId === latest?.id ? "Removing..." : "Delete / Re-upload"}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
                {latest?.rejection_reason ? <Text style={styles.rejectionText}>Action required: {latest.rejection_reason}</Text> : null}
                                {uploading ? <Text style={styles.uploadingText}>Uploading... Please wait.</Text> : null}
                                {uploadError ? <Text style={styles.rejectionText}>Upload failed: {uploadError}</Text> : null}

                <View style={styles.actions}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => pickFromCamera(section)}>
                    <Text style={styles.secondaryText}>{section.id === "owner_photo" ? "Take Photo at Shop" : "Take Photo"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => pickFromGallery(section)}>
                    <Text style={styles.secondaryText}>Gallery</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => pickFromStorage(section)}>
                    <Text style={styles.secondaryText}>Files</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>Submit KYC Package</Text>
        {mandatorySections.map((section) => {
          const latest = latestDocumentForSection(section, documents);
          const uploaded = isUploaded(latest);
          const uploadedLabel = latest?.metadata?.document_label || section.title;
          return (
            <Text key={section.id} style={uploaded ? styles.successText : styles.missingText}>
              {uploaded ? `${uploadedLabel} uploaded` : `${section.title} missing - Please upload before submitting.`}
            </Text>
          );
        })}
        <TouchableOpacity style={[styles.primaryBtn, !canSubmitPackage && styles.disabled]} disabled={!canSubmitPackage} onPress={submitForVerification}>
          <Text style={styles.primaryText}>{submitting ? "Submitting..." : "Submit For Verification"}</Text>
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
  reviewNoteBox: { borderWidth: 1, borderColor: "#fdba74", backgroundColor: "#fff7ed", borderRadius: 8, padding: 10, marginTop: 10 },
  reviewNoteTitle: { color: "#9a3412", fontWeight: "900", marginBottom: 4 },
  reviewNoteText: { color: "#7c2d12", fontWeight: "700", lineHeight: 18 },
  docSection: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: "#f9fafb" },
  docSectionUploaded: { borderColor: "#86efac", backgroundColor: "#f0fdf4" },
  docSectionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  docTitle: { color: "#111827", fontWeight: "900", marginBottom: 4 },
  docNote: { color: "#475569", fontSize: 12, lineHeight: 18, marginTop: 8 },
  uploadBadge: { color: "#991b1b", backgroundColor: "#fef2f2", borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, fontWeight: "900", overflow: "hidden" },
  uploadBadgeDone: { color: "#166534", backgroundColor: "#dcfce7" },
  uploadBadgeOptional: { color: "#475569", backgroundColor: "#f1f5f9" },
  optionList: { gap: 8, marginTop: 10 },
  optionChip: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 10, backgroundColor: "#fff" },
  optionChipSelected: { borderColor: "#1166ff", backgroundColor: "#1166ff" },
  optionText: { color: "#334155", fontWeight: "800" },
  optionTextSelected: { color: "#fff" },
  sectionUploadPanel: { borderTopWidth: 1, borderTopColor: "#e5e7eb", marginTop: 12, paddingTop: 12 },
  selectedLine: { color: "#111827", fontWeight: "900", marginBottom: 6 },
  uploadedBox: { borderWidth: 1, borderColor: "#bbf7d0", backgroundColor: "#f0fdf4", borderRadius: 8, padding: 10, marginTop: 8 },
  successText: { color: "#166534", fontWeight: "900", marginTop: 6, lineHeight: 18 },
  missingText: { color: "#991b1b", fontWeight: "900", marginTop: 6, lineHeight: 18 },
  uploadingText: { color: "#0f766e", fontWeight: "900", marginTop: 6, lineHeight: 18 },
  rejectionText: { color: "#991b1b", fontWeight: "800", marginTop: 8, lineHeight: 18 },
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

