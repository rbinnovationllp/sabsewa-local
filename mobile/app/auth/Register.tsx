import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import BrandHeader from "@/components/BrandHeader";
import { useAuth } from "@/providers/AuthProvider";

export default function RegisterScreen() {
  const router = useRouter();
  const { signInWithOtp, signInWithEmailOtp, verifyOtp, verifyEmailOtp, user } = useAuth();

  const [authMode, setAuthMode] = useState<"phone" | "email">("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [step, setStep] = useState<"credentials" | "verify_otp">("credentials");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace("/vendor/dashboard" as any);
    }
  }, [user]);

  async function handleSendOtp() {
    if (authMode === "phone" && !phone.trim()) {
      Alert.alert("Required", "Please enter a valid mobile number.");
      return;
    }
    if (authMode === "email" && !email.trim()) {
      Alert.alert("Required", "Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      if (authMode === "phone") {
        const formattedPhone = phone.startsWith("+") ? phone : `+91${phone.trim()}`;
        const { error } = await signInWithOtp(formattedPhone);
        if (error) throw error;
        await AsyncStorage.setItem("registered_vendor_phone", formattedPhone);
      } else {
        const { error } = await signInWithEmailOtp(email.trim());
        if (error) throw error;
      }

      setStep("verify_otp");
      Alert.alert("OTP Sent", `Verification code sent via ${authMode === "phone" ? "SMS" : "Email"}.`);
    } catch (error) {
      Alert.alert("Authentication Error", error instanceof Error ? error.message : "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!otpToken.trim()) {
      Alert.alert("Required", "Please enter the verification OTP code.");
      return;
    }

    setLoading(true);
    try {
      const target = authMode === "phone" ? (phone.startsWith("+") ? phone : `+91${phone.trim()}`) : email.trim();
      const { error } =
        authMode === "phone"
          ? await verifyOtp(target, otpToken.trim())
          : await verifyEmailOtp(target, otpToken.trim());
      if (error) throw error;

      Alert.alert("Success", "Account authenticated successfully!");
      router.replace("/vendor/dashboard" as any);
    } catch (error) {
      Alert.alert("Verification Error", error instanceof Error ? error.message : "Invalid or expired OTP code.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Vendor Account Registration" />
      <Text style={styles.heading}>Register Account</Text>

      {step === "credentials" ? (
        <View style={styles.panel}>
          <Text style={styles.section}>Choose Registration Method</Text>
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, authMode === "phone" && styles.activeTab]}
              onPress={() => setAuthMode("phone")}
            >
              <Text style={[styles.tabText, authMode === "phone" && styles.activeTabText]}>Mobile OTP</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, authMode === "email" && styles.activeTab]}
              onPress={() => setAuthMode("email")}
            >
              <Text style={[styles.tabText, authMode === "email" && styles.activeTabText]}>Email OTP</Text>
            </TouchableOpacity>
          </View>

          {authMode === "phone" ? (
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Mobile Number (e.g. 9876543210)"
              keyboardType="phone-pad"
            />
          ) : (
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email Address"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          )}

          <TouchableOpacity style={[styles.primaryBtn, loading && styles.disabled]} onPress={handleSendOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Send Verification OTP</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.panel}>
          <Text style={styles.section}>Enter Verification OTP</Text>
          <Text style={styles.muted}>Code sent to {authMode === "phone" ? phone : email}</Text>

          <TextInput
            style={styles.input}
            value={otpToken}
            onChangeText={setOtpToken}
            placeholder="Enter 6-digit OTP"
            keyboardType="numeric"
          />

          <TouchableOpacity style={[styles.primaryBtn, loading && styles.disabled]} onPress={handleVerifyOtp} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Verify & Proceed</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep("credentials")} disabled={loading}>
            <Text style={styles.secondaryText}>Back / Change Details</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 40, backgroundColor: "#fff" },
  heading: { fontSize: 28, fontWeight: "900", color: "#111827", marginBottom: 16 },
  panel: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 16, backgroundColor: "#fff" },
  section: { fontSize: 18, fontWeight: "900", color: "#111827", marginBottom: 12 },
  tabRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  tab: { flex: 1, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, alignItems: "center" },
  activeTab: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  tabText: { fontWeight: "700", color: "#374151" },
  activeTabText: { color: "#fff" },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginBottom: 14, backgroundColor: "#fff" },
  primaryBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14, marginTop: 6 },
  primaryText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  secondaryBtn: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginTop: 10 },
  secondaryText: { color: "#374151", textAlign: "center", fontWeight: "700" },
  muted: { color: "#6b7280", fontSize: 12, marginBottom: 12 },
  disabled: { opacity: 0.6 },
});