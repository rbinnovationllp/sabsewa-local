import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { apiUrl } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";
import BrandHeader from "@/components/BrandHeader";
import CrossPlatformMap from "@/components/CrossPlatformMap";

export default function CompanyUnservedAreaLeadsScreen() {
  const { user } = useAuth();
  const [category, setCategory] = useState("");
  const [pincode, setPincode] = useState("");
  const [leads, setLeads] = useState<any[]>([]);
  const [assignment, setAssignment] = useState<Record<string, string>>({});
  const [vendorName, setVendorName] = useState<Record<string, string>>({});
  const [vendorPhone, setVendorPhone] = useState<Record<string, string>>({});

  async function loadLeads() {
    const query = new URLSearchParams();
    if (category.trim()) query.set("category", category.trim());
    if (pincode.trim()) query.set("pincode", pincode.trim());

    const response = await fetch(apiUrl(`/api/company/unserved-area-leads?${query.toString()}`));
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Unable to load leads", json.error || "Please try again.");
      return;
    }
    setLeads(json.leads || []);
  }

  async function assignLead(lead: any) {
    const assignedTo = assignment[lead.id]?.trim() || user?.id;
    if (!assignedTo) {
      Alert.alert("Representative required", "Enter representative user ID.");
      return;
    }

    const response = await fetch(apiUrl(`/api/company/unserved-area-leads/${lead.id}/assign`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigned_to: assignedTo }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Assign failed", json.error || "Unable to assign lead.");
      return;
    }
    await loadLeads();
  }

  async function addVendorContact(lead: any) {
    const name = vendorName[lead.id]?.trim();
    if (!name) {
      Alert.alert("Vendor name required", "Enter the local vendor contacted.");
      return;
    }

    const response = await fetch(apiUrl(`/api/company/unserved-area-leads/${lead.id}/vendor-contact`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendor_name: name,
        phone: vendorPhone[lead.id]?.trim(),
        category: lead.category,
        contact_status: "contacted",
        contacted_by: user?.id,
      }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Contact save failed", json.error || "Unable to save vendor contact.");
      return;
    }
    setVendorName((current) => ({ ...current, [lead.id]: "" }));
    setVendorPhone((current) => ({ ...current, [lead.id]: "" }));
    await loadLeads();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Company Master CRM" />
      <Text style={styles.heading}>Unserved Area Leads</Text>
      <Text style={styles.subtitle}>Locality-wise customer demand for vendor recruitment. Exact customer addresses are not stored here.</Text>

      <TextInput style={styles.input} placeholder="Category" value={category} onChangeText={setCategory} />
      <TextInput style={styles.input} placeholder="PIN code" value={pincode} onChangeText={setPincode} keyboardType="number-pad" />
      <TouchableOpacity style={styles.searchBtn} onPress={loadLeads}>
        <Text style={styles.searchText}>Load Demand Hotspots</Text>
      </TouchableOpacity>

      {leads.some((lead) => lead.lat && lead.lng) ? (
        <CrossPlatformMap
          style={styles.map}
          initialRegion={{
            latitude: Number(leads.find((lead) => lead.lat && lead.lng)?.lat || 28.4595),
            longitude: Number(leads.find((lead) => lead.lat && lead.lng)?.lng || 77.0266),
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          }}
          markers={leads
            .filter((lead) => lead.lat && lead.lng)
            .map((lead) => ({
              id: String(lead.id),
              latitude: Number(lead.lat),
              longitude: Number(lead.lng),
              title: `${lead.category} demand`,
              description: `${lead.customer_count} request(s) near ${lead.locality || lead.pincode || "this area"}`,
            }))}
        />
      ) : null}

      {leads.map((lead) => (
        <View key={lead.id} style={styles.card}>
          <Text style={styles.cardTitle}>{lead.category}</Text>
          <Text style={styles.muted}>{lead.locality || "Locality pending"} | {lead.pincode || "PIN pending"}</Text>
          <Text style={styles.count}>{lead.customer_count} customer request(s)</Text>
          <Text style={styles.muted}>Status: {lead.status}</Text>

          <TextInput
            style={styles.input}
            placeholder="Assign representative user ID"
            value={assignment[lead.id] || ""}
            onChangeText={(text) => setAssignment((current) => ({ ...current, [lead.id]: text }))}
          />
          <TouchableOpacity style={styles.assignBtn} onPress={() => assignLead(lead)}>
            <Text style={styles.btnText}>Assign Lead</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Contacted local vendor name"
            value={vendorName[lead.id] || ""}
            onChangeText={(text) => setVendorName((current) => ({ ...current, [lead.id]: text }))}
          />
          <TextInput
            style={styles.input}
            placeholder="Vendor phone"
            value={vendorPhone[lead.id] || ""}
            onChangeText={(text) => setVendorPhone((current) => ({ ...current, [lead.id]: text }))}
            keyboardType="phone-pad"
          />
          <TouchableOpacity style={styles.contactBtn} onPress={() => addVendorContact(lead)}>
            <Text style={styles.btnText}>Record Vendor Contact</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  heading: { fontSize: 24, fontWeight: "900" },
  subtitle: { color: "#555", lineHeight: 20, marginTop: 6, marginBottom: 16 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, marginBottom: 10 },
  searchBtn: { backgroundColor: "#1166ff", borderRadius: 10, padding: 14, marginBottom: 16 },
  searchText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginBottom: 12 },
  map: { height: 240, borderRadius: 10, marginBottom: 16 },
  cardTitle: { fontSize: 17, fontWeight: "900" },
  muted: { color: "#666", marginTop: 3 },
  count: { color: "#9a3412", fontWeight: "900", marginTop: 8, marginBottom: 8 },
  assignBtn: { backgroundColor: "#0f766e", borderRadius: 8, padding: 12, marginBottom: 10 },
  contactBtn: { backgroundColor: "#9a3412", borderRadius: 8, padding: 12 },
  btnText: { color: "#fff", fontWeight: "900", textAlign: "center" },
});
