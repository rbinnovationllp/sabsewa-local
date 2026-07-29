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
import { getDeviceMetadata } from "@/lib/deviceIdentity";
import * as Location from "expo-location";
import {
  SABSEWA_ACCEPTANCE_STATEMENT,
  SABSEWA_ACCEPTED_DOCUMENT_VERSIONS,
  SABSEWA_POLICY_BUNDLE_VERSION,
  SABSEWA_PRIVACY_VERSION,
  SABSEWA_TERMS_VERSION,
} from "@/lib/legalVersions";

export default function RegisterScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams();

  const [fullname, setFullname] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [extra, setExtra] = useState("");
  const [shopName, setShopName] = useState("");
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
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
    if (role === "vendor" && !shopName.trim()) return setError("Enter your shop or trade name");
    if (role === "vendor" && !address.trim()) return setError("Enter your shop address");
    if (!acceptedPolicies) return setError("Please tick the Terms of Use and Privacy Notice acceptance before registration.");

    if ((role === "vendor" || role === "rider") && !extra)
      return setError("Please fill all required fields");

    setError("");

    const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;
    const deviceMetadata = await getDeviceMetadata();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: formattedPhone,
      options: {
        data: {
          role,
          full_name: fullname,
          city,
          primary_address: address,
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

  async function captureLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setError("Location permission was not granted. You can continue and add location later.");
      return;
    }
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLocationCoords({ lat: current.coords.latitude, lng: current.coords.longitude });
    setError("");
  }

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

      {(role === "customer" || role === "vendor") && (
        <View style={styles.inputBlock}>
          <Text style={styles.label}>{role === "vendor" ? "Shop Address" : "Primary Delivery Address"}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            placeholder={role === "vendor" ? "Shop number, street, locality, landmark" : "House number, street, landmark"}
            value={address}
            onChangeText={(t) => {
              setAddress(t);
              setError("");
            }}
          />
          <TouchableOpacity style={styles.locationBtn} onPress={captureLocation}>
            <Text style={styles.locationText}>{locationCoords ? "Location Added" : "Use Current Location"}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputBlock}>
        <LanguageSelector />
      </View>

      {/* ROLE-SPECIFIC EXTRA FIELD */}
      {role === "vendor" && (
        <View style={styles.inputBlock}>
          <Text style={styles.label}>Shop / Trade Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Public shop name"
            value={shopName}
            onChangeText={(t) => {
              setShopName(t);
              setError("");
            }}
          />
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

      <View style={styles.legalBox}>
        <Text style={styles.legalTitle}>Required before registration</Text>
        <Text style={styles.legalText}>
          Please open and review each applicable document before ticking acceptance. These documents remain visible in the app and are recorded by version for future dispute evidence.
        </Text>
        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => router.push("/terms" as any)}>
            <Text style={styles.legalLink}>Open Terms of Use</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/customer-terms" as any)}>
            <Text style={styles.legalLink}>Open Customer Terms</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/vendor-terms" as any)}>
            <Text style={styles.legalLink}>Open Vendor Terms</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/privacy" as any)}>
            <Text style={styles.legalLink}>Open Privacy Notice</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/credit-disclaimer" as any)}>
            <Text style={styles.legalLink}>Open Credit Record Disclaimer</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/refund-cancellation" as any)}>
            <Text style={styles.legalLink}>Open Refund/Cancellation Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/grievance-dispute" as any)}>
            <Text style={styles.legalLink}>Open Grievance and Dispute Policy</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/policy" as any)}>
            <Text style={styles.legalLink}>Open Platform Policy</Text>
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
        <Text style={styles.consentText}>Optional: I agree to receive promotional offers and marketing updates from SabSewa Local. I can opt out later.</Text>
      </TouchableOpacity>

      {/* SUBMIT */}
      <TouchableOpacity style={[styles.registerBtn, !acceptedPolicies && styles.registerBtnDisabled]} onPress={handleRegister}>
        <Text style={styles.registerBtnText}>Accept and Register</Text>
      </TouchableOpacity>

      {/* BACK */}
      <TouchableOpacity onPress={() => router.push("/auth")}>
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


