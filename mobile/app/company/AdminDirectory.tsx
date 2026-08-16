import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";

const ADMIN_ROLES = [
  { value: "national_admin", label: "National Admin" },
  { value: "state_admin", label: "State Admin" },
  { value: "district_admin", label: "District / City Admin" },
  { value: "city_admin", label: "City Admin" },
  { value: "kyc_reviewer", label: "KYC Reviewer" },
  { value: "support_admin", label: "Support Admin" },
  { value: "finance_admin", label: "Finance Admin" },
];

const ROLE_HELP: Record<string, string> = {
  national_admin: "KYC, vendors and reports across assigned national scope.",
  state_admin: "KYC, vendors and reports for assigned state.",
  district_admin: "KYC and vendor management for assigned district/city.",
  city_admin: "KYC and vendor management for assigned city/locality.",
  kyc_reviewer: "KYC review only.",
  support_admin: "Support/admin staff functions only.",
  finance_admin: "Payment review and reports only.",
};

const DEFAULT_FORM = {
  lookup: "",
  user_id: "",
  admin_name: "",
  phone: "",
  email: "",
  role: "kyc_reviewer",
  jurisdiction: "",
};

function parseJurisdiction(value: string) {
  const text = value.trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid jurisdiction JSON.");
    return parsed;
  } catch {
    return { area: text };
  }
}

export default function AdminDirectoryScreen() {
  const [search, setSearch] = useState("");
  const [admins, setAdmins] = useState<any[]>([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { loadAdmins(); }, []);

  const selectedRole = useMemo(() => ADMIN_ROLES.find((role) => role.value === form.role), [form.role]);

  function updateForm(key: keyof typeof DEFAULT_FORM, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function loadAdmins() {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
    const response = await authenticatedFetch(`/api/company/admins${query}`);
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Admin directory unavailable", json.error || "Unable to load admins.");
      return;
    }
    setAdmins(json.admins || []);
  }

  async function lookupAuthUser() {
    const lookup = form.lookup.trim();
    if (!lookup) {
      Alert.alert("Enter phone or email", "Enter the future admin's registered mobile number or email address first.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await authenticatedFetch(`/api/company/admins/auth-user-lookup?search=${encodeURIComponent(lookup)}`);
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to lookup Supabase Auth user.");
      if (!json.user) {
        setMessage("No Auth user found. Ask the person to register/login once, or create the user in Supabase Auth, then search again.");
        return;
      }

      setForm((current) => ({
        ...current,
        user_id: json.user.id || "",
        admin_name: current.admin_name || json.user.name || "",
        phone: current.phone || json.user.phone || "",
        email: current.email || json.user.email || "",
      }));
      setMessage(`Auth user found: ${json.user.email || json.user.phone || json.user.id}`);
    } catch (error: any) {
      Alert.alert("Lookup failed", error.message || "Unable to lookup admin user.");
    } finally {
      setBusy(false);
    }
  }

  async function authorizeAdmin() {
    if (!form.user_id.trim() || !form.admin_name.trim() || !form.phone.trim() || !form.role.trim()) {
      Alert.alert("Missing details", "Auth User ID, Admin Name, Mobile Number and Role are mandatory.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await authenticatedFetch("/api/company/admins", {
        method: "POST",
        body: JSON.stringify({
          user_id: form.user_id.trim(),
          admin_name: form.admin_name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || null,
          role: form.role,
          permissions: {},
          jurisdiction: parseJurisdiction(form.jurisdiction),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to authorize admin.");
      setMessage(`Admin authorized successfully: ${json.admin?.admin_name || form.admin_name} (${json.admin?.admin_id || "Admin ID generated"})`);
      setForm(DEFAULT_FORM);
      await loadAdmins();
    } catch (error: any) {
      Alert.alert("Admin authorization failed", error.message || "Unable to authorize admin.");
    } finally {
      setBusy(false);
    }
  }

  async function updateAdminStatus(admin: any, account_status: "active" | "suspended" | "revoked") {
    const label = account_status === "active" ? "reactivate" : account_status;
    const ok = typeof window !== "undefined" && typeof window.confirm === "function"
      ? window.confirm(`Are you sure you want to ${label} ${admin.admin_name}?`)
      : true;
    if (!ok) return;

    setBusy(true);
    try {
      const response = await authenticatedFetch(`/api/company/admins/${admin.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ account_status }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to update admin status.");
      setMessage(`Admin status updated to ${account_status}.`);
      await loadAdmins();
    } catch (error: any) {
      Alert.alert("Status update failed", error.message || "Unable to update admin status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Company Master CRM" />
      <Text style={styles.heading}>Admin Directory</Text>
      <Text style={styles.subtitle}>Admin Name | Admin ID | Phone | Email | Role | Jurisdiction | Status | Last Login</Text>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Add / Authorize Admin</Text>
        <Text style={styles.helpText}>The person must already have a Supabase Auth account. Search by their registered phone or email, then assign the permitted role.</Text>
        <TextInput style={styles.input} value={form.lookup} onChangeText={(value) => updateForm("lookup", value)} placeholder="Lookup by registered phone or email" />
        <TouchableOpacity style={[styles.secondaryBtn, busy && styles.disabled]} onPress={lookupAuthUser} disabled={busy}>
          <Text style={styles.secondaryText}>Find Auth User</Text>
        </TouchableOpacity>

        <TextInput style={styles.input} value={form.user_id} onChangeText={(value) => updateForm("user_id", value)} placeholder="Supabase Auth User ID" />
        <TextInput style={styles.input} value={form.admin_name} onChangeText={(value) => updateForm("admin_name", value)} placeholder="Admin Name *" />
        <TextInput style={styles.input} value={form.phone} onChangeText={(value) => updateForm("phone", value)} placeholder="Registered Mobile Number *" keyboardType="phone-pad" />
        <TextInput style={styles.input} value={form.email} onChangeText={(value) => updateForm("email", value)} placeholder="Email Address (optional)" keyboardType="email-address" autoCapitalize="none" />

        <Text style={styles.label}>Admin Role *</Text>
        <View style={styles.roleGrid}>
          {ADMIN_ROLES.map((role) => (
            <TouchableOpacity key={role.value} style={[styles.roleChip, form.role === role.value && styles.roleChipSelected]} onPress={() => updateForm("role", role.value)}>
              <Text style={[styles.roleText, form.role === role.value && styles.roleTextSelected]}>{role.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.helpText}>{selectedRole ? ROLE_HELP[selectedRole.value] : ""}</Text>

        <TextInput style={styles.input} value={form.jurisdiction} onChangeText={(value) => updateForm("jurisdiction", value)} placeholder='Jurisdiction, e.g. {"state":"Haryana","city":"Gurugram"} or plain area text' />
        <TouchableOpacity style={[styles.authorizeBtn, busy && styles.disabled]} onPress={authorizeAdmin} disabled={busy}>
          <Text style={styles.authorizeText}>{busy ? "Please wait..." : "Authorize Admin"}</Text>
        </TouchableOpacity>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>

      <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder="Search admin name, ID, phone, email or role" />
      <TouchableOpacity style={styles.searchBtn} onPress={loadAdmins}>
        <Text style={styles.searchText}>Search Admins</Text>
      </TouchableOpacity>
      {admins.map((admin) => (
        <View key={admin.id} style={styles.card}>
          <Text style={styles.name}>{admin.admin_name}</Text>
          <Text style={styles.adminId}>{admin.admin_id}</Text>
          <Text style={styles.meta}>Phone: {admin.phone}</Text>
          <Text style={styles.meta}>Email: {admin.email || "Optional / not provided"}</Text>
          <Text style={styles.meta}>Role: {admin.role}</Text>
          <Text style={styles.meta}>Area/Jurisdiction: {JSON.stringify(admin.jurisdiction || {})}</Text>
          <Text style={styles.meta}>Status: {admin.account_status}</Text>
          <Text style={styles.meta}>Last login: {admin.last_login_at || "Not recorded"}</Text>
          <View style={styles.actionRow}>
            {admin.account_status !== "active" ? (
              <TouchableOpacity style={styles.smallPrimary} onPress={() => updateAdminStatus(admin, "active")}><Text style={styles.smallPrimaryText}>Reactivate</Text></TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.smallWarn} onPress={() => updateAdminStatus(admin, "suspended")}><Text style={styles.smallWarnText}>Suspend</Text></TouchableOpacity>
            )}
            {admin.account_status !== "revoked" ? (
              <TouchableOpacity style={styles.smallDanger} onPress={() => updateAdminStatus(admin, "revoked")}><Text style={styles.smallDangerText}>Revoke</Text></TouchableOpacity>
            ) : null}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40, backgroundColor: "#fff" },
  heading: { fontSize: 24, fontWeight: "900", color: "#111827" },
  subtitle: { color: "#64748b", lineHeight: 20, marginTop: 6, marginBottom: 16 },
  panel: { borderWidth: 1, borderColor: "#bfdbfe", backgroundColor: "#eff6ff", borderRadius: 8, padding: 14, marginBottom: 16 },
  panelTitle: { fontSize: 18, fontWeight: "900", color: "#111827", marginBottom: 6 },
  helpText: { color: "#475569", lineHeight: 20, marginBottom: 10 },
  label: { fontWeight: "900", color: "#111827", marginTop: 6, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: "#fff" },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  roleChip: { borderWidth: 1, borderColor: "#99f6e4", borderRadius: 999, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#fff" },
  roleChipSelected: { backgroundColor: "#0f766e" },
  roleText: { color: "#0f766e", fontWeight: "900" },
  roleTextSelected: { color: "#fff" },
  searchBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14, marginBottom: 14 },
  searchText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  secondaryBtn: { backgroundColor: "#0f766e", borderRadius: 8, padding: 13, marginBottom: 10 },
  secondaryText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  authorizeBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14, marginTop: 2 },
  authorizeText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  disabled: { opacity: 0.55 },
  message: { color: "#065f46", fontWeight: "800", marginTop: 10, lineHeight: 20 },
  card: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 14, marginBottom: 12 },
  name: { fontSize: 16, fontWeight: "900", color: "#111827" },
  adminId: { color: "#1166ff", fontWeight: "900", marginTop: 3 },
  meta: { color: "#334155", marginTop: 3 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  smallPrimary: { backgroundColor: "#0f766e", borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12 },
  smallPrimaryText: { color: "#fff", fontWeight: "900" },
  smallWarn: { backgroundColor: "#fff7ed", borderColor: "#fdba74", borderWidth: 1, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12 },
  smallWarnText: { color: "#9a3412", fontWeight: "900" },
  smallDanger: { backgroundColor: "#fef2f2", borderColor: "#fecaca", borderWidth: 1, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12 },
  smallDangerText: { color: "#991b1b", fontWeight: "900" },
});