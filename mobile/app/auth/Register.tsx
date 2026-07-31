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
import { getIndianMobileDigits, normalizeIndianPhone } from "@/lib/phone";

type RegistrationMethod = "phone" | "email_password" | "email_otp" | "google";

export default function RegisterScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams();
  const { signUpWithEmailPassword, signInWithEmailOtp, signInWithGoogle } = useAuth();

  const [fullname, setFullname] = useState("");
  const [method, setMethod] = useState<RegistrationMethod>("phone");
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
  const [submitting, setSubmitting] = useState(false);
  const { language, t } = useLanguage();

  const roleTitle =
    role === "customer"
      ? "Customer"
      : role === "vendor"
      ? "Vendor"
      : "Rider";

  const handleRegister = async () => {
    if (submitting) return;
    if (!fullname) return setError(t("auth.errorFullName"));
    const mobileDigits = getIndianMobileDigits(phone);
    if (method === "phone" && (!mobileDigits || mobileDigits.length !== 10))
      return setError(t("auth.errorMobile"));
    if ((method === "email_password" || method === "email_otp") && !email.trim()) {
      return setError("Enter your email address");
    }
    if (method === "email_password" && password.length < 8) {
      return setError("Enter a password of at least 8 characters");
    }
    if (!city) return setError(t("auth.errorCity"));
    const address = buildAddress();
    if (role === "customer" && !address.trim()) return setError(t("auth.errorCustomerAddress"));
    if (role === "vendor" && !shopName.trim()) return setError("Enter your shop or trade name");
    if (role === "vendor" && !address.trim()) return setError("Enter your shop address");
    if (!acceptedPolicies) return setError(t("auth.errorPolicies"));

    if ((role === "vendor" || role === "rider") && !extra)
      return setError("Please fill all required fields");

    setError("");

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
        const { error: otpError } = await supabase.auth.signInWithOtp({
          phone: formattedPhone,
          options: { data: authMetadata },
        });
        if (otpError) throw otpError;

        router.push({
          pathname: "/auth/Login",
          params: { phone: formattedPhone, method: "phone", registering: "1", otpSent: "1", role: String(role || "customer") },
        });
        return;
      }

      if (method === "email_otp") {
        const { error: otpError } = await signInWithEmailOtp(email, authMetadata);
        if (otpError) throw otpError;

        router.push({
          pathname: "/auth/Login",
          params: { email: email.trim().toLowerCase(), method: "email_otp", registering: "1", otpSent: "1", role: String(role || "customer") },
        });
        return;
      }

      if (method === "email_password") {
        const { error: signUpError } = await signUpWithEmailPassword(email, password, authMetadata);
        if (signUpError) throw signUpError;
        setError("Please verify your email using the link sent to your inbox, then log in.");
        return;
      }

      const { error: googleError } = await signInWithGoogle();
      if (googleError) throw googleError;
    } catch (err: any) {
      setError(err.message || t("auth.registrationSaveFailed"));
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
      <Text style={styles.heading}>{t("auth.registerTitle", { role: roleTitle })}</Text>
      <Text style={styles.subheading}>{t("auth.registerSubtitle")}</Text>

      <View style={styles.methodBox}>
        <Text style={styles.methodTitle}>How would you like to register?</Text>
        {[
          ["phone", "Continue with Mobile Number"],
          ["email_password", "Continue with Email and Password"],
          ["email_otp", "Continue with Email OTP"],
          ["google", "Continue with Google, where available"],
        ].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.methodBtn, method === key && styles.methodSelected]}
            onPress={() => setMethod(key as RegistrationMethod)}
          >
            <Text style={[styles.methodText, method === key && styles.methodTextSelected]}>{label}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.methodNote}>Email is optional. Mobile number remains the simplest primary option.</Text>
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
            <Text style={styles.countryCode}>+91</Text>
            <TextInput
              style={[styles.input, styles.phoneInput]}
              placeholder={t("auth.enterMobile")}
              keyboardType="number-pad"
              maxLength={10}
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
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="name@example.com"
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
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="At least 8 characters"
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
            placeholder={role === "vendor" ? "Shop/flat/house number" : "Flat/house number"}
            value={flatHouse}
            onChangeText={setFlatHouse}
          />
          <TextInput
            style={styles.input}
            placeholder="Building, apartment or society name"
            value={buildingSociety}
            onChangeText={setBuildingSociety}
          />
          <TextInput
            style={styles.input}
            placeholder="Street or locality"
            value={streetLocality}
            onChangeText={setStreetLocality}
          />
          <TextInput
            style={styles.input}
            placeholder="Landmark (optional)"
            value={landmark}
            onChangeText={setLandmark}
          />
          <TextInput
            style={styles.input}
            placeholder="PIN code"
            keyboardType="number-pad"
            value={pincode}
            onChangeText={setPincode}
          />
          <TextInput
            style={styles.input}
            placeholder="State"
            value={stateName}
            onChangeText={setStateName}
          />
          <TextInput
            style={[styles.input, styles.textArea]}
            multiline
            placeholder="Delivery instructions (optional)"
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
        <Text style={styles.legalText}>
          The selected vendor will receive your name, delivery address and contact number only after accepting your order for fulfilment.
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
      <TouchableOpacity style={[styles.registerBtn, (!acceptedPolicies || submitting) && styles.registerBtnDisabled]} onPress={handleRegister} disabled={submitting}>
        <Text style={styles.registerBtnText}>{submitting ? "Please wait..." : method === "phone" || method === "email_otp" ? "Accept and Send OTP" : t("auth.acceptAndRegister")}</Text>
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


