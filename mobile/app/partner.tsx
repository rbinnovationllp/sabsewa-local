import React, { useEffect, useRef, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import BrandHeader from "@/components/BrandHeader";
import { useLanguage } from "@/providers/LanguageProvider";
import { apiUrl } from "@/lib/backend";

const PARTNER_TERMS_VERSION = "partner-program-local-2026-08-10";
const DEFAULT_BENEFIT_PERCENT = 10;
const STORAGE_KEY_PHONE = "sabsewa_partner_registered_phone";

const partnerTypes = [
  "Existing Customer", "Non-Customer", "Existing Vendor", "Non-Vendor", "Individual", 
  "Local Business Promoter", "Marketing or Business Development Professional", 
  "Consultant", "Organization", "NGO", "Educational Institution", "Other Stakeholder"
];

const taxTypes = ["individual", "proprietorship", "partnership", "llp", "company", "other"];

const discoverySources = [
  "Social Media", "Existing Partner", "Existing Vendor", "Existing Customer", 
  "Friend / Relative", "SabSewa Website", "Local Promotion", "Company Representative", "Other"
];

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
  discovery_source: "Social Media",
  discovery_source_other_description: "",
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
    ["aadhaar", "Aadhaar Card"], ["pan_card", "PAN Card"], ["voter_id", "Voter ID Card"], 
    ["driving_licence", "Driving Licence"], ["passport", "Passport"], ["other_identity_proof", "Other Government Identity Proof"]
  ] },
  { id: "address_proof", title: "Address Proof", required: true, options: [
    ["aadhaar_address", "Aadhaar with Address"], ["driving_licence_address", "Driving Licence with Address"], 
    ["passport_address", "Passport with Address"], ["voter_id_address", "Voter ID with Address"], 
    ["utility_bill", "Recent Utility Bill"], ["other_address_proof", "Other Address Proof"]
  ] },
  { id: "partner_photo", title: "Partner Photograph", required: true, options: [
    ["partner_selfie", "Passport-size Partner Photograph"], ["authorized_person_photo", "Authorized Person Photo"]
  ] },
  { id: "organization_document", title: "Organization Document", required: false, options: [
    ["incorporation_certificate", "Incorporation Certificate"], ["organization_pan", "Organization PAN"], 
    ["gst_certificate", "GST Certificate"], ["authorization_letter", "Authorization Letter"]
  ] }
];

function labelStatus(status: string) {
  const normalized = String(status || "pending").replace(/_/g, " ");
  if (status === "active") return "Approved - Active Marketing Partner";
  if (status === "approved") return "Approved - Activation Pending";
  if (status === "under_review" || status === "documents_submitted") return "Under Review (In Verification)";
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

export default function PartnerWithUsScreen() {
  const { t } = useLanguage();
  const scrollRef = useRef<ScrollView>(null);

  const [formOffsetY, setFormOffsetY] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submittingKyc, setSubmittingKyc] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  
  const [accepted, setAccepted] = useState(false);
  const [kycAccepted, setKycAccepted] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  
  // Status Resume Search
  const [lookupPhone, setLookupPhone] = useState("");
  const [showLookupBox, setShowLookupBox] = useState(false);
  
  // Specific Error Feedback States
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [errorField, setErrorField] = useState<string>("");
  const [kycSuccessMessage, setKycSuccessMessage] = useState<string>("");
  
  // Persistent Application Record State
  const [confirmation, setConfirmation] = useState<any>(null);
  
  const [selectedDocs, setSelectedDocs] = useState<Record<string, string>>({
    identity_proof: "aadhaar",
    address_proof: "aadhaar_address",
    partner_photo: "partner_selfie",
    organization_document: "incorporation_certificate",
  });
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, any>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  // Load persistent application state from localStorage / Backend on mount
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const savedPhone = window.localStorage.getItem(STORAGE_KEY_PHONE);
      if (savedPhone) {
        fetchApplicationByPhone(savedPhone, true);
      }
    }
  }, []);

  async function fetchApplicationByPhone(phoneToFetch: string, silent = false) {
    if (!phoneToFetch.trim()) {
      if (!silent) Alert.alert("Mobile Number Required", "Please enter your registered mobile number to look up your status.");
      return;
    }

    if (!silent) setCheckingStatus(true);
    setErrorMessage("");

    try {
      const cleanPhone = phoneToFetch.replace(/\D/g, "");
      const response = await fetch(apiUrl(`/api/partner/applications/status?phone=${encodeURIComponent(cleanPhone)}`));
      const json = await response.json();

      if (json.success && json.application) {
        setConfirmation(json.application);
        
        // Save to browser cache for refresh survival
        if (Platform.OS === "web" && typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY_PHONE, cleanPhone);
        }

        // Map existing uploaded documents
        if (json.application.kyc_documents && Array.isArray(json.application.kyc_documents)) {
          const docMap: Record<string, any> = {};
          json.application.kyc_documents.forEach((doc: any) => {
            if (doc.document_section) {
              docMap[doc.document_section] = doc;
            }
          });
          setUploadedDocs(docMap);
        }

        setShowLookupBox(false);
      } else {
        if (!silent) {
          setErrorMessage("No active Partner Application found for this mobile number. Please fill out the form below.");
          setConfirmation(null);
        }
      }
    } catch (err: any) {
      if (!silent) Alert.alert("Search Error", err?.message || "Unable to retrieve application status.");
    } finally {
      if (!silent) setCheckingStatus(false);
    }
  }

  function setValue(key: keyof typeof form, value: string) {
    if (errorField === key) setErrorField("");
    setErrorMessage("");
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validateForm(): { valid: boolean; field?: string; message?: string } {
    if (!form.applicant_name.trim()) return { valid: false, field: "applicant_name", message: "Full Name is required." };
    if (!form.phone.trim() || form.phone.replace(/\D/g, "").length < 10) return { valid: false, field: "phone", message: "Please enter a valid 10-digit Mobile Number." };
    if (!form.city.trim()) return { valid: false, field: "city", message: "City is required." };
    if (!form.district.trim()) return { valid: false, field: "district", message: "District is required." };
    if (!form.state.trim()) return { valid: false, field: "state", message: "State is required." };
    if (!form.proposed_area_of_operation.trim()) return { valid: false, field: "proposed_area_of_operation", message: "Proposed Area of Operation is required." };
    if (!form.experience_summary.trim()) return { valid: false, field: "experience_summary", message: "Experience / Background summary is required." };
    if (!form.vendor_onboarding_plan.trim()) return { valid: false, field: "vendor_onboarding_plan", message: "Vendor onboarding plan is required." };
    if (!form.customer_awareness_plan.trim()) return { valid: false, field: "customer_awareness_plan", message: "Customer awareness plan is required." };
    if (form.discovery_source === "Other" && !form.discovery_source_other_description.trim()) {
      return { valid: false, field: "discovery_source_other_description", message: "Please describe how you heard about us." };
    }
    if (!form.pan_number.trim() || !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(form.pan_number.trim())) {
      return { valid: false, field: "pan_number", message: "Please enter a valid 10-character PAN Number (e.g. ABCDE1234F)." };
    }
    if (!form.pan_name.trim()) return { valid: false, field: "pan_name", message: "Name as per PAN is required." };

    if (form.payment_method === "bank_account") {
      if (!form.account_holder_name.trim()) return { valid: false, field: "account_holder_name", message: "Account Holder Name is required." };
      if (!form.bank_name.trim()) return { valid: false, field: "bank_name", message: "Bank Name is required." };
      if (!form.account_number.trim()) return { valid: false, field: "account_number", message: "Bank Account Number is required." };
      if (form.account_number.trim() !== form.account_number_confirm.trim()) return { valid: false, field: "account_number_confirm", message: "Account numbers do not match." };
      if (!form.ifsc_code.trim() || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.ifsc_code.trim())) return { valid: false, field: "ifsc_code", message: "Please enter a valid IFSC code (e.g. SBIN0001234)." };
    } else {
      if (!form.upi_id.trim()) return { valid: false, field: "upi_id", message: "UPI ID is required." };
      if (form.upi_id.trim().toLowerCase() !== form.upi_id_confirm.trim().toLowerCase()) return { valid: false, field: "upi_id_confirm", message: "UPI IDs do not match." };
      if (!form.upi_name.trim()) return { valid: false, field: "upi_name", message: "Name linked with UPI is required." };
    }

    if (!accepted) return { valid: false, field: "accepted", message: "You must accept the Partner Program terms before submitting." };
    if (!kycAccepted) return { valid: false, field: "kycAccepted", message: "You must accept the Partner KYC declaration before submitting." };

    return { valid: true };
  }

  async function submitApplication() {
    setErrorMessage("");
    setErrorField("");

    const check = validateForm();
    if (!check.valid) {
      setErrorMessage(check.message || "Please correct the highlighted errors.");
      setErrorField(check.field || "");
      scrollRef.current?.scrollTo({ y: formOffsetY, animated: true });
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

      if (!response.ok || !json.success) {
        const serverError = json.error || "Unable to submit application right now.";
        setErrorMessage(serverError);
        if (serverError.toLowerCase().includes("mobile")) setErrorField("phone");
        else if (serverError.toLowerCase().includes("pan")) setErrorField("pan_number");

        scrollRef.current?.scrollTo({ y: formOffsetY, animated: true });
        return;
      }

      setConfirmation({ duplicate: Boolean(json.duplicate), ...(json.application || {}) });
      
      // Store in localStorage for reload survival
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY_PHONE, form.phone.replace(/\D/g, ""));
      }

      setErrorMessage("");
      setErrorField("");

      if (!json.duplicate) {
        setForm({ ...emptyForm });
        setAccepted(false);
        setKycAccepted(false);
      }

      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
    } catch (error: any) {
      setErrorMessage(error?.message || "Server or network error. Please try again.");
      scrollRef.current?.scrollTo({ y: formOffsetY, animated: true });
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
      setKycSuccessMessage(`${option[1]} uploaded successfully!`);
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
    if (missing.length) {
      Alert.alert("KYC documents missing", missing.map((section) => `${section.title} missing`).join("\n"));
      return;
    }

    setSubmittingKyc(true);
    setKycSuccessMessage("");

    try {
      const response = await fetch(apiUrl(`/api/partner/applications/${confirmation.id}/submit-kyc`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: confirmation.phone }),
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        Alert.alert("KYC submission failed", json.error || "Unable to submit KYC.");
        return;
      }

      setConfirmation({ ...confirmation, ...(json.application || {}), kyc_status: "under_review" });
      setKycSuccessMessage("🎉 Partner KYC Package Submitted Successfully! Status updated to Under Review.");
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 100);
    } catch (err: any) {
      Alert.alert("Submission Error", err?.message || "Network error submitting KYC.");
    } finally {
      setSubmittingKyc(false);
    }
  }

  function handleLogoutSession() {
    setConfirmation(null);
    setUploadedDocs({});
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY_PHONE);
    }
  }

  const isKycSubmitted = confirmation?.kyc_status === "under_review" || confirmation?.kyc_status === "verified";

  return (
    <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.content}>
      <BrandHeader compact subtitle="Partner Program" />

      {/* TOP RESUME / STATUS CHECKER TOOLBAR */}
      <View style={styles.resumeToolbar}>
        <Text style={styles.resumeToolbarTitle}>Already Applied as a Partner?</Text>
        <TouchableOpacity style={styles.resumeBtn} onPress={() => setShowLookupBox(!showLookupBox)}>
          <Text style={styles.resumeBtnText}>{showLookupBox ? "Close Search" : "Resume Incomplete KYC / Check Status"}</Text>
        </TouchableOpacity>
      </View>

      {showLookupBox && (
        <View style={styles.lookupCard}>
          <Text style={styles.lookupTitle}>Retrieve Existing Application</Text>
          <Text style={styles.lookupSub}>Enter your registered 10-digit mobile number to open your application record and resume KYC upload.</Text>
          <TextInput
            style={styles.lookupInput}
            placeholder="Enter Registered Mobile Number *"
            keyboardType="phone-pad"
            value={lookupPhone}
            onChangeText={setLookupPhone}
          />
          <TouchableOpacity style={styles.lookupSubmitBtn} onPress={() => fetchApplicationByPhone(lookupPhone)} disabled={checkingStatus}>
            <Text style={styles.lookupSubmitText}>{checkingStatus ? "Searching Database..." : "Verify & Resume KYC"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* PROMINENT SUCCESS CONFIRMATION BANNER */}
      {confirmation && (
        <View style={isKycSubmitted ? styles.kycSubmittedBanner : styles.successBanner}>
          <Text style={isKycSubmitted ? styles.kycSubmittedTitle : styles.successBannerTitle}>
            {isKycSubmitted ? "Partner KYC Under Review!" : "Application Submitted Successfully!"}
          </Text>
          <Text style={isKycSubmitted ? styles.kycSubmittedSub : styles.successBannerSub}>
            {isKycSubmitted
              ? "Your Partner KYC package and identity documents have been submitted to SabSewa Local. Verification will be completed within 48 hours."
              : "Your Partner Application record is active. Complete your KYC document upload below."}
          </Text>

          <TouchableOpacity style={styles.clearSessionBtn} onPress={handleLogoutSession}>
            <Text style={styles.clearSessionText}>Submit Another Application / Change Mobile Number</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* KYC SUCCESS NOTIFICATION */}
      {kycSuccessMessage ? (
        <View style={styles.kycSuccessBox}>
          <Text style={styles.kycSuccessText}>{kycSuccessMessage}</Text>
        </View>
      ) : null}

      {/* ERROR FEEDBACK CARD */}
      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorBoxTitle}>⚠️ Notice</Text>
          <Text style={styles.errorBoxText}>{errorMessage}</Text>
        </View>
      ) : null}

      <View style={styles.hero}>
        <Text style={styles.kicker}>Partner With Us</Text>
        <Text style={styles.title}>Help SabSewa Local Grow Across India & Earn Benefits</Text>
        <Text style={styles.lead}>
          The Partner Program is open to eligible customers, vendors, independent individuals, local promoters, business-development professionals and organizations who can help create active local SabSewa marketplaces.
        </Text>
      </View>

      {/* PARTNER APPLICATION DETAILS CONFIRMATION & KYC SECTION */}
      {confirmation && (
        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>Active Partner Application Record</Text>
          <ConfirmLine label="Application / Partner ID" value={confirmation.application_id || confirmation.partner_id} />
          <ConfirmLine label="Applicant Name" value={confirmation.applicant_name} />
          <ConfirmLine label="Mobile Number" value={confirmation.phone} />
          <ConfirmLine label="Proposed Area" value={confirmation.proposed_area_of_operation} />
          <ConfirmLine label="Application Status" value={labelStatus(confirmation.status)} />
          <ConfirmLine label="KYC Review Status" value={labelStatus(confirmation.kyc_status)} />

          <View style={{ height: 20 }} />

          <Text style={styles.sectionTitle}>Partner KYC Document Upload</Text>
          <Text style={styles.notice}>
            Upload clear photographs or PDF documents. Verification is completed by SabSewa Local within 48 hours.
          </Text>

          {requiredKycSectionsFor(confirmation, form.partner_type).map((section: any) => (
            <View key={section.id} style={[styles.kycBox, uploadedDocs[section.id] && styles.kycDone]}>
              <Text style={styles.label}>{section.title} *</Text>
              <View style={styles.chips}>
                {section.options.map((option: any) => (
                  <TouchableOpacity
                    key={option[0]}
                    style={[styles.chip, selectedDocs[section.id] === option[0] && styles.chipSelected]}
                    onPress={() => setSelectedDocs((current) => ({ ...current, [section.id]: option[0] }))}
                    disabled={isKycSubmitted}
                  >
                    <Text style={[styles.chipText, selectedDocs[section.id] === option[0] && styles.chipTextSelected]}>{option[1]}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={uploadedDocs[section.id] ? styles.successText : styles.missingText}>
                {uploading === section.id ? "Uploading file..." : uploadedDocs[section.id] ? `✓ Uploaded: ${uploadedDocs[section.id].file_name || "Document"}` : "Document missing"}
              </Text>

              {!isKycSubmitted && (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => uploadKyc(section, "camera")}><Text style={styles.secondaryText}>Take Photo</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => uploadKyc(section, "gallery")}><Text style={styles.secondaryText}>Gallery</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => uploadKyc(section, "files")}><Text style={styles.secondaryText}>Files</Text></TouchableOpacity>
                </View>
              )}
            </View>
          ))}

          <TouchableOpacity
            style={[
              styles.primaryButton,
              (isKycSubmitted || submittingKyc || uploading || requiredKycSectionsFor(confirmation, form.partner_type).some((section: any) => !uploadedDocs[section.id])) && styles.disabled
            ]}
            disabled={isKycSubmitted || submittingKyc || Boolean(uploading) || requiredKycSectionsFor(confirmation, form.partner_type).some((section: any) => !uploadedDocs[section.id])}
            onPress={submitKycForReview}
          >
            <Text style={styles.primaryText}>
              {submittingKyc
                ? "Submitting KYC..."
                : isKycSubmitted
                  ? "✓ Partner KYC Submitted for Review"
                  : uploading
                    ? "Upload in progress..."
                    : "Submit Partner KYC for Review"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* PARTNER APPLICATION FORM */}
      {!confirmation && (
        <View nativeID="application" style={styles.formCard} onLayout={(event) => setFormOffsetY(event.nativeEvent.layout.y)}>
          <Text style={styles.sectionTitle}>Apply to Become a Partner</Text>

          <Field
            label="Full Name *"
            value={form.applicant_name}
            onChangeText={(v: string) => setValue("applicant_name", v)}
            hasError={errorField === "applicant_name"}
          />

          <Text style={styles.label}>Applicant Type *</Text>
          <View style={styles.chips}>
            {partnerTypes.map((type) => (
              <Chip key={type} label={type} active={form.partner_type === type} onPress={() => setValue("partner_type", type)} />
            ))}
          </View>

          <Field label="Organization / Business Name" value={form.organization_name} onChangeText={(v: string) => setValue("organization_name", v)} />
          
          <Field
            label="Mobile Number *"
            value={form.phone}
            onChangeText={(v: string) => setValue("phone", v)}
            keyboardType="phone-pad"
            hasError={errorField === "phone"}
          />

          <Field label="Email Address (optional)" value={form.email} onChangeText={(v: string) => setValue("email", v)} keyboardType="email-address" />

          <View style={styles.twoCol}>
            <Field label="City *" value={form.city} onChangeText={(v: string) => setValue("city", v)} containerStyle={styles.flexField} hasError={errorField === "city"} />
            <Field label="District *" value={form.district} onChangeText={(v: string) => setValue("district", v)} containerStyle={styles.flexField} hasError={errorField === "district"} />
          </View>

          <Field label="State *" value={form.state} onChangeText={(v: string) => setValue("state", v)} hasError={errorField === "state"} />
          <Field label="Proposed Area of Operation *" value={form.proposed_area_of_operation} onChangeText={(v: string) => setValue("proposed_area_of_operation", v)} hasError={errorField === "proposed_area_of_operation"} />
          <Field label="Expected Vendor Reach" value={form.expected_vendor_reach} onChangeText={(v: string) => setValue("expected_vendor_reach", v)} keyboardType="numeric" />
          <Field label="Experience / Background *" value={form.experience_summary} onChangeText={(v: string) => setValue("experience_summary", v)} multiline hasError={errorField === "experience_summary"} />
          <Field label="How will you onboard local vendors? *" value={form.vendor_onboarding_plan} onChangeText={(v: string) => setValue("vendor_onboarding_plan", v)} multiline hasError={errorField === "vendor_onboarding_plan"} />
          <Field label="How will you create local customer awareness? *" value={form.customer_awareness_plan} onChangeText={(v: string) => setValue("customer_awareness_plan", v)} multiline hasError={errorField === "customer_awareness_plan"} />

          <Text style={styles.label}>How did you hear about the SabSewa Local Partner Program? *</Text>
          <View style={styles.chips}>
            {discoverySources.map((source) => (
              <Chip key={source} label={source} active={form.discovery_source === source} onPress={() => setValue("discovery_source", source)} />
            ))}
          </View>

          {form.discovery_source === "Other" && (
            <Field
              label="Please describe how you heard about us *"
              value={form.discovery_source_other_description}
              onChangeText={(v: string) => setValue("discovery_source_other_description", v)}
              multiline
              hasError={errorField === "discovery_source_other_description"}
            />
          )}

          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>PAN / Tax Details</Text>
            <Field label="PAN Number *" value={form.pan_number} onChangeText={(v: string) => setValue("pan_number", v.toUpperCase())} hasError={errorField === "pan_number"} />
            <Field label="Name as per PAN *" value={form.pan_name} onChangeText={(v: string) => setValue("pan_name", v)} hasError={errorField === "pan_name"} />
            
            <Text style={styles.label}>Tax Profile Type *</Text>
            <View style={styles.chips}>
              {taxTypes.map((type) => (
                <Chip key={type} label={type} active={form.tax_profile_type === type} onPress={() => setValue("tax_profile_type", type)} />
              ))}
            </View>

            <Field label="GSTIN (optional)" value={form.gstin} onChangeText={(v: string) => setValue("gstin", v.toUpperCase())} />
          </View>

          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>{t("partner.commissionTitle")}</Text>
            <Text style={styles.notice}>Commission will be paid after Partner KYC and Master Admin activation.</Text>

            <View style={styles.chips}>
              <Chip label="UPI" active={form.payment_method === "upi"} onPress={() => setValue("payment_method", "upi")} />
              <Chip label="Bank Account" active={form.payment_method === "bank_account"} onPress={() => setValue("payment_method", "bank_account")} />
            </View>

            {form.payment_method === "bank_account" ? (
              <>
                <Field label="Account Holder Name *" value={form.account_holder_name} onChangeText={(v: string) => setValue("account_holder_name", v)} hasError={errorField === "account_holder_name"} />
                <Field label="Bank Name *" value={form.bank_name} onChangeText={(v: string) => setValue("bank_name", v)} hasError={errorField === "bank_name"} />
                <Field label="Account Number *" value={form.account_number} onChangeText={(v: string) => setValue("account_number", v)} secureTextEntry hasError={errorField === "account_number"} />
                <Field label="Re-enter Account Number *" value={form.account_number_confirm} onChangeText={(v: string) => setValue("account_number_confirm", v)} secureTextEntry hasError={errorField === "account_number_confirm"} />
                <Field label="IFSC Code *" value={form.ifsc_code} onChangeText={(v: string) => setValue("ifsc_code", v.toUpperCase())} hasError={errorField === "ifsc_code"} />
                <View style={styles.chips}>
                  <Chip label="Savings" active={form.account_type === "savings"} onPress={() => setValue("account_type", "savings")} />
                  <Chip label="Current" active={form.account_type === "current"} onPress={() => setValue("account_type", "current")} />
                </View>
                <Field label="Branch Name (optional)" value={form.branch_name} onChangeText={(v: string) => setValue("branch_name", v)} />
              </>
            ) : (
              <>
                <Field label="UPI ID *" value={form.upi_id} onChangeText={(v: string) => setValue("upi_id", v.toLowerCase())} hasError={errorField === "upi_id"} />
                <Field label="Re-enter UPI ID *" value={form.upi_id_confirm} onChangeText={(v: string) => setValue("upi_id_confirm", v.toLowerCase())} hasError={errorField === "upi_id_confirm"} />
                <Field label="Name linked with UPI *" value={form.upi_name} onChangeText={(v: string) => setValue("upi_name", v)} hasError={errorField === "upi_name"} />
              </>
            )}
          </View>

          <TouchableOpacity style={styles.acceptRow} onPress={() => setAccepted((v) => !v)}>
            <View style={[styles.checkbox, accepted && styles.checked]}>{accepted ? <Text style={styles.checkText}>{"\u2713"}</Text> : null}</View>
            <Text style={styles.acceptText}>I accept that the Partner Program is for vendor onboarding and customer awareness. Initial 10% benefit applies only to eligible company revenue.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.acceptRow} onPress={() => setKycAccepted((v) => !v)}>
            <View style={[styles.checkbox, kycAccepted && styles.checked]}>{kycAccepted ? <Text style={styles.checkText}>{"\u2713"}</Text> : null}</View>
            <Text style={styles.acceptText}>I declare that all provided documents are true and authorize SabSewa Local to use them for KYC verification.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.submitButton, submitting && styles.disabled]} onPress={submitApplication} disabled={submitting}>
            <Text style={styles.submitText}>{submitting ? "Submitting Application..." : "Submit Partner Application"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <TouchableOpacity style={[styles.chip, active && styles.chipSelected]} onPress={onPress}><Text style={[styles.chipText, active && styles.chipTextSelected]}>{label}</Text></TouchableOpacity>;
}

function ConfirmLine({ label, value }: { label: string; value?: string | null }) {
  return <View style={styles.confirmLine}><Text style={styles.confirmLabel}>{label}</Text><Text style={styles.confirmValue}>{value || "-"}</Text></View>;
}

function Field({ label, value, onChangeText, keyboardType, multiline, containerStyle, secureTextEntry, hasError }: any) {
  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={[styles.label, hasError && styles.labelError]}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textArea, hasError && styles.inputError]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType || "default"}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 20, paddingTop: 40, paddingBottom: 50 },

  // RESUME TOOLBAR
  resumeToolbar: { backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 8, padding: 12, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resumeToolbarTitle: { fontSize: 13, fontWeight: "800", color: "#9a3412" },
  resumeBtn: { backgroundColor: "#ea580c", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
  resumeBtnText: { color: "#ffffff", fontWeight: "800", fontSize: 12 },

  lookupCard: { backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, padding: 14, marginBottom: 16 },
  lookupTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a", marginBottom: 4 },
  lookupSub: { fontSize: 12, color: "#475569", marginBottom: 10 },
  lookupInput: { borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#ffffff", borderRadius: 6, padding: 10, marginBottom: 10 },
  lookupSubmitBtn: { backgroundColor: "#0f766e", paddingVertical: 10, borderRadius: 6, alignItems: "center" },
  lookupSubmitText: { color: "#ffffff", fontWeight: "800" },

  // SUCCESS BANNERS
  successBanner: {
    backgroundColor: "#f0fdf4",
    borderWidth: 2,
    borderColor: "#16a34a",
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
    elevation: 3,
  },
  successBannerTitle: { fontSize: 22, fontWeight: "900", color: "#15803d", marginBottom: 6 },
  successBannerSub: { fontSize: 14, color: "#166534", lineHeight: 20, marginBottom: 8 },
  successBannerInstruction: { fontSize: 13, fontWeight: "700", color: "#0f766e", marginBottom: 14 },

  kycSubmittedBanner: {
    backgroundColor: "#ecfeff",
    borderWidth: 2,
    borderColor: "#0891b2",
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
  },
  kycSubmittedTitle: { fontSize: 22, fontWeight: "900", color: "#0e7490", marginBottom: 6 },
  kycSubmittedSub: { fontSize: 14, color: "#155e75", lineHeight: 20 },

  clearSessionBtn: { marginTop: 10, paddingVertical: 6 },
  clearSessionText: { color: "#0284c7", fontSize: 12, fontWeight: "800", textDecorationLine: "underline" },

  kycSuccessBox: { backgroundColor: "#dcfce7", borderWidth: 1, borderColor: "#22c55e", borderRadius: 8, padding: 12, marginBottom: 16 },
  kycSuccessText: { color: "#15803d", fontWeight: "800", fontSize: 13, textAlign: "center" },

  errorBox: { backgroundColor: "#fef2f2", borderWidth: 2, borderColor: "#dc2626", borderRadius: 10, padding: 14, marginBottom: 16 },
  errorBoxTitle: { fontSize: 16, fontWeight: "900", color: "#991b1b", marginBottom: 4 },
  errorBoxText: { fontSize: 14, color: "#b91c1c", fontWeight: "600" },

  hero: { backgroundColor: "#ecfeff", borderWidth: 1, borderColor: "#99f6e4", borderRadius: 8, padding: 18, marginBottom: 14 },
  kicker: { color: "#f97316", fontWeight: "900", marginBottom: 8, textTransform: "uppercase" },
  title: { color: "#0f172a", fontSize: 26, fontWeight: "900", lineHeight: 32 },
  lead: { color: "#334155", lineHeight: 21, marginTop: 10, marginBottom: 16 },

  principleBox: { borderWidth: 1, borderColor: "#bbf7d0", backgroundColor: "#f0fdf4", borderRadius: 8, padding: 14, marginBottom: 14 },
  principleText: { color: "#14532d", fontWeight: "800", lineHeight: 22 },
  band: { borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", borderRadius: 8, padding: 16, marginBottom: 14 },
  sectionTitle: { color: "#111827", fontSize: 20, fontWeight: "900", marginBottom: 10 },
  largeMetric: { color: "#f97316", fontSize: 42, fontWeight: "900" },
  bodyText: { color: "#374151", lineHeight: 21 },

  formCard: { borderWidth: 1, borderColor: "#dbeafe", backgroundColor: "#f8fbff", borderRadius: 8, padding: 16 },
  formSection: { borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff", borderRadius: 8, padding: 12, marginBottom: 12 },

  confirmLine: { padding: 10, borderBottomWidth: 1, borderBottomColor: "#e2e8f0", backgroundColor: "#ffffff" },
  confirmLabel: { color: "#64748b", fontWeight: "800", marginBottom: 2 },
  confirmValue: { color: "#111827", fontWeight: "900" },
  notice: { color: "#7c2d12", backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 8, padding: 10, lineHeight: 18, marginBottom: 10 },

  field: { marginBottom: 12 },
  label: { color: "#334155", fontWeight: "800", marginBottom: 6 },
  labelError: { color: "#dc2626" },
  input: { borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#fff", borderRadius: 8, padding: 12 },
  inputError: { borderColor: "#dc2626", backgroundColor: "#fef2f2" },
  textArea: { minHeight: 80, textAlignVertical: "top" },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: "#99f6e4", borderRadius: 999, paddingVertical: 8, paddingHorizontal: 11, backgroundColor: "#fff" },
  chipSelected: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  chipText: { color: "#0f766e", fontWeight: "800" },
  chipTextSelected: { color: "#fff" },

  twoCol: { flexDirection: "row", gap: 10 },
  flexField: { flex: 1 },

  acceptRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginVertical: 10 },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: "#64748b", borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  checkText: { color: "#fff", fontWeight: "900" },
  acceptText: { flex: 1, color: "#334155", lineHeight: 19 },

  submitButton: { backgroundColor: "#f97316", borderRadius: 8, padding: 15, alignItems: "center", marginTop: 10 },
  submitText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  primaryButton: { backgroundColor: "#1166ff", borderRadius: 8, padding: 13, alignItems: "center", marginTop: 8 },
  primaryText: { color: "#fff", fontWeight: "900" },
  disabled: { opacity: 0.6 },

  kycBox: { borderWidth: 1, borderColor: "#e5e7eb", backgroundColor: "#fff", borderRadius: 8, padding: 12, marginBottom: 10 },
  kycDone: { borderColor: "#86efac", backgroundColor: "#f0fdf4" },
  actions: { flexDirection: "row", gap: 10, marginTop: 10 },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: "#1166ff", borderRadius: 8, padding: 10, backgroundColor: "#fff" },
  secondaryText: { color: "#1166ff", fontWeight: "900", textAlign: "center", fontSize: 12 },
  successText: { color: "#166534", fontWeight: "900" },
  missingText: { color: "#991b1b", fontWeight: "900" },
});