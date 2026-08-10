import React, { useRef, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import BrandHeader from "@/components/BrandHeader";
import { useLanguage } from "@/providers/LanguageProvider";
import { apiUrl } from "@/lib/backend";

const PARTNER_TERMS_VERSION = "partner-program-local-2026-08-10";
const DEFAULT_BENEFIT_PERCENT = 10;

const partnerTypes = ["Existing Customer", "Non-Customer", "Existing Vendor", "Non-Vendor", "Individual", "Local Business Promoter", "Marketing or Business Development Professional", "Consultant", "Organization", "NGO", "Educational Institution", "Other Stakeholder"];
const taxTypes = ["individual", "proprietorship", "partnership", "llp", "company", "other"];

const emptyForm = {
  applicant_name: "",
  partner_type: "Individual",
  organization_name: "",
  phone: "",
  email: "",
  city: "",
  district: "",
  state: "",
  proposed_area_of_operation: "",
  expected_vendor_reach: "",
  experience_summary: "",
  vendor_onboarding_plan: "",
  customer_awareness_plan: "",
  referral_source: "",
  pan_number: "",
  pan_name: "",
  tax_profile_type: "individual",
  gstin: "",
  payment_method: "upi",
  account_holder_name: "",
  bank_name: "",
  account_number: "",
  account_number_confirm: "",
  ifsc_code: "",
  account_type: "savings",
  branch_name: "",
  upi_id: "",
  upi_id_confirm: "",
  upi_name: "",
};

const kycSections = [
  { id: "identity_proof", title: "Government-Issued Identity Proof", required: true, options: [
    ["aadhaar", "Aadhaar Card"], ["pan_card", "PAN Card"], ["voter_id", "Voter ID Card"], ["driving_licence", "Driving Licence"], ["passport", "Passport"], ["other_identity_proof", "Other government-issued identity proof"],
  ] },
  { id: "address_proof", title: "Address Proof", required: true, options: [
    ["aadhaar_address", "Aadhaar with address"], ["driving_licence_address", "Driving Licence with address"], ["passport_address", "Passport with address"], ["voter_id_address", "Voter ID with address"], ["utility_bill", "Recent utility bill"], ["other_address_proof", "Other legal address proof"],
  ] },
  { id: "partner_photo", title: "Partner Photograph", required: true, options: [
    ["partner_selfie", "Recent passport-size partner photograph"], ["authorized_person_photo", "Authorized person photograph"],
  ] },
  { id: "organization_document", title: "Organization Document", required: false, options: [
    ["incorporation_certificate", "Registration/Incorporation Certificate"], ["organization_pan", "Organization PAN"], ["gst_certificate", "GST certificate"], ["authorization_letter", "Authorization letter"], ["representative_identity", "Representative identity proof"], ["other_organization_document", "Other organization document"],
  ] },
];

function labelStatus(status: string) {
  const normalized = String(status || "pending").replace(/_/g, " ");
  if (status === "active") return "Approved - Active Marketing Partner";
  if (status === "approved") return "Approved - Activation Pending";
  if (status === "under_review") return "Under Review";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isOrganizationType(value: string) {
  return /organization|ngo|institution|company|llp/i.test(String(value || ""));
}

function requiredKycSectionsFor(application: any, fallbackPartnerType: string) {
  return kycSections.filter((section) =>
    section.required ||
    (section.id === "organization_document" && isOrganizationType(application?.partner_type || fallbackPartnerType))
  );
}

function uploadedKycText(section: any, doc: any) {
  if (!doc) return "Missing";
  if (section.id === "identity_proof") return "\u2713 Identity Proof Uploaded Successfully";
  if (section.id === "partner_photo") return "\u2713 Partner Photograph Uploaded Successfully";
  return `\u2713 ${doc.document_label || section.title} Uploaded Successfully`;
}

function paymentSummary(application: any) {
  const detail = application?.payment_detail;
  if (!detail) return "Payment Verification Pending";
  if (detail.payment_method === "bank_account") return `${detail.bank_name || "Bank"} - ${detail.masked_account || "masked"} (${detail.status})`;
  if (detail.payment_method === "upi") return `${detail.upi_masked || "UPI masked"} (${detail.status})`;
  return "Payment Verification Pending";
}

export default function PartnerWithUsScreen() {
  const { t } = useLanguage();
  const scrollRef = useRef<ScrollView>(null);
  const [formOffsetY, setFormOffsetY] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [kycAccepted, setKycAccepted] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [confirmation, setConfirmation] = useState<any>(null);
  const [selectedDocs, setSelectedDocs] = useState<Record<string, string>>({
    identity_proof: "aadhaar",
    address_proof: "aadhaar_address",
    partner_photo: "partner_selfie",
    organization_document: "incorporation_certificate",
  });
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, any>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  function setValue(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validateForm() {
    const required = [form.applicant_name, form.partner_type, form.phone, form.city, form.district, form.state, form.proposed_area_of_operation, form.experience_summary, form.vendor_onboarding_plan, form.customer_awareness_plan, form.pan_number, form.pan_name, form.tax_profile_type];
    if (required.some((value) => !String(value || "").trim())) return "Please fill all mandatory Partner Application, PAN/Tax and location fields.";
    if (!accepted || !kycAccepted) return "Please accept the Partner Program Terms and KYC/confidentiality declaration.";
    if (form.payment_method === "bank_account") {
      if (![form.account_holder_name, form.bank_name, form.account_number, form.account_number_confirm, form.ifsc_code, form.account_type].every((v) => String(v || "").trim())) return "Please fill all mandatory bank payment fields.";
      if (form.account_number !== form.account_number_confirm) return "Bank account number and re-entered account number do not match.";
    } else {
      if (![form.upi_id, form.upi_id_confirm, form.upi_name].every((v) => String(v || "").trim())) return "Please fill all mandatory UPI payment fields.";
      if (form.upi_id.trim().toLowerCase() !== form.upi_id_confirm.trim().toLowerCase()) return "UPI ID and re-entered UPI ID do not match.";
    }
    return "";
  }

  async function submitApplication() {
    const validation = validateForm();
    if (validation) {
      Alert.alert("Partner application", validation);
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(apiUrl("/api/partner/applications"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          revenue_share_percent: DEFAULT_BENEFIT_PERCENT,
          terms_version: PARTNER_TERMS_VERSION,
          terms_accepted: true,
          kyc_declaration_accepted: true,
          commission_payment: {
            method: form.payment_method,
            account_holder_name: form.account_holder_name,
            bank_name: form.bank_name,
            account_number: form.account_number,
            account_number_confirm: form.account_number_confirm,
            ifsc_code: form.ifsc_code,
            account_type: form.account_type,
            branch_name: form.branch_name,
            upi_id: form.upi_id,
            upi_id_confirm: form.upi_id_confirm,
            upi_name: form.upi_name,
          },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to submit partner application right now.");
      setConfirmation({ duplicate: Boolean(json.duplicate), ...(json.application || {}) });
      if (!json.duplicate) {
        setForm({ ...emptyForm });
        setAccepted(false);
        setKycAccepted(false);
      }
      setTimeout(() => scrollRef.current?.scrollTo({ y: formOffsetY, animated: true }), 50);
    } catch (error: any) {
      Alert.alert("Submission failed", error?.message || "Unable to submit partner application right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function appendFile(formData: FormData, picked: any) {
    const name = picked.name || picked.fileName || "partner-kyc-document.jpg";
    if (Platform.OS === "web") {
      if (picked.file) {
        formData.append("document", picked.file, name);
        return;
      }
      const response = await fetch(picked.uri);
      const blob = await response.blob();
      formData.append("document", blob, name);
      return;
    }
    formData.append("document", { uri: picked.uri, name, type: picked.mimeType || "image/jpeg" } as any);
  }

  async function uploadKyc(section: any, source: "camera" | "gallery" | "files") {
    if (!confirmation?.id || !confirmation?.phone) {
      Alert.alert("Submit application first", "Partner KYC upload is enabled after the application record is created.");
      return;
    }
    let asset: any = null;
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return Alert.alert("Camera permission required", "Allow camera access to capture Partner KYC documents.");
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
      if (!result.canceled) asset = result.assets?.[0];
    } else if (source === "gallery") {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
      if (!result.canceled) asset = result.assets?.[0];
    } else {
      const result = await DocumentPicker.getDocumentAsync({ type: section.id === "partner_photo" ? "image/*" : ["application/pdf", "image/*"], copyToCacheDirectory: true, multiple: false });
      if (!result.canceled) asset = result.assets?.[0];
    }
    if (!asset) return;
    setUploading(section.id);
    try {
      const option = section.options.find((item: any) => item[0] === selectedDocs[section.id]) || section.options[0];
      const formData = new FormData();
      formData.append("phone", confirmation.phone);
      formData.append("document_section", section.id);
      formData.append("document_type", option[0]);
      formData.append("document_label", option[1]);
      await appendFile(formData, asset);
      const response = await fetch(apiUrl(`/api/partner/applications/${confirmation.id}/kyc-documents`), { method: "POST", body: formData });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Upload failed. Please try again.");
      setUploadedDocs((current) => ({ ...current, [section.id]: json.document }));
      Alert.alert("Uploaded successfully", `${option[1]} uploaded successfully.`);
    } catch (error: any) {
      Alert.alert("Upload failed", error?.message || "Unable to upload Partner KYC document.");
    } finally {
      setUploading(null);
    }
  }

  async function submitKycForReview() {
    if (!confirmation?.id || !confirmation?.phone) return;
    const needed = requiredKycSectionsFor(confirmation, form.partner_type);
    const missing = needed.filter((section) => !uploadedDocs[section.id]);
    if (missing.length) return Alert.alert("KYC documents missing", missing.map((section) => `${section.title} missing`).join("\n"));
    const response = await fetch(apiUrl(`/api/partner/applications/${confirmation.id}/submit-kyc`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: confirmation.phone }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) return Alert.alert("KYC submission failed", json.error || "Unable to submit KYC.");
    setConfirmation({ ...confirmation, ...(json.application || {}) });
    Alert.alert("Partner KYC submitted", "Your Partner KYC is now under review.");
  }

  return (
    <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.content}>
      <BrandHeader compact subtitle="Partner Program" />
      <View style={styles.hero}>
        <Text style={styles.kicker}>Partner With Us</Text>
        <Text style={styles.title}>Help SabSewa Local Grow Across India & Earn Benefits</Text>
        <Text style={styles.lead}>The Partner Program is open to eligible customers, vendors, independent individuals, local promoters, business-development professionals and organizations who can help create active local SabSewa marketplaces.</Text>
        <TouchableOpacity style={styles.heroButton} onPress={() => scrollRef.current?.scrollTo({ y: formOffsetY, animated: true })}>
          <Text style={styles.heroButtonText}>Apply to Become a Partner</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.principleBox}><Text style={styles.principleText}>A successful SabSewa Partner does not simply add shops to the platform - the Partner helps create an active SabSewa marketplace in the locality by bringing local vendors and making local customers aware that they can order from those nearby shops through SabSewa Local.</Text></View>

      <View style={styles.band}>
        <Text style={styles.sectionTitle}>Partner Benefit</Text>
        <Text style={styles.largeMetric}>10%</Text>
        <Text style={styles.bodyText}>Initial configurable partner benefit on eligible SabSewa Local company revenue attributable to successfully onboarded vendors. GST, taxes, refundable security deposits, refunds, chargebacks, discounts, payment-gateway charges and legally required deductions are excluded. This is not equity or ownership.</Text>
      </View>

      <View style={styles.termsBox}>
        <Text style={styles.sectionTitle}>Conduct, Confidentiality and Suspension</Text>
        <Text style={styles.bullet}>- Partners must act honestly, lawfully and in the legitimate interest of the SabSewa Local ecosystem.</Text>
        <Text style={styles.bullet}>- Partners must not misuse vendor/customer data, collect unauthorized payments, misrepresent SabSewa Local, or disclose confidential company information.</Text>
        <Text style={styles.bullet}>- Serious misconduct may result in immediate protective suspension pending investigation; suspension is not automatic permanent termination.</Text>
        <Text style={styles.bullet}>- Unpaid commission may be held during investigation and released or adjusted according to final Partner Program Terms and applicable law.</Text>
      </View>

      <View nativeID="application" style={styles.formCard} onLayout={(event) => setFormOffsetY(event.nativeEvent.layout.y)}>
        {confirmation ? (
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>{confirmation.duplicate ? "Partner Application Already Exists" : "Congratulations! Your SabSewa Local Partner Application has been submitted successfully."}</Text>
            <Text style={styles.successBody}>{confirmation.duplicate ? "An application is already registered with this mobile number. Please note the Application ID and current status below." : "Your application and KYC documents have been received and are now under verification. Please wait until your KYC is reviewed and approved by SabSewa Local. After your Partner account is approved and activated, you can start onboarding local vendors and promoting SabSewa Local among customers in your approved area. You will be notified once your Partner account is approved."}</Text>
            <ConfirmLine label="Application ID" value={confirmation.application_id} />
            <ConfirmLine label="Name" value={confirmation.applicant_name} />
            <ConfirmLine label="Mobile Number" value={confirmation.phone} />
            <ConfirmLine label="Proposed Area" value={confirmation.proposed_area_of_operation} />
            <ConfirmLine label="Application Status" value={labelStatus(confirmation.status)} />
            <ConfirmLine label="KYC Status" value={confirmation.kyc_status === "documents_submitted" || confirmation.kyc_status === "under_review" ? "Pending Review" : labelStatus(confirmation.kyc_status)} />
            <ConfirmLine label="Commission Payment Method" value={paymentSummary(confirmation)} />
            <Text style={styles.notice}>Payment details are stored securely. Only masked payment details are shown here. Vendor onboarding/referral privileges unlock only after Partner KYC verification, payment-details verification and Master Admin activation.</Text>
            <TouchableOpacity style={styles.statusButton} onPress={() => scrollRef.current?.scrollTo({ y: formOffsetY, animated: true })}>
              <Text style={styles.statusButtonText}>View Application / KYC Status</Text>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>Partner KYC Upload</Text>
            {requiredKycSectionsFor(confirmation, form.partner_type).map((section: any) => (
              <View key={section.id} style={[styles.kycBox, uploadedDocs[section.id] && styles.kycDone]}>
                <Text style={styles.label}>{section.title} *</Text>
                <View style={styles.chips}>{section.options.map((option: any) => (
                  <TouchableOpacity key={option[0]} style={[styles.chip, selectedDocs[section.id] === option[0] && styles.chipSelected]} onPress={() => setSelectedDocs((current) => ({ ...current, [section.id]: option[0] }))}>
                    <Text style={[styles.chipText, selectedDocs[section.id] === option[0] && styles.chipTextSelected]}>{option[1]}</Text>
                  </TouchableOpacity>
                ))}</View>
                <Text style={uploadedDocs[section.id] ? styles.successText : styles.missingText}>{uploading === section.id ? "Uploading..." : uploadedKycText(section, uploadedDocs[section.id])}</Text>
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => uploadKyc(section, "camera")}><Text style={styles.secondaryText}>{section.id === "partner_photo" ? "Take Photo" : "Take Photo"}</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => uploadKyc(section, "gallery")}><Text style={styles.secondaryText}>Gallery</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => uploadKyc(section, "files")}><Text style={styles.secondaryText}>Files</Text></TouchableOpacity>
                </View>
              </View>
            ))}
            {requiredKycSectionsFor(confirmation, form.partner_type).filter((section: any) => !uploadedDocs[section.id]).map((section: any) => (
              <Text key={section.id} style={styles.missingText}>{section.title} missing - upload before submitting.</Text>
            ))}
            <TouchableOpacity
              style={[styles.primaryButton, (uploading || requiredKycSectionsFor(confirmation, form.partner_type).some((section: any) => !uploadedDocs[section.id])) && styles.disabled]}
              disabled={Boolean(uploading) || requiredKycSectionsFor(confirmation, form.partner_type).some((section: any) => !uploadedDocs[section.id])}
              onPress={submitKycForReview}
            >
              <Text style={styles.primaryText}>{uploading ? "Upload in progress..." : "Submit Partner KYC for Review"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setConfirmation(null)}><Text style={styles.secondaryText}>Submit another application</Text></TouchableOpacity>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Apply to Become a Partner</Text>
        <Field label="Full Name *" value={form.applicant_name} onChangeText={(v) => setValue("applicant_name", v)} />
        <Text style={styles.label}>Applicant Type *</Text>
        <View style={styles.chips}>{partnerTypes.map((type) => <Chip key={type} label={type} active={form.partner_type === type} onPress={() => setValue("partner_type", type)} />)}</View>
        <Field label="Organization / Business Name" value={form.organization_name} onChangeText={(v) => setValue("organization_name", v)} />
        <Field label="Mobile Number *" value={form.phone} onChangeText={(v) => setValue("phone", v)} keyboardType="phone-pad" />
        <Field label="Email Address (optional)" value={form.email} onChangeText={(v) => setValue("email", v)} keyboardType="email-address" />
        <View style={styles.twoCol}><Field label="City *" value={form.city} onChangeText={(v) => setValue("city", v)} containerStyle={styles.flexField} /><Field label="District *" value={form.district} onChangeText={(v) => setValue("district", v)} containerStyle={styles.flexField} /></View>
        <Field label="State *" value={form.state} onChangeText={(v) => setValue("state", v)} />
        <Field label="Proposed Area of Operation *" value={form.proposed_area_of_operation} onChangeText={(v) => setValue("proposed_area_of_operation", v)} />
        <Field label="Expected Vendor Reach" value={form.expected_vendor_reach} onChangeText={(v) => setValue("expected_vendor_reach", v)} keyboardType="numeric" />
        <Field label="Experience / Background *" value={form.experience_summary} onChangeText={(v) => setValue("experience_summary", v)} multiline />
        <Field label="How will you onboard local vendors? *" value={form.vendor_onboarding_plan} onChangeText={(v) => setValue("vendor_onboarding_plan", v)} multiline />
        <Field label="How will you create local customer awareness? *" value={form.customer_awareness_plan} onChangeText={(v) => setValue("customer_awareness_plan", v)} multiline />
        <Field label="Referral Source" value={form.referral_source} onChangeText={(v) => setValue("referral_source", v)} />

        <View style={styles.formSection}><Text style={styles.sectionTitle}>PAN / Tax Details</Text>
          <Field label="PAN Number *" value={form.pan_number} onChangeText={(v) => setValue("pan_number", v.toUpperCase())} />
          <Field label="Name as per PAN *" value={form.pan_name} onChangeText={(v) => setValue("pan_name", v)} />
          <Text style={styles.label}>Tax Profile Type *</Text>
          <View style={styles.chips}>{taxTypes.map((type) => <Chip key={type} label={type} active={form.tax_profile_type === type} onPress={() => setValue("tax_profile_type", type)} />)}</View>
          <Field label="GSTIN (optional / where applicable)" value={form.gstin} onChangeText={(v) => setValue("gstin", v.toUpperCase())} />
        </View>

        <View style={styles.formSection}><Text style={styles.sectionTitle}>{t("partner.commissionTitle")}</Text>
          <Text style={styles.notice}>Commission will be paid only after Partner KYC, payment details and Master Admin approval are completed. Do not enter OTP, PIN, CVV, card password or net-banking password.</Text>
          <View style={styles.chips}><Chip label="UPI" active={form.payment_method === "upi"} onPress={() => setValue("payment_method", "upi")} /><Chip label="Bank Account" active={form.payment_method === "bank_account"} onPress={() => setValue("payment_method", "bank_account")} /></View>
          {form.payment_method === "bank_account" ? (
            <>
              <Field label="Account Holder Name *" value={form.account_holder_name} onChangeText={(v) => setValue("account_holder_name", v)} />
              <Field label="Bank Name *" value={form.bank_name} onChangeText={(v) => setValue("bank_name", v)} />
              <Field label="Account Number *" value={form.account_number} onChangeText={(v) => setValue("account_number", v)} secureTextEntry />
              <Field label="Re-enter Account Number *" value={form.account_number_confirm} onChangeText={(v) => setValue("account_number_confirm", v)} secureTextEntry />
              <Field label="IFSC Code *" value={form.ifsc_code} onChangeText={(v) => setValue("ifsc_code", v.toUpperCase())} />
              <View style={styles.chips}><Chip label="Savings" active={form.account_type === "savings"} onPress={() => setValue("account_type", "savings")} /><Chip label="Current" active={form.account_type === "current"} onPress={() => setValue("account_type", "current")} /></View>
              <Field label="Branch Name (optional)" value={form.branch_name} onChangeText={(v) => setValue("branch_name", v)} />
            </>
          ) : (
            <>
              <Field label="UPI ID *" value={form.upi_id} onChangeText={(v) => setValue("upi_id", v.toLowerCase())} />
              <Field label="Re-enter UPI ID *" value={form.upi_id_confirm} onChangeText={(v) => setValue("upi_id_confirm", v.toLowerCase())} />
              <Field label="Name linked with UPI *" value={form.upi_name} onChangeText={(v) => setValue("upi_name", v)} />
            </>
          )}
        </View>

        <TouchableOpacity style={styles.acceptRow} onPress={() => setAccepted((value) => !value)}><View style={[styles.checkbox, accepted && styles.checked]}>{accepted ? <Text style={styles.checkText}>{"\u2713"}</Text> : null}</View><Text style={styles.acceptText}>I accept that the Partner Program is for vendor onboarding and customer awareness. I understand the initial 10% benefit applies only to eligible company revenue, is configurable by SabSewa Local, and does not mean equity or ownership.</Text></TouchableOpacity>
        <TouchableOpacity style={styles.acceptRow} onPress={() => setKycAccepted((value) => !value)}><View style={[styles.checkbox, kycAccepted && styles.checked]}>{kycAccepted ? <Text style={styles.checkText}>{"\u2713"}</Text> : null}</View><Text style={styles.acceptText}>I declare that the information and documents provided by me are true, valid and belong to me or the organization I am authorized to represent. I authorize SabSewa Local to use these documents for Partner Program identity, KYC, payment and compliance verification. I understand false, forged or misleading information may result in suspension or termination and withholding of payments where legally permitted.</Text></TouchableOpacity>

        <TouchableOpacity style={[styles.submitButton, submitting && styles.disabled]} onPress={submitApplication} disabled={submitting}><Text style={styles.submitText}>{submitting ? t("common.loading") : t("partner.submit")}</Text></TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <TouchableOpacity style={[styles.chip, active && styles.chipSelected]} onPress={onPress}><Text style={[styles.chipText, active && styles.chipTextSelected]}>{label}</Text></TouchableOpacity>;
}

function ConfirmLine({ label, value }: { label: string; value?: string | null }) {
  return <View style={styles.confirmLine}><Text style={styles.confirmLabel}>{label}</Text><Text style={styles.confirmValue}>{value || "-"}</Text></View>;
}

function Field({ label, value, onChangeText, keyboardType, multiline, containerStyle, secureTextEntry }: any) {
  return <View style={[styles.field, containerStyle]}><Text style={styles.label}>{label}</Text><TextInput style={[styles.input, multiline && styles.textArea]} value={value} onChangeText={onChangeText} keyboardType={keyboardType || "default"} multiline={multiline} secureTextEntry={secureTextEntry} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 20, paddingTop: 64, paddingBottom: 50 },
  hero: { backgroundColor: "#ecfeff", borderWidth: 1, borderColor: "#99f6e4", borderRadius: 8, padding: 18, marginBottom: 14 },
  kicker: { color: "#f97316", fontWeight: "900", marginBottom: 8, textTransform: "uppercase" },
  title: { color: "#0f172a", fontSize: 30, fontWeight: "900", lineHeight: 36 },
  lead: { color: "#334155", lineHeight: 21, marginTop: 10, marginBottom: 16 },
  heroButton: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14, alignItems: "center" },
  heroButtonText: { color: "#fff", fontWeight: "900" },
  principleBox: { borderWidth: 1, borderColor: "#bbf7d0", backgroundColor: "#f0fdf4", borderRadius: 8, padding: 14, marginBottom: 14 },
  principleText: { color: "#14532d", fontWeight: "800", lineHeight: 22 },
  band: { borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", borderRadius: 8, padding: 16, marginBottom: 14 },
  sectionTitle: { color: "#111827", fontSize: 20, fontWeight: "900", marginBottom: 10 },
  largeMetric: { color: "#f97316", fontSize: 46, fontWeight: "900" },
  bodyText: { color: "#374151", lineHeight: 21, marginBottom: 8 },
  bullet: { color: "#374151", lineHeight: 21, marginBottom: 5 },
  termsBox: { borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#f8fafc", borderRadius: 8, padding: 14, marginBottom: 14 },
  formCard: { borderWidth: 1, borderColor: "#dbeafe", backgroundColor: "#f8fbff", borderRadius: 8, padding: 16 },
  formSection: { borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff", borderRadius: 8, padding: 12, marginBottom: 12 },
  successCard: { borderWidth: 1, borderColor: "#86efac", backgroundColor: "#f0fdf4", borderRadius: 8, padding: 14, marginBottom: 16 },
  successTitle: { color: "#14532d", fontSize: 22, fontWeight: "900", marginBottom: 8 },
  successBody: { color: "#166534", lineHeight: 21, marginBottom: 10 },
  statusButton: { backgroundColor: "#1166ff", borderRadius: 8, padding: 12, alignItems: "center", marginBottom: 12 },
  statusButtonText: { color: "#fff", fontWeight: "900" },
  confirmLine: { padding: 10, borderBottomWidth: 1, borderBottomColor: "#dcfce7", backgroundColor: "#ffffff" },
  confirmLabel: { color: "#64748b", fontWeight: "800", marginBottom: 3 },
  confirmValue: { color: "#111827", fontWeight: "900" },
  notice: { color: "#7c2d12", backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 8, padding: 10, lineHeight: 18, marginBottom: 10 },
  field: { marginBottom: 12 },
  label: { color: "#334155", fontWeight: "800", marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#fff", borderRadius: 8, padding: 12 },
  textArea: { minHeight: 92, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: "#99f6e4", borderRadius: 999, paddingVertical: 8, paddingHorizontal: 11, backgroundColor: "#fff" },
  chipSelected: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  chipText: { color: "#0f766e", fontWeight: "800" },
  chipTextSelected: { color: "#fff" },
  twoCol: { flexDirection: "row", gap: 10 },
  flexField: { flex: 1 },
  acceptRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginVertical: 12 },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: "#64748b", borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  checkText: { color: "#fff", fontWeight: "900" },
  acceptText: { flex: 1, color: "#334155", lineHeight: 19 },
  submitButton: { backgroundColor: "#f97316", borderRadius: 8, padding: 14, alignItems: "center" },
  primaryButton: { backgroundColor: "#1166ff", borderRadius: 8, padding: 13, alignItems: "center", marginTop: 8 },
  primaryText: { color: "#fff", fontWeight: "900" },
  secondaryButton: { borderWidth: 1, borderColor: "#16a34a", borderRadius: 8, padding: 12, alignItems: "center", marginTop: 10 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: "#1166ff", borderRadius: 8, padding: 12, backgroundColor: "#fff" },
  secondaryText: { color: "#1166ff", fontWeight: "900", textAlign: "center" },
  disabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontWeight: "900" },
  kycBox: { borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff", borderRadius: 8, padding: 12, marginBottom: 10 },
  kycDone: { borderColor: "#86efac", backgroundColor: "#f0fdf4" },
  actions: { flexDirection: "row", gap: 10, marginTop: 10 },
  successText: { color: "#166534", fontWeight: "900" },
  missingText: { color: "#991b1b", fontWeight: "900" },
});