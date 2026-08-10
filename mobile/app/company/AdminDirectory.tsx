import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";

export default function AdminDirectoryScreen() {
  const [search, setSearch] = useState("");
  const [admins, setAdmins] = useState<any[]>([]);

  useEffect(() => { loadAdmins(); }, []);

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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Company Master CRM" />
      <Text style={styles.heading}>Admin Directory</Text>
      <Text style={styles.subtitle}>Admin Name | Admin ID | Phone | Email | Role | Jurisdiction | Status | Last Login</Text>
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
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40, backgroundColor: "#fff" },
  heading: { fontSize: 24, fontWeight: "900", color: "#111827" },
  subtitle: { color: "#64748b", lineHeight: 20, marginTop: 6, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginBottom: 10 },
  searchBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14, marginBottom: 14 },
  searchText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  card: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 14, marginBottom: 12 },
  name: { fontSize: 16, fontWeight: "900", color: "#111827" },
  adminId: { color: "#1166ff", fontWeight: "900", marginTop: 3 },
  meta: { color: "#334155", marginTop: 3 },
});