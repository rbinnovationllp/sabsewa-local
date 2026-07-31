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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { routeUser } from "@/src/utils/roleRouter";
import { supabase } from "@/lib/supabase";
import { apiUrl } from "@/lib/backend";
import { getDeviceMetadata } from "@/lib/deviceIdentity";
import { useLanguage } from "@/providers/LanguageProvider";
import {
  SABSEWA_ACCEPTANCE_STATEMENT,
  SABSEWA_ACCEPTED_DOCUMENT_VERSIONS,
  SABSEWA_POLICY_BUNDLE_VERSION,
  SABSEWA_PRIVACY_VERSION,
  SABSEWA_TERMS_VERSION,
} from "@/lib/legalVersions";

export default function LoginScreen() {
  const router = useRouter();
  const params: any = useLocalSearchParams();
  const { signInWithOtp, verifyOtp, loading } = useAuth();
  const { t } = useLanguage();

  const [phone, setPhone] = useState(params.phone ? String(params.phone) : "");
  const [otpSent, setOtpSent] = useState(false);
  const [token, setToken] = useState("");
  const [trustDevice, setTrustDevice] = useState(true);

  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1ï¸âƒ£ SEND OTP
  async function handleSendOTP() {
    setError(null);
    setSubmitLoading(true);

    try {
      const { error } = await signInWithOtp(phone);
      if (error) throw error;

      setOtpSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitLoading(false);
    }
  }

  // 2ï¸âƒ£ VERIFY OTP + ROUTE USER
  async function handleVerifyOTP() {
    setError(null);
    setSubmitLoading(true);

    try {
      const { data, error } = await verifyOtp(phone, token);
      if (error) throw error;

      const user = data.user;
      const metadata = user?.user_metadata || {};
      if (user?.id && metadata.role) {
        const { error: profileError } = await supabase.from("user_profiles").upsert({
          user_id: user.id,
          role: metadata.role,
          full_name: metadata.full_name || "",
          phone,
          city: metadata.city || "",
          preferred_language: metadata.preferred_language || "en",
          terms_version: metadata.terms_version || SABSEWA_TERMS_VERSION,
          privacy_version: metadata.privacy_version || SABSEWA_PRIVACY_VERSION,
          policies_accepted_at: new Date().toISOString(),
          policies_accepted_language: metadata.policy_acceptance_language || metadata.preferred_language || "en",
        }, { onConflict: "user_id" });
        if (profileError) throw new Error(profileError.message || t("auth.registrationSaveFailed"));

        if (metadata.accepted_policies) {
          const device = metadata.policy_acceptance_device || {};
          const { error: policyError } = await supabase.from("user_policy_acceptances").upsert({
            user_id: user.id,
            role: metadata.role,
            terms_version: metadata.terms_version || SABSEWA_TERMS_VERSION,
            privacy_version: metadata.privacy_version || SABSEWA_PRIVACY_VERSION,
            policy_bundle_version: metadata.policy_bundle_version || SABSEWA_POLICY_BUNDLE_VERSION,
            accepted_document_versions: metadata.accepted_document_versions || SABSEWA_ACCEPTED_DOCUMENT_VERSIONS,
            accepted_statement: metadata.policy_acceptance_statement || SABSEWA_ACCEPTANCE_STATEMENT,
            displayed_language: metadata.policy_acceptance_language || metadata.preferred_language || "en",
            device_id: device.device_id || null,
            device_name: device.device_name || null,
            platform: device.platform || null,
            app_version: device.app_version || null,
            session_id: data.session?.access_token ? data.session.access_token.slice(0, 16) : null,
            otp_verified: true,
            marketing_consent: Boolean(metadata.marketing_consent),
          }, { onConflict: "user_id,terms_version,privacy_version,policy_bundle_version,displayed_language" });
          if (policyError) throw new Error(policyError.message || t("auth.registrationSaveFailed"));
        }

        if (metadata.role === "customer" && metadata.primary_address) {
          const { error: addressError } = await supabase.from("customer_addresses").upsert({
            customer_id: user.id,
            label: "Primary",
            full_address: metadata.primary_address,
            city: metadata.city || "",
            is_primary: true,
          }, { onConflict: "customer_id,label" });
          if (addressError) throw new Error(addressError.message || t("auth.registrationSaveFailed"));
        }
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

      if (!role) throw new Error("User role not found.");

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

      // ðŸŽ¯ Redirect user based on role
      router.replace(routeUser(role) as any);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Login to SabSewa</Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {!otpSent ? (
        <>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter phone number"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />

          <TouchableOpacity
            style={styles.button}
            onPress={handleSendOTP}
            disabled={submitLoading}
          >
            {submitLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Send OTP</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.label}>Enter OTP</Text>
          <TextInput
            style={styles.input}
            placeholder="6-digit code"
            keyboardType="number-pad"
            value={token}
            onChangeText={setToken}
          />

          <TouchableOpacity style={styles.trustRow} onPress={() => setTrustDevice((value) => !value)}>
            <View style={[styles.checkbox, trustDevice && styles.checked]}>
              {trustDevice ? <Text style={styles.checkText}>✓</Text> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.trustTitle}>Trust this device</Text>
              <Text style={styles.trustText}>Stay signed in securely on this phone/browser until logout, revocation, prolonged inactivity or a security event.</Text>
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
              <Text style={styles.buttonText}>Verify OTP</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity
        onPress={() => router.push("/auth")}
        style={styles.backBtn}
      >
        <Text style={styles.backText}>â† Back</Text>
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
  errorText: { color: "red", marginBottom: 10, textAlign: "center" },
  trustRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginBottom: 12 },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: "#777", borderRadius: 6, alignItems: "center", justifyContent: "center", marginTop: 2 },
  checked: { backgroundColor: "#1e88e5", borderColor: "#1e88e5" },
  checkText: { color: "#fff", fontWeight: "900" },
  trustTitle: { fontWeight: "900", color: "#222" },
  trustText: { color: "#555", lineHeight: 18, fontSize: 12, marginTop: 2 },
  backBtn: { marginTop: 20, alignItems: "center" },
  backText: { color: "#1a237e", fontWeight: "600" },
});




