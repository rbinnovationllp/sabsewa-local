import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
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

export default function LoginScreen() {
  const router = useRouter();
  const params: any = useLocalSearchParams();
  const { signInWithOtp, signInWithEmailOtp, verifyEmailOtp, verifyOtp, loading } = useAuth();
  const { t } = useLanguage();

  const [phone, setPhone] = useState(params.phone ? String(params.phone) : "");
  const [email, setEmail] = useState(params.email ? String(params.email) : "");
  const initialMethod = String(params.method || (params.email ? "email_otp" : "phone"));
  const [method, setMethod] = useState(initialMethod === "email_otp" && EMAIL_OTP_ENABLED ? "email_otp" : "phone");
  const [otpSent, setOtpSent] = useState(params.otpSent === "1" || params.registering === "1");
  const [token, setToken] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);
  const [technicalError, setTechnicalError] = useState<string | null>(null);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // 1ï¸âƒ£ SEND OTP
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

  // 2ï¸âƒ£ VERIFY OTP + ROUTE USER
  async function handleVerifyOTP() {
    setError(null);
    setTechnicalError(null);
    setSubmitLoading(true);

    try {
      const normalizedEmail = String(email || "").trim().toLowerCase();
      const normalizedPhone = method === "email_otp" ? "" : normalizeIndianPhone(phone);
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
const pendingMetadata = loadPendingRegistrationDraft(registrationKey) || {};
const mergedMetadata = {
  ...pendingMetadata,
  ...metadata,
  role: metadata.role || pendingMetadata.role || String(params.role || "customer"),
  phone: metadata.phone || pendingMetadata.phone || normalizedPhone || null,
  email: metadata.email || pendingMetadata.email || normalizedEmail || null,
};

if (user?.id && params.registering === "1") {
  await completeRegistrationProfile(user, data.session, mergedMetadata);
  clearPendingRegistrationDraft(registrationKey);
}

      // ðŸ” Fetch Profile to get role
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${data.user?.id}`,
        {
          headers: {
            apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
            Authorization: `Bearer ${data.session.access_token}`,
          },
        }
      );

      const profile = await res.json();
      const role = profile?.[0]?.role;

      if (!role) throw new Error(t("auth.userRoleNotFound"));

      if (trustDevice && data.session?.user?.id) {
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
      }

      if (params.registering === "1" && role === "customer") {
        Alert.alert("SabSewa Local", t("auth.registrationSuccessCustomer"), [
          { text: "OK", onPress: () => router.replace("/customer/discover" as any) },
        ]);
        return;
      }
      if (params.registering === "1" && role === "vendor") {
        Alert.alert("SabSewa Local", t("auth.registrationSuccessVendor"), [
          { text: "OK", onPress: () => router.replace("/vendor/dashboard" as any) },
        ]);
        return;
      }

      // ðŸŽ¯ Redirect user based on role
      router.replace(routeUser(role) as any);
    } catch (err: any) {
      const diagnosticId = makeDiagnosticId();
      console.warn("OTP verify/profile completion error", { diagnosticId, message: err?.message || String(err || "") });
      setTechnicalError(diagnosticId);
      setError(t(isRegistrationSaveError(err) ? "auth.registrationSaveFailed" : authErrorKey(err)) || err.message);
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("auth.loginTitle")}</Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {technicalError ? <Text style={styles.technicalError}>{t("auth.diagnosticReference", { reference: technicalError })}</Text> : null}

      {!otpSent ? (
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
          {!PHONE_AUTH_ENABLED ? (
            <TouchableOpacity style={styles.resendBtn} onPress={() => router.push({ pathname: "/auth/Register", params: { role: params.role || "customer", method: EMAIL_OTP_ENABLED ? "email_otp" : "email_password" } } as any)}>
              <Text style={styles.resendText}>{t("auth.registerWithEmail")}</Text>
            </TouchableOpacity>
          ) : null}

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
          <TouchableOpacity style={styles.resendBtn} onPress={() => router.push({ pathname: "/auth/Register", params: { role: params.role || "customer", method: EMAIL_OTP_ENABLED ? "email_otp" : "email_password" } } as any)}>
            <Text style={styles.resendText}>{t("auth.registerWithEmail")}</Text>
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

/* ---------------------------- STYLES ---------------------------- */

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





