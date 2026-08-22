// app/auth/Register.tsx
import { useLocalSearchParams, usePathname, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { apiUrl } from "@/lib/backend";
import {
  SABSEWA_ACCEPTANCE_STATEMENT,
  SABSEWA_ACCEPTED_DOCUMENT_VERSIONS,
  SABSEWA_POLICY_BUNDLE_VERSION,
  SABSEWA_PRIVACY_VERSION,
  SABSEWA_TERMS_VERSION,
} from "@/lib/legalVersions";
import { authErrorKey, maskPhone, normalizeIndianPhone, validateIndianMobile } from "@/lib/phone";
import AsyncStorage from "@react-native-async-storage/async-storage";

type RegistrationMethod = "phone" | "email_password" | "email_otp" | "google";
const PHONE_AUTH_ENABLED = process.env.EXPO_PUBLIC_PHONE_AUTH_ENABLED === "true";
const EMAIL_OTP_ENABLED = process.env.EXPO_PUBLIC_EMAIL_OTP_ENABLED === "true";
const makeDiagnosticId = () => `SSL-AUTH-${Date.now().toString(36).toUpperCase()}`;

export default function RegisterScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { role, method: methodParam } = useLocalSearchParams();
  const requestedRole = Array.isArray(role) ? role[0] : role;
  const effectiveRole = requestedRole || (pathname === "/vendor/register" || pathname === "/vendor-registration" ? "vendor" : undefined);
  const { session, signInWithOtp, signUpWithEmailPassword, signInWithEmailOtp, signInWithGoogle } = useAuth();
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
  const [registeredVendorPhone, setRegisteredVendorPhone] = useState("");
  const [vendorDecisionMessage, setVendorDecisionMessage] = useState("");
  const { language, t } = useLanguage();

  // Vendor Partner Referral State
  const [referredByPartner, setReferredByPartner] = useState<boolean>(false);
  const [partnerSearch, setPartnerSearch] = useState({ name: "", phone: "", partnerId: "" });
  const [verifiedPartner, setVerifiedPartner] = useState<any>(null);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [verificationError, setVerificationError] = useState<string>("");

  const roleTitle =
    effectiveRole === "customer"
      ? t("common.customer")
      : effectiveRole === "vendor"
      ? t("common.vendor")
      : t("common.rider");

  useEffect(() => {
    let active = true;
    async function loadRegisteredVendorPhone() {
      if (effectiveRole !== "vendor") {
        if (active) setRegisteredVendorPhone("");
        return;
      }
      const value = await AsyncStorage.getItem("registered_vendor_phone");
      if (active) setRegisteredVendorPhone(value || "");
    }

    loadRegisteredVendorPhone();
    return () => {
      active = false;
    };
  }, [effectiveRole]);

  async function handleVerifyPartner() {
    if (!partnerSearch.phone.trim() && !partnerSearch.partnerId.trim()) {
      return setVerificationError("Please enter Partner registered mobile number or referral code.");
    }
    setVerifying(true);
    setVerificationError("");
    setVerifiedPartner(null);

    try {
      const res = await fetch(apiUrl("/api/partner/verify-referral"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_id: partnerSearch.partnerId,
          phone: partnerSearch.phone,
          partner_name: partnerSearch.name,
        }),
      });

      const data = await res.json();
      if (data.success && data.verified) {
        setVerifiedPartner(data.partner);
        setVerificationError("");
      } else {
        setVerificationError(data.error || "Partner details could not be verified.");
      }
    } catch (err: any) {
      setVerificationError("Error verifying Partner details. Please check network.");
    } finally {
      setVerifying(false);
    }
  }

  async function recordVendorOnboardingDecision(action: string) {
    setVendorDecisionMessage("");
    try {
      const response = await fetch(apiUrl("/api/vendor/onboarding/onboarding-decision"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          action,
          details: {
            source: "vendor_registration_existing_registration_panel",
            registered_vendor_phone: registeredVendorPhone || null,
          },
        }),
      });
      const json = await response.json().catch(() => ({}));
      setVendorDecisionMessage(json.message || "Your selection has been recorded.");
    } catch {
      setVendorDecisionMessage("Selection saved locally. Please continue from your Vendor Dashboard or contact support if this registration does not belong to you.");
    }
  }

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
    if (effectiveRole === "customer" && !address.trim()) return setError(t("auth.errorCustomerAddress"));
    if (effectiveRole === "vendor" && !shopName.trim()) return setError(t("auth.errorVendorShop"));
    if (effectiveRole === "vendor" && !address.trim()) return setError(t("auth.errorVendorAddress"));
    if (effectiveRole === "vendor" && referredByPartner && !verifiedPartner) {
      return setError("Please verify Partner details before proceeding or select 'No' for Partner referral.");
    }
    if (!acceptedPolicies) return setError(t("auth.errorPolicies"));

    if ((effectiveRole === "vendor" || effectiveRole === "rider") && !extra)
      return setError(t("auth.errorRequiredFields"));

    setError("");
    setTechnicalError("");

    setSubmitting(true);
    try {
      const formattedPhone = phone ? normalizeIndianPhone(phone) : "";
      const deviceMetadata = await getDeviceMetadata();
      const authMetadata = {
        role: effectiveRole,
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
        referred_by_partner_flag: Boolean(referredByPartner && verifiedPartner),
        partner_referral: {
          source_type: referredByPartner && verifiedPartner ? "approved_partner" : "direct_company",
          confirmed_by_vendor: !referredByPartner || Boolean(verifiedPartner),
          attribution_method: referredByPartner && verifiedPartner
            ? (partnerSearch.partnerId.trim() ? "partner_id_or_referral_code" : "registered_mobile")
            : "no_referral_selected",
          partner_application_id: verifiedPartner ? verifiedPartner.id : null,
          partner_id: verifiedPartner ? verifiedPartner.partner_id : null,
          referral_code: verifiedPartner ? (verifiedPartner.referral_code || verifiedPartner.partner_id) : null,
          entered_referral_id: partnerSearch.partnerId.trim() || null,
          entered_phone: partnerSearch.phone.trim() || null,
          entered_name: partnerSearch.name.trim() || null,
        },
        attributed_partner_id: verifiedPartner ? verifiedPartner.id : null,
        partner_referral_code_used: verifiedPartner ? (verifiedPartner.referral_code || verifiedPartner.partner_id) : null,
        customer_data_disclosure_consent:
          "Selected vendor receives customer name, selected delivery address and contact number only after accepting the order for fulfilment.",
      };

      if (method === "phone") {
        const { error: otpError } = await signInWithOtp(formattedPhone, authMetadata);
        if (otpError) throw otpError;

        router.push({
          pathname: "/auth/Login",
          params: { phone: formattedPhone, method: "phone", registering: "1", otpSent: "1", role: String(effectiveRole || "customer"), maskedPhone: maskPhone(formattedPhone) },
        });
        return;
      }

      if (method === "email_otp") {
        const { error: otpError } = await signInWithEmailOtp(email, authMetadata);
        if (otpError) throw otpError;

        router.push({
          pathname: "/auth/Login",
          params: { email: email.trim().toLowerCase(), method: "email_otp", registering: "1", otpSent: "1", role: String(effectiveRole || "customer") },
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

      {effectiveRole === "vendor" && registeredVendorPhone ? (
        <View style={styles.alreadyRegisteredBox}>
          <Text style={styles.alreadyRegisteredTitle}>You are already registered with SabSewa Local</Text>
          <Text style={styles.alreadyRegisteredText}>
            This browser/device was already used for vendor registration with mobile {registeredVendorPhone}. What would you like to do?
          </Text>
          <TouchableOpacity style={styles.alreadyRegisteredButton} onPress={() => router.push("/vendor" as any)}>
            <Text style={styles.alreadyRegisteredButtonText}>Open Vendor Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.alreadyRegisteredButtonAlt} onPress={() => router.push("/vendor/KYC" as any)}>
            <Text style={styles.alreadyRegisteredButtonAltText}>Continue Pending KYC</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.alreadyRegisteredButtonAlt} onPress={() => router.push("/vendor/SecurityWallet" as any)}>
            <Text style={styles.alreadyRegisteredButtonAltText}>Continue Pending Onboarding Payment</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.alreadyRegisteredButtonAlt} onPress={() => recordVendorOnboardingDecision("register_additional_branch")}>
            <Text style={styles.alreadyRegisteredButtonAltText}>Register Another Branch of Existing Business</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.alreadyRegisteredButtonAlt} onPress={() => recordVendorOnboardingDecision("register_additional_legal_entity")}>
            <Text style={styles.alreadyRegisteredButtonAltText}>Register Another Business / Legal Entity</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.alreadyRegisteredButtonAlt} onPress={() => recordVendorOnboardingDecision("add_authorized_terminal")}>
            <Text style={styles.alreadyRegisteredButtonAltText}>Add Another Authorized Terminal / Device</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.supportButton} onPress={() => recordVendorOnboardingDecision("contact_support_wrong_registration")}>
            <Text style={styles.supportButtonText}>This registration does not belong to me - Contact Support</Text>
          </TouchableOpacity>
          {vendorDecisionMessage ? <Text style={styles.alreadyRegisteredNotice}>{vendorDecisionMessage}</Text> : null}
        </View>
      ) : null}

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

      {(effectiveRole === "customer" || effectiveRole === "vendor") && (
        <View style={styles.inputBlock}>
          <Text style={styles.label}>{effectiveRole === "vendor" ? t("auth.shopAddress") : t("auth.customerAddress")}</Text>
          <TextInput
            style={styles.input}
            placeholder={effectiveRole === "vendor" ? t("auth.flatHouseVendor") : t("auth.flatHouseCustomer")}
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
      {effectiveRole === "vendor" && (
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

          {/* PARTNER REFERRAL VERIFICATION BOX FOR VENDORS */}
          <View style={styles.partnerReferralCard}>
            <Text style={styles.partnerSectionTitle}>Partner Referral Details</Text>
            <Text style={styles.label}>Were you referred or onboarded by a SabSewa Local Partner?</Text>

            <View style={styles.radioRow}>
              <TouchableOpacity
                style={[styles.radioBtn, referredByPartner && styles.radioActive]}
                onPress={() => setReferredByPartner(true)}
              >
                <Text style={referredByPartner ? styles.radioTextActive : styles.radioText}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.radioBtn, !referredByPartner && styles.radioActive]}
                onPress={() => {
                  setReferredByPartner(false);
                  setPartnerSearch({ name: "", phone: "", partnerId: "" });
                  setVerifiedPartner(null);
                  setVerificationError("");
                }}
              >
                <Text style={!referredByPartner ? styles.radioTextActive : styles.radioText}>I was not referred by anyone</Text>
              </TouchableOpacity>
            </View>

            {referredByPartner && (
              <View style={styles.verifyBox}>
                <TextInput
                  style={styles.input}
                  placeholder="Referrer name for assisted lookup"
                  value={partnerSearch.name}
                  onChangeText={(v) => setPartnerSearch({ ...partnerSearch, name: v })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Referrer registered mobile number"
                  keyboardType="phone-pad"
                  value={partnerSearch.phone}
                  onChangeText={(v) => setPartnerSearch({ ...partnerSearch, phone: v })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Partner ID or Referral ID"
                  value={partnerSearch.partnerId}
                  onChangeText={(v) => setPartnerSearch({ ...partnerSearch, partnerId: v })}
                />
                <Text style={styles.partnerHelpText}>
                  Partner ID/referral code or registered mobile number is required. Name alone cannot create a Partner attribution.
                </Text>

                <TouchableOpacity
                  style={styles.verifyBtn}
                  onPress={handleVerifyPartner}
                  disabled={verifying}
                >
                  <Text style={styles.verifyBtnText}>{verifying ? "Verifying..." : "Verify Partner Details"}</Text>
                </TouchableOpacity>

                {verifiedPartner && (
                  <View style={styles.verifiedCard}>
                    <Text style={styles.verifiedTitle}>✓ Verified Partner Linked</Text>
                    <Text style={styles.verifiedText}>Partner: {verifiedPartner.display_name || "Verified SabSewa Partner"}</Text>
                    <Text style={styles.verifiedText}>Partner/Referral ID: {verifiedPartner.partner_id || verifiedPartner.referral_code}</Text>
                    <Text style={styles.partnerHelpText}>
                      This Partner link will be saved only after SabSewa confirms the active Partner record during registration.
                    </Text>
                  </View>
                )}

                {verificationError ? <Text style={styles.partnerErrorText}>{verificationError}</Text> : null}
              </View>
            )}
          </View>
        </View>
      )}

      {effectiveRole === "rider" && (
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
          {acceptedPolicies ? <Text style={styles.checkText}>✓</Text> : null}
        </View>
        <Text style={styles.consentText}>{SABSEWA_ACCEPTANCE_STATEMENT}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.consentRow} onPress={() => setMarketingConsent((value) => !value)}>
        <View style={[styles.checkbox, marketingConsent && styles.checked]}>
          {marketingConsent ? <Text style={styles.checkText}>✓</Text> : null}
        </View>
        <Text style={styles.consentText}>{t("auth.marketingConsent")}</Text>
      </TouchableOpacity>

      {/* SUBMIT */}
      <TouchableOpacity style={[styles.registerBtn, (!acceptedPolicies || submitting) && styles.registerBtnDisabled]} onPress={handleRegister} disabled={submitting}>
        <Text style={styles.registerBtnText}>{submitting ? t("auth.pleaseWait") : method === "phone" || method === "email_otp" ? t("auth.acceptAndSendOtp") : t("auth.acceptAndRegister")}</Text>
      </TouchableOpacity>

      {/* BACK */}
      <TouchableOpacity onPress={() => router.push("/auth")}>
        <Text style={styles.backText}>← {t("auth.back")}</Text>
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
  alreadyRegisteredBox: {
    borderWidth: 1,
    borderColor: "#fdba74",
    backgroundColor: "#fff7ed",
    borderRadius: 10,
    padding: 12,
    marginBottom: 18,
  },
  alreadyRegisteredTitle: { color: "#9a3412", fontWeight: "900", marginBottom: 6 },
  alreadyRegisteredText: { color: "#7c2d12", lineHeight: 19 },
  alreadyRegisteredButton: { backgroundColor: "#0f766e", borderRadius: 8, padding: 11, alignItems: "center", marginTop: 10 },
  alreadyRegisteredButtonText: { color: "#fff", fontWeight: "900" },
  alreadyRegisteredButtonAlt: { borderWidth: 1, borderColor: "#0f766e", borderRadius: 8, padding: 10, alignItems: "center", marginTop: 8, backgroundColor: "#fff" },
  alreadyRegisteredButtonAltText: { color: "#0f766e", fontWeight: "900", textAlign: "center" },
  alreadyRegisteredNotice: { color: "#14532d", backgroundColor: "#f0fdf4", borderRadius: 8, padding: 9, marginTop: 10, lineHeight: 18 },
  supportButton: { borderWidth: 1, borderColor: "#b91c1c", borderRadius: 8, padding: 10, alignItems: "center", marginTop: 8, backgroundColor: "#fff7f7" },
  supportButtonText: { color: "#991b1b", fontWeight: "900", textAlign: "center" },
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

  partnerReferralCard: {
    borderWidth: 1,
    borderColor: "#fdba74",
    backgroundColor: "#fff7ed",
    borderRadius: 10,
    padding: 14,
    marginTop: 10,
    marginBottom: 10,
  },
  partnerSectionTitle: { fontSize: 16, fontWeight: "900", color: "#9a3412", marginBottom: 8 },
  radioRow: { flexDirection: "row", gap: 12, marginVertical: 8 },
  radioBtn: { flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 10, alignItems: "center", backgroundColor: "#fff" },
  radioActive: { backgroundColor: "#ea580c", borderColor: "#ea580c" },
  radioText: { color: "#334155", fontWeight: "800" },
  radioTextActive: { color: "#fff", fontWeight: "900" },
  verifyBox: { marginTop: 10 },
  verifyBtn: { backgroundColor: "#0f766e", borderRadius: 8, padding: 12, alignItems: "center", marginVertical: 6 },
  verifyBtnText: { color: "#fff", fontWeight: "900" },
  verifiedCard: { borderWidth: 1, borderColor: "#86efac", backgroundColor: "#f0fdf4", borderRadius: 8, padding: 10, marginTop: 8 },
  verifiedTitle: { color: "#166534", fontWeight: "900", marginBottom: 4 },
  verifiedText: { color: "#14532d", fontSize: 12 },
  partnerHelpText: { color: "#7c2d12", fontSize: 12, lineHeight: 17, marginBottom: 8 },
  partnerErrorText: { color: "#b91c1c", fontSize: 12, marginTop: 6, fontWeight: "700" },

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
