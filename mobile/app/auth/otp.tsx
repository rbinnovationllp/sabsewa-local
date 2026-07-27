// app/auth/otp.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export default function OtpScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams();

  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");

  const verifyOtp = () => {
    if (otp.length !== 6) {
      setError("Enter the 6-digit OTP sent to your number");
      return;
    }

    setError("");

    // Later: Call backend to verify OTP (MSG91 / Supabase Auth)
    router.push("/"); // Redirect to Home or Dashboard after login
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.wrapper}>
      {/* HEADER */}
      <Text style={styles.heading}>Enter OTP</Text>
      <Text style={styles.subheading}>
        A 6-digit OTP has been sent to{" "}
        <Text style={styles.phoneText}>+91 {phone}</Text>
      </Text>

      {/* OTP INPUT */}
      <View style={styles.inputBlock}>
        <Text style={styles.label}>OTP Code</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={otp}
          maxLength={6}
          placeholder="Enter OTP"
          onChangeText={(value) => {
            setOtp(value);
            setError("");
          }}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      {/* VERIFY BUTTON */}
      <TouchableOpacity style={styles.verifyBtn} onPress={verifyOtp}>
        <Text style={styles.verifyBtnText}>Verify & Continue</Text>
      </TouchableOpacity>

      {/* RESEND */}
      <TouchableOpacity>
        <Text style={styles.resendText}>Resend OTP</Text>
      </TouchableOpacity>

      {/* BACK */}
      <TouchableOpacity onPress={() => router.push("/auth/login")}>
        <Text style={styles.backText}>← Back to Login</Text>
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
  phoneText: { color: "#1e88e5", fontWeight: "700" },

  inputBlock: { marginBottom: 20 },
  label: {
    fontSize: 14,
    color: "#424242",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 12,
    borderRadius: 10,
    fontSize: 20,
    textAlign: "center",
    letterSpacing: 4,
    backgroundColor: "#fafafa",
  },
  error: {
    color: "red",
    marginTop: 6,
    fontSize: 13,
    textAlign: "center",
  },

  verifyBtn: {
    backgroundColor: "#1e88e5",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  verifyBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },

  resendText: {
    color: "#1a237e",
    fontWeight: "600",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },

  backText: {
    textAlign: "center",
    color: "#1e88e5",
    fontWeight: "600",
    fontSize: 13,
    marginTop: 10,
  },
});


