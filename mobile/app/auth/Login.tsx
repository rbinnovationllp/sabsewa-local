import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadPendingRegistrationDraft, clearPendingRegistrationDraft } from "@/lib/pendingRegistration";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { routeUser } from "@/src/utils/roleRouter";
import { supabase } from "@/lib/supabase";
import { apiUrl } from "@/lib/backend";
import { getDeviceMetadata } from "@/lib/deviceIdentity";
import { useLanguage } from "@/providers/LanguageProvider";
import { completeRegistrationProfile } from "@/lib/registrationCompletion";
import { authErrorKey, maskPhone, normalizeIndianPhone, validateIndianMobile } from "@/lib/phone";

const PHONE_AUTH_ENABLED = process.env.EXPO_PUBLIC_PHONE_AUTH_ENABLED === "true";
const EMAIL_OTP_ENABLED = process.env.EXPO_PUBLIC_EMAIL_OTP_ENABLED === "true";
const makeDiagnosticId = () => `SSL-AUTH-${Date.now().toString(36).toUpperCase()}`;

function otpVerifyErrorKey(error: unknown) {
  const key = authErrorKey(error);
  return key === "auth.errorOtpSendFailed" ? "auth.errorOtpIncorrect" : key;
}

export default function LoginScreen() {
  const router = useRouter();
  const params: any = useLocalSearchParams();
  const { signInWithOtp, signInWithEmailOtp, verifyEmailOtp, verifyOtp } = useAuth();
  const { t } = useLanguage();

  const [phone, setPhone] = useState(params.phone ? String(params.phone) : "");
  const [email, setEmail] = useState(params.email ? String(params.email) : "");
  const [savedPhone, setSavedPhone] = useState<string | null>(null);

  const initialMethod = String(params.method || (params.email ? "email_otp" : "phone"));
  const [method, setMethod] = useState<"phone" | "email_otp">(
    initialMethod === "email_otp" && EMAIL_OTP_ENABLED ? "email_otp" : "phone"
  );

  const [otpSent, setOtpSent] = useState(params.otpSent === "1" || params.registering === "1");
  const [token, setToken] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [technicalError, setTechnicalError] = useState<string | null>(null);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load remembered registered phone number on component load
  useEffect(() => {
    async function loadStoredPhone() {
      try {
        const stored = await AsyncStorage.getItem("registered_vendor_phone");
        if (stored && !phone) {
          setSavedPhone(stored);
          setPhone(stored);
        }
      } catch (e) {
        console.warn("Error reading stored vendor phone", e);
      }
    }
    loadStoredPhone();
  }, []);

  function isRegistrationSaveError(err: any) {
    const message = String(err?.message || err || "").toLowerCase();
    return [
      "user_profiles",
      "customer_addresses",
      "user_policy_acceptances",
      "vendors",
      "row-level",
      "rls",
      "profile",
      "address",
      "policy",
      "terms",
    ].some((needle) => message.includes(needle));
  }

  const navigateTo = (path: string) => {
    try {
      router.replace(path as any);
    } catch (e) {
      if (Platform.OS === "web") {
        window.location.href = path;
      }
    }
  };

  async function handleSendOTP() {
    setError(null);
    setTechnicalError(null);
    setSubmitLoading(true);

    try {
      if (method === "email_otp") {
        if (!EMAIL_OTP_ENABLED) throw new Error("email_otp_disabled");
        const normalizedEmail = String(email || "").trim().toLowerCase();
        if (!normalizedEmail) throw new Error(t("auth.errorEmail"));
        const { error } = await signInWithEmailOtp(normalizedEmail);
        if (error) throw error;
        setEmail(normalizedEmail);
        setOtpSent(true);
        return;
      }

      if (!PHONE_AUTH_ENABLED) {
        throw new Error("phone_auth_disabled");
      }
      const validation = validateIndianMobile(phone);
      if (validation.ok === false) {
        const key = validation.reason === "unsupported_country"
          ? "auth.errorUnsupportedCountry"
          : validation.reason === "duplicate_country_code"
            ? "auth.errorDuplicateCountryCode"
            : "auth.errorMobile";
        throw new Error(t(key));
      }
      const normalizedPhone = normalizeIndianPhone(phone);
      const { error } = await signInWithOtp(normalizedPhone);
      if (error) throw error;

      // Save phone number locally for future sessions
      await AsyncStorage.setItem("registered_vendor_phone", normalizedPhone);

      setPhone(normalizedPhone);
      setOtpSent(true);
    } catch (err: any) {
      const diagnosticId = makeDiagnosticId();
      console.warn("OTP send error", { diagnosticId, message: err?.message || String(err || "") });
      setTechnicalError(diagnosticId);
      setError(
        err?.message === "phone_auth_disabled"
          ? t("auth.phoneRegistrationUnavailable")
          : err?.message === "email_otp_disabled"
            ? t("auth.emailOtpUnavailable")
          : err?.message?.startsWith?.("Please") || err?.message === t("auth.errorMobile")
            ? err.message
            : t(authErrorKey(err))
      );
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleVerifyOTP() {
    setError(null);
    setTechnicalError(null);
    setSubmitLoading(true);

    try {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const rawPhone = String(phone || "").trim();
      const normalizedPhone = method === "email_otp" ? "" : normalizeIndianPhone(rawPhone);

      const { data, error } = method === "email_otp"
        ? await verifyEmailOtp(normalizedEmail, token)
        : await verifyOtp(normalizedPhone, token);

      if (error) throw error;

      if (data.session?.access_token && data.session?.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (sessionError) throw sessionError;
      }

      const user = data.user;
      const metadata = user?.user_metadata || {};

      const registrationKey = method === "email_otp" ? normalizedEmail : normalizedPhone;
      const altKey1 = normalizedPhone.startsWith("+") ? normalizedPhone.replace("+", "") : "+" + normalizedPhone;
      const altKey2 = rawPhone;

      const pendingMetadata = 
        loadPendingRegistrationDraft(registrationKey) || 
        loadPendingRegistrationDraft(altKey1) || 
        loadPendingRegistrationDraft(altKey2) || 
        {};

      const mergedMetadata = {
        ...pendingMetadata,
        ...metadata,
        role: params.registering === "1"
          ? String(params.role || pendingMetadata.role || "customer")
          : (metadata.role || pendingMetadata.role || String(params.role || "")),
        phone: metadata.phone || pendingMetadata.phone || normalizedPhone || null,
        email: metadata.email || pendingMetadata.email || normalizedEmail || null,
      };

      let registrationResult: Awaited<ReturnType<typeof completeRegistrationProfile>> | null = null;
      if (user?.id && params.registering === "1") {
        registrationResult = await completeRegistrationProfile(user, data.session, mergedMetadata);
        clearPendingRegistrationDraft(registrationKey);
        clearPendingRegistrationDraft(altKey1);
        clearPendingRegistrationDraft(altKey2);
      }

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${data.user?.id}`,
        {
          headers: {
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${data.session?.access_token}`,
          },
        }
      );

      const profile = await res.json();
            let role = profile?.[0]?.role || mergedMetadata.role;

      if (!role && data.user?.id) {
        const { data: vendorProfile } = await supabase
          .from("vendors")
          .select("id")
          .eq("owner_user_id", data.user.id)
          .maybeSingle();
        if (vendorProfile?.id) role = "vendor";
      }

      if (!role) throw new Error(t("auth.userRoleNotFound"));

      if (trustDevice && data.session?.user?.id) {
        try {
          const device = await getDeviceMetadata();
          await fetch(apiUrl("/api/auth/trusted-device"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: data.session.user.id,
              device_id: device.device_id,
              device_name: device.device_name,
              platform: device.platform,
              app_version: device.app_version,
            }),
          });
        } catch (deviceErr) {
          console.warn("Device metadata registration skipped", deviceErr);
        }
      }

      if (params.registering === "1" && role === "customer") {
        if (Platform.OS === "web") {
          navigateTo("/customer/discover");
        } else {
          Alert.alert("SabSewa Local", t("auth.registrationSuccessCustomer"), [
            { text: "OK", onPress: () => navigateTo("/customer/discover") },
          ]);
        }
        return;
      }

      if (params.registering === "1" && role === "vendor") {
        const reference = registrationResult?.applicationReference || "generated";
        const referenceParam = encodeURIComponent(reference);
        const kycPath = registrationResult?.vendorId
          ? `/vendor/KYC?vendor=${registrationResult.vendorId}&registrationSubmitted=1&reference=${referenceParam}`
          : `/vendor/KYC?registrationSubmitted=1&reference=${referenceParam}`;
        const message = `Congratulations! Your vendor registration has been submitted successfully. Your application reference number is ${reference}. Please upload the required KYC documents to continue.`;
        if (Platform.OS === "web") {
          navigateTo(kycPath);
        } else {
          Alert.alert("SabSewa Local", message, [
            { text: "Continue to KYC Document Upload", onPress: () => navigateTo(kycPath) },
          ]);
        }
        return;
      }

      navigateTo(routeUser(role));
    } catch (err: any) {
      const diagnosticId = makeDiagnosticId();
      console.warn("OTP verify/profile completion error", { diagnosticId, message: err?.message || String(err || "") });
      setTechnicalError(diagnosticId);
      setError(t(isRegistrationSaveError(err) ? "auth.registrationSaveFailed" : otpVerifyErrorKey(err)) || err.message);
    } finally {
      setSubmitLoading(false);
    }
  }

  function handleUseAnotherAccount() {
    setSavedPhone(null);
    setPhone("");
    setEmail("");
    setOtpSent(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("auth.loginTitle")}</Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {technicalError ? <Text style={styles.technicalError}>{t("auth.diagnosticReference", { reference: technicalError })}</Text> : null}

      {!otpSent ? (
        <>
          {savedPhone ? (
            <View style={styles.savedAccountBox}>
              <Text style={styles.savedAccountTitle}>Registered Account Found</Text>
              <Text style={styles.savedPhoneText}>{maskPhone(savedPhone)}</Text>
              <TouchableOpacity style={styles.button} onPress={handleSendOTP} disabled={submitLoading}>
                {submitLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Send OTP to {maskPhone(savedPhone)}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.switchAccountBtn} onPress={handleUseAnotherAccount}>
                <Text style={styles.switchAccountText}>Use another number / account</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.modeRow}>
                <TouchableOpacity
                  style={[styles.modeChip, method === "email_otp" && styles.modeChipSelected, !EMAIL_OTP_ENABLED && styles.modeChipDisabled]}
                  onPress={() => {
                    if (!EMAIL_OTP_ENABLED) {
                      setError(t("auth.emailOtpUnavailable"));
                      return;
                    }
                    setMethod("email_otp");
                    setError(null);
                  }}
                >
                  <Text style={[styles.modeText, method === "email_otp" && styles.modeTextSelected]}>
                    {EMAIL_OTP_ENABLED ? t("auth.methodEmailOtp") : t("auth.methodEmailOtpUnavailable")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeChip, method === "phone" && styles.modeChipSelected, !PHONE_AUTH_ENABLED && styles.modeChipDisabled]}
                  onPress={() => {
                    if (!PHONE_AUTH_ENABLED) {
                      setError(t("auth.phoneRegistrationUnavailable"));
                      return;
                    }
                    setMethod("phone");
                    setError(null);
                  }}
                >
                  <Text style={[styles.modeText, method === "phone" && styles.modeTextSelected]}>{t("auth.methodPhone")}</Text>
                </TouchableOpacity>
              </View>

              {method === "email_otp" ? (
                <>
                  <Text style={styles.label}>{t("auth.emailAddress")}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t("auth.enterEmail")}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>{t("auth.phoneNumber")}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={t("auth.enterMobile")}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                </>
              )}

              <TouchableOpacity
                style={styles.button}
                onPress={handleSendOTP}
                disabled={submitLoading}
              >
                {submitLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>{method === "email_otp" ? t("auth.sendEmailOtp") : t("auth.sendOtp")}</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </>
      ) : (
        <>
          <Text style={styles.label}>{method === "email_otp" ? t("auth.enterEmailOtp") : t("auth.enterOtp")}</Text>
          <Text style={styles.otpDestination}>
            {method === "email_otp"
              ? t("auth.emailOtpSentTo", { email })
              : t("auth.otpSentTo", { phone: String(params.maskedPhone || maskPhone(phone)) })}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={t("auth.otpPlaceholder")}
            keyboardType="number-pad"
            value={token}
            onChangeText={setToken}
          />

          <TouchableOpacity style={styles.trustRow} onPress={() => setTrustDevice((value) => !value)}>
            <View style={[styles.checkbox, trustDevice && styles.checked]}>
              {trustDevice ? <Text style={styles.checkText}>✓</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.trustTitle}>{t("auth.trustDevice")}</Text>
              <Text style={styles.trustText}>{t("auth.trustDeviceText")}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.button}
            onPress={handleVerifyOTP}
            disabled={submitLoading}
          >
            {submitLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t("auth.verifyOtp")}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.resendBtn}
            onPress={handleSendOTP}
            disabled={submitLoading}
          >
            <Text style={styles.resendText}>{t("auth.resendOtp")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resendBtn} onPress={() => { setOtpSent(false); setToken(""); }}>
            <Text style={styles.resendText}>{t("auth.changeMobile")}</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity
        onPress={() => router.push("/auth")}
        style={styles.backBtn}
      >
        <Text style={styles.backText}>← {t("auth.back")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 20,
    textAlign: "center",
    color: "#1a237e",
  },
  label: {
    marginBottom: 8,
    fontWeight: "600",
    color: "#333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  button: {
    backgroundColor: "#1e88e5",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
  },
  resendBtn: {
    borderWidth: 1,
    borderColor: "#1e88e5",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  resendText: {
    color: "#1e88e5",
    fontWeight: "800",
  },
  savedAccountBox: {
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  savedAccountTitle: { fontSize: 14, fontWeight: "800", color: "#166534" },
  savedPhoneText: { fontSize: 20, fontWeight: "900", color: "#0f766e", marginVertical: 8 },
  switchAccountBtn: { marginTop: 12, alignItems: "center" },
  switchAccountText: { color: "#1e88e5", fontWeight: "700", fontSize: 13 },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  modeChip: { flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, padding: 10, alignItems: "center" },
  modeChipSelected: { backgroundColor: "#1e88e5", borderColor: "#1e88e5" },
  modeChipDisabled: { opacity: 0.5 },
  modeText: { color: "#334155", fontWeight: "800", textAlign: "center" },
  modeTextSelected: { color: "#fff" },
  errorText: { color: "red", marginBottom: 10, textAlign: "center" },
  technicalError: { color: "#7f1d1d", backgroundColor: "#fef2f2", borderRadius: 8, padding: 8, marginBottom: 12, fontSize: 11 },
  otpDestination: { color: "#64748b", marginBottom: 10, fontSize: 12 },
  trustRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 12 },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: "#777", borderRadius: 6, alignItems: "center", justifyContent: "center", marginTop: 2 },
  checked: { backgroundColor: "#1e88e5", borderColor: "#1e88e5" },
  checkText: { color: "#fff", fontWeight: "900" },
  trustTitle: { fontWeight: "900", color: "#222" },
  trustText: { color: "#555", lineHeight: 18, fontSize: 12, marginTop: 2 },
  backBtn: { marginTop: 20, alignItems: "center" },
  backText: { color: "#1a237e", fontWeight: "600" },
});
