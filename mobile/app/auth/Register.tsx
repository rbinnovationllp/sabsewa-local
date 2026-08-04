// app/auth/register.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { savePendingRegistrationDraft } from "@/lib/pendingRegistration";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import LanguageSelector from "@/components/LanguageSelector";
import { useLanguage } from "@/providers/LanguageProvider";
import { useAuth } from "@/providers/AuthProvider";
import { getDeviceMetadata } from "@/lib/deviceIdentity";
import * as Location from "expo-location";
import {
  SABSEWA_ACCEPTANCE_STATEMENT,
  SABSEWA_ACCEPTED_DOCUMENT_VERSIONS,
  SABSEWA_POLICY_BUNDLE_VERSION,
  SABSEWA_PRIVACY_VERSION,
  SABSEWA_TERMS_VERSION,
} from "@/lib/legalVersions";
import { authErrorKey, maskPhone, normalizeIndianPhone, validateIndianMobile } from "@/lib/phone";

type RegistrationMethod = "phone" | "email_password" | "email_otp" | "google";
const PHONE_AUTH_ENABLED = process.env.EXPO_PUBLIC_PHONE_AUTH_ENABLED === "true";
const EMAIL_OTP_ENABLED = process.env.EXPO_PUBLIC_EMAIL_OTP_ENABLED === "true";
const makeDiagnosticId = () => `SSL-AUTH-${Date.now().toString(36).toUpperCase()}`;

export default function RegisterScreen() {
  const router = useRouter();
  const { role, method: methodParam } = useLocalSearchParams();
  const { signInWithOtp, signUpWithEmailPassword, signInWithEmailOtp, signInWithGoogle } = useAuth();
  const requestedMethod =
    methodParam === "phone" || methodParam === "email_otp" || methodParam === "email_password" || methodParam === "google"
      ? methodParam
      : "phone";

  const [fullname, setFullname] = useState("");
  const [method, setMethod] = useState<RegistrationMethod>(
    requestedMethod === "phone" && !PHONE_AUTH_ENABLED
      ? "email_password"
      : requestedMethod === "email_otp" && !EMAIL_OTP_ENABLED
        ? "email_password"
        : requestedMethod
  );
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [city, setCity] = useState("");
  const [flatHouse, setFlatHouse] = useState("");
  const [buildingSociety, setBuildingSociety] = useState("");
  const [streetLocality, setStreetLocality] = useState("");
  const [landmark, setLandmark] = useState("");
  const [pincode, setPincode] = useState("");
  const [stateName, setStateName] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [extra, setExtra] = useState("");
  const [shopName, setShopName] = useState("");
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState("");
  const [technicalError, setTechnicalError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { language, t } = useLanguage();

  const roleTitle =
    role === "customer"
      ? t("common.customer")
      : role === "vendor"
      ? t("common.vendor")
      : t("common.rider");

  const handleRegister = async () => {
    if (submitting) return;
    if (!fullname) return setError(t("auth.errorFullName"));
    if (method === "phone" && !PHONE_AUTH_ENABLED) {
      return setError(t("auth.phoneRegistrationUnavailable"));
    }
    if (method === "email_otp" && !EMAIL_OTP_ENABLED) {
      return setError(t("auth.emailOtpUnavailable"));
    }
    const mobileValidation = validateIndianMobile(phone);
    if (method === "phone" && mobileValidation.ok === false) {
      const key = mobileValidation.reason === "unsupported_country"
        ? "auth.errorUnsupportedCountry"
        : mobileValidation.reason === "duplicate_country_code"
          ? "auth.errorDuplicateCountryCode"
          : "auth.errorMobile";
      return setError(t(key));
    }
    if ((method === "email_password" || method === "email_otp") && !email.trim()) {
      return setError(t("auth.errorEmail"));
    }
    if (method === "email_password" && password.length < 8) {
      return setError(t("auth.errorPassword"));
    }
    if (!city) return setError(t("auth.errorCity"));
    const address = buildAddress();
    if (role === "customer" && !address.trim()) return setError(t("auth.errorCustomerAddress"));
    if (role === "vendor" && !shopName.trim()) return setError(t("auth.errorVendorShop"));
    if (role === "vendor" && !address.trim()) return setError(t("auth.errorVendorAddress"));
    if (!acceptedPolicies) return setError(t("auth.errorPolicies"));

    if ((role === "vendor" || role === "rider") && !extra)
      return setError(t("auth.errorRequiredFields"));

    setError("");
    setTechnicalError("");

    setSubmitting(true);
    try {
      const formattedPhone = phone ? normalizeIndianPhone(phone) : "";
      const deviceMetadata = await getDeviceMetadata();
      const authMetadata = {
        role,
        full_name: fullname,
        phone: formattedPhone || null,
        email: email.trim().toLowerCase() || null,
        city,
        state: stateName,
        pincode,
        primary_address: address,
        address_parts: {
          flat_house: flatHouse,
          building_society: buildingSociety,
          street_locality: streetLocality,
          landmark,
          pincode,
          city,
          state: stateName,
          delivery_instructions: deliveryInstructions,
        },
        shop_name: shopName,
        location_coordinates: locationCoords,
        preferred_language: language,
        service_type_or_area: extra,
        accepted_policies: true,
        terms_version: SABSEWA_TERMS_VERSION,
        privacy_version: SABSEWA_PRIVACY_VERSION,
        policy_bundle_version: SABSEWA_POLICY_BUNDLE_VERSION,
        accepted_document_versions: SABSEWA_ACCEPTED_DOCUMENT_VERSIONS,
        policy_acceptance_statement: SABSEWA_ACCEPTANCE_STATEMENT,
        policy_acceptance_language: language,
        policy_acceptance_device: deviceMetadata,
        marketing_consent: marketingConsent,
        registration_method: method,
        customer_data_disclosure_consent:
          "Selected vendor receives customer name, selected delivery address and contact number only after accepting the order for fulfilment.",
      };

      if (method === "phone") {
        // Standardize keys so draft is accurately retrieved across variations
        savePendingRegistrationDraft(formattedPhone, authMetadata);
        if (formattedPhone.startsWith("+")) {
          savePendingRegistrationDraft(formattedPhone.replace("+", ""), authMetadata);
        } else {
          savePendingRegistrationDraft("+" + formattedPhone, authMetadata);
        }
        savePendingRegistrationDraft(phone, authMetadata);

        const { error: otpError } = await signInWithOtp(formattedPhone, authMetadata);
        if (otpError) throw otpError;

        router.push({
          pathname: "/auth/Login",
          params: { 
            phone: formattedPhone, 
            method: "phone", 
            registering: "1", 
            otpSent: "1", 
            role: String(role || "customer"), 
            maskedPhone: maskPhone(formattedPhone) 
          },
        });
        return;
      }

      if (method === "email_otp") {
        savePendingRegistrationDraft(email.trim().toLowerCase(), authMetadata);
        const { error: otpError } = await signInWithEmailOtp(email, authMetadata);
        if (otpError) throw otpError;

        router.push({
          pathname: "/auth/Login",
          params: { 
            email: email.trim().toLowerCase(), 
            method: "email_otp", 
            registering: "1", 
            otpSent: "1", 
            role: String(role || "customer") 
          },
        });
        return;
      }

      if (method === "email_password") {
        const { error: signUpError } = await signUpWithEmailPassword(email, password, authMetadata);
        if (signUpError) throw signUpError;
        setError(t("auth.emailVerificationSent"));
        return;
      }

      const { error: googleError } = await signInWithGoogle();
      if (googleError) throw googleError;
    } catch (err: any) {
      const diagnosticId = makeDiagnosticId();
      console.warn("Registration OTP/auth error", { diagnosticId, message: err?.message || String(err || "") });
      setTechnicalError(diagnosticId);
      setError(t(authErrorKey(err)));
    } finally {
      setSubmitting(false);
    }
  };

  function buildAddress() {
    return [
      flatHouse,
      buildingSociety,
      streetLocality,
      landmark ? `Landmark: ${landmark}` : "",
      pincode ? `PIN: ${pincode}` : "",
      city,
      stateName,
      deliveryInstructions ? `Instructions: ${deliveryInstructions}` : "",
    ]
      .filter((part) => String(part || "").trim())
      .join(", ");
  }

  async function captureLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setError(t("auth.locationDenied"));
      return;
    }
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLocationCoords({ lat: current.coords.latitude, lng: current.coords.longitude });
    setError("");
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.wrapper}>
      {/* HEADER */}
      <Text style={styles.heading}>{t("auth.registerTitle", { role: roleTitle })}</Text>
      <Text style={styles.subheading}>{t("auth.registerSubtitle")}</Text>

      <View style={styles.methodBox}>
        <Text style={styles.methodTitle}>{t("auth.methodTitle")}</Text>
        {[
          ["phone", PHONE_AUTH_ENABLED ? t("auth.methodPhone") : t("auth.methodPhoneUnavailable")],
          ["email_password", t("auth.methodEmailPassword")],
          ["email_otp", EMAIL_OTP_ENABLED ? t("auth.methodEmailOtp") : t("auth.methodEmailOtpUnavailable")],
          ["google", t("auth.methodGoogle")],
        ].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.methodBtn,
              method === key && styles.methodSelected,
              ((key === "phone" && !PHONE_AUTH_ENABLED) || (key === "email_otp" && !EMAIL_OTP_ENABLED)) && styles.methodDisabled,
            ]}
            onPress={() => {
              if (key === "phone" && !PHONE_AUTH_ENABLED) {
                setError(t("auth.phoneRegistrationUnavailable"));
                return;
              }
              if (key === "email_otp" && !EMAIL_OTP_ENABLED) {
                setError(t("auth.emailOtpUnavailable"));
                return;
              }
              setMethod(key as RegistrationMethod);
            }}
          >
            <Text style={[styles.methodText, method === key && styles.methodTextSelected]}>{label}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.methodNote}>
          {!PHONE_AUTH_ENABLED ? t("auth.phoneRegistrationUnavailable") : !EMAIL_OTP_ENABLED ? t("auth.emailOtpUnavailable") : t("auth.methodNote")}
        </Text>
      </View>

      {/* NAME */}
      <View style={styles.inputBlock}>
        <Text style={styles.label}>{t("auth.fullName")}</Text>
        <TextInput
          style={styles.input}
          placeholder={t("auth.enterFullName")}
          value={fullname}
          onChangeText={(t) => {
            setFullname(t);
            setError("");
          }}
        />
      </View>

      {method === "phone" || method === "google" ? (
        <View style={styles.inputBlock}>
          <Text style={styles.label}>{t("auth.mobileNumber")}</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.countryCode}>{t("auth.countryCodeIndia")}</Text>
            <TextInput
              style={[styles.input, styles.phoneInput]}
              placeholder={t("auth.enterMobile")}
              keyboardType="phone-pad"
              maxLength={18}
              value={phone}
              onChangeText={(t) => {
                setPhone(t);
                setError("");
              }}
            />
          </View>
        </View>
      ) : (
        <View style={styles.inputBlock}>
          <Text style={styles.label}>{t("auth.emailAddress")}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("auth.enterEmail")}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError("");
            }}
          />
          {method === "email_password" ? (
            <>
              <Text style={styles.label}>{t("auth.password")}</Text>
              <TextInput
                style={styles.input}
                placeholder={t("auth.passwordPlaceholder")}
                secureTextEntry
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  setError("");
                }}
              />
            </>
          ) : null}
        </View>
      )}

      {/* CITY */}
      <View style={styles.inputBlock}>
        <Text style={styles.label}>{t("auth.city")}</Text>
        <TextInput
          style={styles.input}
          placeholder={t("auth.enterCity")}
          value={city}
          onChangeText={(t) => {
            setCity(t);
            setError("");
          }}
        />
      </View>

      {(role === "customer" || role === "vendor") && (
        <View style={styles.inputBlock}>
          <Text style={styles.label}>{role === "vendor" ? t("auth.shopAddress") : t("auth.customerAddress")}</Text>
          <TextInput
            style={styles.input}
            placeholder={role === "vendor" ? t("auth.flatHouseVendor") : t("auth.flatHouseCustomer")}
            value={flatHouse}
            onChangeText={setFlatHouse}
          />
          <TextInput
            style={styles.input}
            placeholder={t("auth.buildingSociety")}
            value={buildingSociety}
            onChangeText={setBuildingSociety}
          />
          <TextInput
            style={styles.input}
            placeholder={t("auth.streetLocality")}
            value={streetLocality}
            onChangeText={setStreetLocality}
          />
          <TextInput
            style={styles.input}
            placeholder={t("auth.landmarkOptional")}
            value={landmark}
            onChangeText={setLandmark}
          />
          <TextInput
            style={styles.input}
            placeholder={t("auth.pinCode")}
            keyboardType="number-pad"
            value={pincode}
            onChangeText={setPincode}
          />
          <TextInput
            style={styles.input}
            placeholder={t("auth.state")}
            value={stateName}
            onChangeText={setStateName}
          />
          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            placeholder={t("auth.deliveryInstructions")}
            value={deliveryInstructions}
            onChangeText={setDeliveryInstructions}
          />
          <TouchableOpacity style={styles.locationBtn} onPress={captureLocation}>
            <Text style={styles.locationText}>{locationCoords ? t("auth.locationAdded") : t("auth.useCurrentLocation")}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputBlock}>
        <LanguageSelector />
      </View>

      {/* ROLE-SPECIFIC EXTRA FIELD */}
      {role === "vendor" && (
        <View style={styles.inputBlock}>
          <Text style={styles.label}>{t("auth.shopTradeName")}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("auth.shopTradePlaceholder")}
            value={shopName}
            onChangeText={(t) => {
              setShopName(t);
              setError("");
            }}
          />
          <Text style={styles.label}>{t("auth.shopServiceType")}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("auth.shopServicePlaceholder")}
            value={extra}
            onChangeText={(t) => {
              setExtra(t);
              setError("");
            }}
          />
        </View>
      )}

      {role === "rider" && (
        <View style={styles.inputBlock}>
          <Text style={styles.label}>{t("auth.deliveryArea")}</Text>
          <TextInput
            style={styles.input}
            placeholder={t("auth.deliveryAreaPlaceholder")}
            value={extra}
            onChangeText={(t) => {
              setExtra(t);
              setError("");
            }}
          />
        </View>
      )}

      {/* ERROR */}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {technicalError ? <Text style={styles.technicalError}>{t("auth.diagnosticReference", { reference: technicalError })}</Text> : null}
      {technicalError ? (
        <View style={styles.retryBox}>
          <TouchableOpacity style={styles.retryChip} onPress={handleRegister} disabled={submitting}>
            <Text style={styles.retryText}>{t("auth.retry")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.retryChip} onPress={() => { setPhone(""); setTechnicalError(""); setError(""); }}>
            <Text style={styles.retryText}>{t("auth.changeMobile")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.retryChip} onPress={() => { setMethod(EMAIL_OTP_ENABLED ? "email_otp" : "email_password"); setTechnicalError(""); setError(""); }}>
            <Text style={styles.retryText}>{t("auth.registerWithEmail")}</Text>
          </TouchableOpacity>
          <Text style={styles.supportText}>{t("auth.supportHelp")}</Text>
        </View>
      ) : null}

      <View style={styles.legalBox}>
        <Text style={styles.legalTitle}>{t("auth.requiredBeforeRegistration")}</Text>
        <Text style={styles.legalText}>{t("auth.legalIntro")}</Text>
        <Text style={styles.legalText}>{t("auth.customerDisclosure")}</Text>
        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => router.push("/terms" as any)}>
            <Text style={styles.legalLink}>{t("auth.openTerms")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/customer-terms" as any)}>
            <Text style={styles.legalLink}>{t("auth.openCustomerTerms")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/vendor-terms" as any)}>
            <Text style={styles.legalLink}>{t("auth.openVendorTerms")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/privacy" as any)}>
            <Text style={styles.legalLink}>{t("auth.openPrivacy")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/credit-disclaimer" as any)}>
            <Text style={styles.legalLink}>{t("auth.openCreditDisclaimer")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/refund-cancellation" as any)}>
            <Text style={styles.legalLink}>{t("auth.openRefundPolicy")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/grievance-dispute" as any)}>
            <Text style={styles.legalLink}>{t("auth.openGrievance")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/policy" as any)}>
            <Text style={styles.legalLink}>{t("auth.openPlatformPolicy")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.consentRow} onPress={() => setAcceptedPolicies((value) => !value)}>
        <View style={[styles.checkbox, acceptedPolicies && styles.checked]}>
          {acceptedPolicies ? <Text style={styles.checkText}>{"\u2713"}</Text> : null}
        </View>
        <Text style={styles.consentText}>{SABSEWA_ACCEPTANCE_STATEMENT}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.consentRow} onPress={() => setMarketingConsent((value) => !value)}>
        <View style={[styles.checkbox, marketingConsent && styles.checked]}>
          {marketingConsent ? <Text style={styles.checkText}>{"\u2713"}</Text> : null}
        </View>
        <Text style={styles.consentText}>{t("auth.marketingConsent")}</Text>
      </TouchableOpacity>

      {/* SUBMIT */}
      <TouchableOpacity style={[styles.registerBtn, (!acceptedPolicies || submitting) && styles.registerBtnDisabled]} onPress={handleRegister} disabled={submitting}>
        <Text style={styles.registerBtnText}>{submitting ? t("auth.pleaseWait") : method === "phone" || method === "email_otp" ? t("auth.acceptAndSendOtp") : t("auth.acceptAndRegister")}</Text>
      </TouchableOpacity>

      {/* BACK */}
      <TouchableOpacity onPress={() => router.push("/auth")}>
        <Text style={styles.backText}>{"\u2190"} {t("auth.back")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ---------------------------- STYLES ---------------------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  wrapper: { padding: 20 },

  heading: {
    fontSize: 26,
    fontWeight: "800",
    color: "#1a237e",
    marginBottom: 6,
    marginTop: 10,
  },
  subheading: {
    fontSize: 14,
    color: "#616161",
    marginBottom: 20,
  },
  methodBox: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#f8fbff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
  },
  methodTitle: { fontWeight: "900", color: "#1a237e", marginBottom: 8 },
  methodBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 11,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  methodSelected: { backgroundColor: "#1e88e5", borderColor: "#1e88e5" },
  methodDisabled: { opacity: 0.55 },
  methodText: { color: "#334155", fontWeight: "800" },
  methodTextSelected: { color: "#fff" },
  methodNote: { color: "#64748b", fontSize: 12, lineHeight: 17 },

  inputBlock: { marginBottom: 18 },
  label: { fontSize: 14, color: "#424242", marginBottom: 6 },
  phoneRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  countryCode: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#f1f5f9",
    fontSize: 16,
    fontWeight: "900",
    color: "#0f766e",
    textAlignVertical: "center",
    paddingTop: 12,
  },
  phoneInput: { flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#fafafa",
    fontSize: 16,
    marginBottom: 10,
  },
  textArea: { minHeight: 84, textAlignVertical: "top" },
  locationBtn: { borderWidth: 1, borderColor: "#0f766e", padding: 11, borderRadius: 10, alignItems: "center", marginTop: 10 },
  locationText: { color: "#0f766e", fontWeight: "900" },
  legalBox: { borderWidth: 1, borderColor: "#d6e4ff", backgroundColor: "#f8fbff", padding: 12, borderRadius: 10, marginBottom: 14 },
  legalTitle: { fontSize: 14, fontWeight: "800", color: "#1a237e", marginBottom: 6 },
  legalText: { fontSize: 13, color: "#444", lineHeight: 19, marginBottom: 10 },
  legalLinks: { gap: 8 },
  legalLink: { color: "#1e88e5", fontWeight: "700", fontSize: 13 },
  consentRow: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 14 },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: "#777", borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: "#1e88e5", borderColor: "#1e88e5" },
  checkText: { color: "#fff", fontWeight: "900" },
  consentText: { flex: 1, color: "#444", lineHeight: 19 },

  error: {
    color: "red",
    marginBottom: 16,
    fontSize: 13,
    textAlign: "center",
  },
  technicalError: { color: "#7f1d1d", backgroundColor: "#fef2f2", borderRadius: 8, padding: 8, marginBottom: 12, fontSize: 11 },
  retryBox: { borderWidth: 1, borderColor: "#fecaca", backgroundColor: "#fff7f7", borderRadius: 10, padding: 10, marginBottom: 14 },
  retryChip: { borderWidth: 1, borderColor: "#1e88e5", borderRadius: 8, padding: 10, marginBottom: 8, alignItems: "center", backgroundColor: "#fff" },
  retryText: { color: "#1e88e5", fontWeight: "900" },
  supportText: { color: "#7f1d1d", fontSize: 12, lineHeight: 18 },

  registerBtn: {
    backgroundColor: "#1e88e5",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  registerBtnDisabled: { opacity: 0.65 },
  registerBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },

  backText: {
    textAlign: "center",
    color: "#1e88e5",
    fontWeight: "600",
    fontSize: 13,
    marginTop: 12,
  },
});