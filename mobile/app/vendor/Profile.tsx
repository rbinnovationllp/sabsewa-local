import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

type RequestCategory = "sensitive_contact" | "business_address" | "bank_details" | "legal_identity" | "kyc_documents" | "account_recovery";

const requestLabels: Record<RequestCategory, string> = {
  sensitive_contact: "Update Contact Information",
  business_address: "Update Business Address",
  bank_details: "Update Bank Details",
  legal_identity: "Update Legal / Entity Details",
  kyc_documents: "Update KYC Documents",
  account_recovery: "Account Recovery Request",
};

export default function VendorProfileScreen() {
  const params: any = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vendor, setVendor] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [operational, setOperational] = useState<any>({});
  const [requestCategory, setRequestCategory] = useState<RequestCategory>("sensitive_contact");
  const [requestDetails, setRequestDetails] = useState("");

  useEffect(() => {
    loadProfile();
  }, [user?.id, params.vendor]);

  async function resolveVendorId() {
    if (params.vendor) return String(params.vendor);
    if (!user?.id) return "";
    const { data } = await supabase
      .from("vendors")
      .select("id")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data?.id || "";
  }

  async function loadProfile() {
    setLoading(true);
    try {
      const vendorId = await resolveVendorId();
      if (!vendorId) throw new Error("Vendor profile not found for this account.");

      const response = await authenticatedFetch(`/api/vendor/profile/${vendorId}/profile`);
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load vendor profile.");

      setVendor(json.vendor);
      setRequests(json.change_requests || []);
      setOperational({
        shop_description: json.vendor.shop_description || "",
        business_hours: json.vendor.business_hours || "",
        delivery_radius_meters: json.vendor.delivery_radius_meters ? String(json.vendor.delivery_radius_meters) : "",
        price_display_preference: json.vendor.price_display_preference || "",
        shop_support_contact_preference: json.vendor.shop_support_contact_preference || "",
        preferred_language: json.vendor.preferred_language || "",
        notification_settings: json.vendor.notification_settings || {},
      });

      const deviceResponse = await authenticatedFetch("/api/auth/me/trusted-devices");
      const deviceJson = await deviceResponse.json();
      if (deviceResponse.ok && deviceJson.success) setDevices(deviceJson.devices || []);
    } catch (error) {
      Alert.alert("Profile unavailable", error instanceof Error ? error.message : "Unable to load profile.");
    } finally {
      setLoading(false);
    }
  }

  async function saveOperationalProfile() {
    if (!vendor?.id) return;
    setSaving(true);
    try {
      const response = await authenticatedFetch(`/api/vendor/profile/${vendor.id}/operational`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...operational,
          delivery_radius_meters: operational.delivery_radius_meters ? Number(operational.delivery_radius_meters) : 0,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Profile update failed.");
      Alert.alert("Profile updated", "Ordinary shop operation fields were saved.");
      await loadProfile();
    } catch (error) {
      Alert.alert("Update failed", error instanceof Error ? error.message : "Unable to save profile.");
    } finally {
      setSaving(false);
    }
  }

  function requestPayload() {
    return {
      change_category: requestCategory,
      field_changes: {
        request_details: requestDetails,
      },
    };
  }

  async function submitChangeRequest() {
    if (!vendor?.id) return;
    if (!requestDetails.trim()) {
      Alert.alert("Details required", "Please describe the change and supporting documents before submitting.");
      return;
    }
    setSaving(true);
    try {
      const response = await authenticatedFetch(`/api/vendor/profile/${vendor.id}/change-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload()),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Change request failed.");
      setRequestDetails("");
      Alert.alert("Request submitted", "The approved profile value remains active until Company review is completed.");
      await loadProfile();
    } catch (error) {
      Alert.alert("Request failed", error instanceof Error ? error.message : "Unable to submit change request.");
    } finally {
      setSaving(false);
    }
  }

  async function revokeDevice(deviceId: string) {
    try {
      const response = await authenticatedFetch("/api/auth/me/revoke-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_session_id: deviceId }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to revoke device.");
      await loadProfile();
    } catch (error) {
      Alert.alert("Revoke failed", error instanceof Error ? error.message : "Unable to revoke device.");
    }
  }

  async function secureAccount() {
    if (!vendor?.id) return;
    try {
      const response = await authenticatedFetch(`/api/vendor/profile/${vendor.id}/secure-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Vendor reported unauthorized profile or trusted-device activity" }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to secure account.");
      Alert.alert("Account secured", json.message || "Trusted devices were revoked.");
      router.replace("/auth/Login?role=vendor&intent=vendor_login" as any);
    } catch (error) {
      Alert.alert("Secure account failed", error instanceof Error ? error.message : "Unable to secure account.");
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading vendor profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Vendor profile, change requests and trusted devices" />
      <Text style={styles.heading}>Edit Vendor Profile</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>View Profile</Text>
        <Text style={styles.line}>Shop: {vendor?.shop_name || "Not recorded"}</Text>
        <Text style={styles.line}>Owner: {vendor?.owner_name || "Not recorded"}</Text>
        <Text style={styles.line}>Mobile: {vendor?.phone || "Not recorded"}</Text>
        <Text style={styles.line}>Email: {vendor?.email || "Optional / not recorded"}</Text>
        <Text style={styles.line}>Area: {[vendor?.locality, vendor?.city].filter(Boolean).join(", ") || "Not recorded"}</Text>
        <Text style={styles.line}>Status: {vendor?.status || vendor?.lifecycle_status || "Pending"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ordinary Operational Fields</Text>
        <Text style={styles.help}>These may be updated immediately after authenticated validation.</Text>
        <Input label="Shop Description" value={operational.shop_description} onChangeText={(value: string) => setOperational({ ...operational, shop_description: value })} multiline />
        <Input label="Business Hours" value={operational.business_hours} onChangeText={(value: string) => setOperational({ ...operational, business_hours: value })} />
        <Input label="Delivery Radius (metres, max 5000)" value={operational.delivery_radius_meters} onChangeText={(value: string) => setOperational({ ...operational, delivery_radius_meters: value.replace(/[^0-9]/g, "") })} keyboardType="number-pad" />
        <Input label="Price Display Preference" value={operational.price_display_preference} onChangeText={(value: string) => setOperational({ ...operational, price_display_preference: value })} />
        <Input label="Shop Support Contact Preference" value={operational.shop_support_contact_preference} onChangeText={(value: string) => setOperational({ ...operational, shop_support_contact_preference: value })} />
        <Input label="Preferred Language" value={operational.preferred_language} onChangeText={(value: string) => setOperational({ ...operational, preferred_language: value })} />
        <TouchableOpacity style={styles.primaryBtn} onPress={saveOperationalProfile} disabled={saving}>
          <Text style={styles.primaryText}>{saving ? "Saving..." : "Save Operational Profile"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sensitive, Legal, Financial and KYC Changes</Text>
        <Text style={styles.help}>These do not silently overwrite approved profile/KYC values. Submit a request for Company review.</Text>
        <View style={styles.chipRow}>
          {(Object.keys(requestLabels) as RequestCategory[]).map((category) => (
            <TouchableOpacity key={category} style={[styles.chip, requestCategory === category && styles.chipActive]} onPress={() => setRequestCategory(category)}>
              <Text style={[styles.chipText, requestCategory === category && styles.chipTextActive]}>{requestLabels[category]}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Input label="Proposed Change / Supporting Details" value={requestDetails} onChangeText={setRequestDetails} multiline />
        <TouchableOpacity style={styles.warningBtn} onPress={submitChangeRequest} disabled={saving}>
          <Text style={styles.warningText}>Submit Profile Change Request</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Trusted Devices</Text>
        <Text style={styles.help}>Trusted devices keep ordinary access convenient, but sensitive changes still require verification or review.</Text>
        {devices.length ? devices.map((device) => (
          <View key={device.id} style={styles.deviceBox}>
            <Text style={styles.deviceName}>{device.device_name || "Device"}</Text>
            <Text style={styles.muted}>{device.platform || "Unknown"} | {device.app_version || "App"}</Text>
            <Text style={styles.muted}>Last used: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "Never"}</Text>
            <Text style={device.revoked_at ? styles.revoked : styles.trusted}>{device.revoked_at ? "Revoked" : "Active / Trusted"}</Text>
            {!device.revoked_at ? (
              <TouchableOpacity style={styles.dangerOutline} onPress={() => revokeDevice(device.id)}>
                <Text style={styles.dangerText}>Revoke Device</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )) : <Text style={styles.muted}>No trusted devices found.</Text>}
        <TouchableOpacity style={styles.dangerBtn} onPress={secureAccount}>
          <Text style={styles.dangerBtnText}>This Was Not Me - Secure My Account</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Profile Change History</Text>
        {requests.length ? requests.map((request) => (
          <View key={request.id} style={styles.historyRow}>
            <Text style={styles.historyTitle}>{requestLabels[request.change_category as RequestCategory] || request.change_category}</Text>
            <Text style={styles.muted}>Status: {request.review_status} | Verification: {request.verification_status}</Text>
            <Text style={styles.muted}>Submitted: {request.submitted_at ? new Date(request.submitted_at).toLocaleString() : "Not recorded"}</Text>
            {request.reviewer_reason ? <Text style={styles.muted}>Reason: {request.reviewer_reason}</Text> : null}
          </View>
        )) : <Text style={styles.muted}>No profile change requests yet.</Text>}
      </View>
    </ScrollView>
  );
}

function Input(props: any) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput {...props} style={[styles.input, props.multiline && styles.textArea]} placeholderTextColor="#94a3b8" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 70, paddingBottom: 50, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  heading: { fontSize: 28, fontWeight: "900", marginBottom: 14 },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 14, backgroundColor: "#fff" },
  cardTitle: { fontSize: 18, fontWeight: "900", marginBottom: 8, color: "#111827" },
  line: { color: "#334155", marginTop: 4, fontWeight: "700" },
  help: { color: "#64748b", lineHeight: 20, marginBottom: 10 },
  inputGroup: { marginBottom: 10 },
  label: { fontWeight: "900", color: "#1f2937", marginBottom: 5 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 11, backgroundColor: "#fff", color: "#111827" },
  textArea: { minHeight: 90, textAlignVertical: "top" },
  primaryBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 13, marginTop: 4 },
  primaryText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  warningBtn: { borderWidth: 1, borderColor: "#f59e0b", backgroundColor: "#fff7ed", borderRadius: 8, padding: 13, marginTop: 4 },
  warningText: { color: "#9a3412", textAlign: "center", fontWeight: "900" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: "#99f6e4", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8 },
  chipActive: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  chipText: { color: "#0f766e", fontWeight: "800", fontSize: 12 },
  chipTextActive: { color: "#fff" },
  deviceBox: { borderWidth: 1, borderColor: "#dbeafe", borderRadius: 8, padding: 12, marginTop: 8, backgroundColor: "#f8fbff" },
  deviceName: { fontWeight: "900", color: "#0f172a" },
  muted: { color: "#64748b", marginTop: 4 },
  trusted: { color: "#15803d", fontWeight: "900", marginTop: 6 },
  revoked: { color: "#b91c1c", fontWeight: "900", marginTop: 6 },
  dangerOutline: { borderWidth: 1, borderColor: "#ef4444", borderRadius: 8, padding: 10, marginTop: 10 },
  dangerText: { color: "#b91c1c", textAlign: "center", fontWeight: "900" },
  dangerBtn: { backgroundColor: "#b91c1c", borderRadius: 8, padding: 13, marginTop: 12 },
  dangerBtnText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  historyRow: { borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 10, marginTop: 10 },
  historyTitle: { fontWeight: "900", color: "#111827" },
});
