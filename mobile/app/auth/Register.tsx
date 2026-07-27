// app/auth/register.tsx
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
import { supabase } from "@/lib/supabase";
import LanguageSelector from "@/components/LanguageSelector";
import { useLanguage } from "@/providers/LanguageProvider";

export default function RegisterScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams();

  const [fullname, setFullname] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [extra, setExtra] = useState("");
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [error, setError] = useState("");
  const { language } = useLanguage();

  const roleTitle =
    role === "customer"
      ? "Customer"
      : role === "vendor"
      ? "Vendor"
      : "Rider";

  const handleRegister = async () => {
    if (!fullname) return setError("Enter your full name");
    if (!phone || phone.length !== 10)
      return setError("Enter a valid 10-digit mobile number");
    if (!city) return setError("Enter your city name");
    if (role === "customer" && !address.trim()) return setError("Enter your primary delivery address");
    if (!acceptedPolicies) return setError("Please accept the Terms, Privacy Policy and direct vendor-payment terms.");

    if ((role === "vendor" || role === "rider") && !extra)
      return setError("Please fill all required fields");

    setError("");

    const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
      options: {
        data: {
          role,
          full_name: fullname,
          city,
          primary_address: address,
          preferred_language: language,
          service_type_or_area: extra,
          accepted_policies: true,
        },
      },
    });

    if (otpError) {
      setError(otpError.message);
      return;
    }

    router.push({
      pathname: "/auth/Login",
      params: { phone: formattedPhone },
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.wrapper}>
      {/* HEADER */}
      <Text style={styles.heading}>Register as {roleTitle}</Text>
      <Text style={styles.subheading}>Fill the details to create account</Text>

      {/* NAME */}
      <View style={styles.inputBlock}>
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your name"
          value={fullname}
          onChangeText={(t) => {
            setFullname(t);
            setError("");
          }}
        />
      </View>

      {/* MOBILE */}
      <View style={styles.inputBlock}>
        <Text style={styles.label}>Mobile Number</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter 10-digit number"
          keyboardType="number-pad"
          maxLength={10}
          value={phone}
          onChangeText={(t) => {
            setPhone(t);
            setError("");
          }}
        />
      </View>

      {/* CITY */}
      <View style={styles.inputBlock}>
        <Text style={styles.label}>City</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your city"
          value={city}
          onChangeText={(t) => {
            setCity(t);
            setError("");
          }}
        />
      </View>

      {role === "customer" && (
        <View style={styles.inputBlock}>
          <Text style={styles.label}>Primary Delivery Address</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            placeholder="House number, street, landmark"
            value={address}
            onChangeText={(t) => {
              setAddress(t);
              setError("");
            }}
          />
        </View>
      )}

      <View style={styles.inputBlock}>
        <LanguageSelector />
      </View>

      {/* ROLE-SPECIFIC EXTRA FIELD */}
      {role === "vendor" && (
        <View style={styles.inputBlock}>
          <Text style={styles.label}>Shop or Service Type</Text>
          <TextInput
            style={styles.input}
            placeholder="E.g., Kirana store, pharmacy, food, repair"
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
          <Text style={styles.label}>Delivery Area</Text>
          <TextInput
            style={styles.input}
            placeholder="E.g., Sector 10, Gurugram"
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

      <TouchableOpacity style={styles.consentRow} onPress={() => setAcceptedPolicies((value) => !value)}>
        <View style={[styles.checkbox, acceptedPolicies && styles.checked]}>
          {acceptedPolicies ? <Text style={styles.checkText}>✓</Text> : null}
        </View>
        <Text style={styles.consentText}>I accept the Terms, Privacy Policy, direct customer-to-vendor payment model, and data processing required for SabSewa Local.</Text>
      </TouchableOpacity>

      {/* SUBMIT */}
      <TouchableOpacity style={styles.registerBtn} onPress={handleRegister}>
        <Text style={styles.registerBtnText}>Create Account</Text>
      </TouchableOpacity>

      {/* BACK */}
      <TouchableOpacity onPress={() => router.push("/auth/index")}>
        <Text style={styles.backText}>← Back</Text>
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

  inputBlock: { marginBottom: 18 },
  label: { fontSize: 14, color: "#424242", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#fafafa",
    fontSize: 16,
  },
  textArea: { minHeight: 84, textAlignVertical: "top" },
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

  registerBtn: {
    backgroundColor: "#1e88e5",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 16,
  },
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


