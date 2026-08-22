import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiUrl } from "@/lib/backend";

export default function VendorDeliveryTeamScreen() {
  const { vendor, terminal } = useLocalSearchParams<{ vendor?: string; terminal?: string }>();
  const [staff, setStaff] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [rate, setRate] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStaff();
  }, [vendor, terminal]);

  async function loadStaff() {
    if (!vendor || !terminal) return;
    const response = await fetch(apiUrl(`/api/riders?vendor_id=${vendor}&terminal_id=${terminal}`));
    const json = await response.json();
    if (json.success) setStaff(json.riders || []);
  }

  async function createStaff() {
    if (!vendor || !terminal) return Alert.alert("Missing terminal", "Open this page from your vendor dashboard.");
    if (!name.trim() || !phone.trim()) return Alert.alert("Required", "Enter delivery staff name and phone number.");

    setLoading(true);
    try {
      const response = await fetch(apiUrl("/api/riders"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_id: vendor,
          terminal_id: terminal,
          name,
          phone,
          compensation_rate_per_delivery: rate || 0,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || "Unable to add delivery staff.");
      setName("");
      setPhone("");
      setRate("");
      await loadStaff();
      Alert.alert("Delivery staff added", `Share this restricted terminal link only with this staff member:\n${json.rider_link}`);
    } catch (error) {
      Alert.alert("Could not add staff", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function disableStaff(id: string) {
    if (!vendor || !terminal) return;
    const response = await fetch(apiUrl(`/api/riders/${id}/disable`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendor_id: vendor, terminal_id: terminal, reason: "Disabled by vendor dashboard" }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Disable failed", json.message || "Please try again.");
      return;
    }
    await loadStaff();
    Alert.alert("Access disabled", "The old staff link has been revoked and active deliveries require reassignment.");
  }

  async function reconcileCash(id: string) {
    if (!vendor || !terminal) return;
    const response = await fetch(apiUrl(`/api/riders/${id}/reconcile-cash`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendor_id: vendor, terminal_id: terminal }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Reconciliation failed", json.message || "Please try again.");
      return;
    }
    await loadStaff();
    Alert.alert("Cash reconciled", `${json.reconciled_assignments || 0} delivery cash record(s) reconciled.`);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Delivery Team</Text>
      <Text style={styles.note}>
        Add delivery staff for this terminal. Delivery staff can see only assigned deliveries, update location, report cash collected, and mark delivery status. They cannot accept orders, change catalogue, approve credit, access KYC, billing or customer databases.
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Add Delivery Staff</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Staff name" />
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Staff mobile number" keyboardType="phone-pad" />
        <TextInput style={styles.input} value={rate} onChangeText={setRate} placeholder="Optional per-delivery compensation rate" keyboardType="decimal-pad" />
        <Text style={styles.warning}>
          Compensation is configured and paid by the vendor. SabSewa records it only for vendor-side reference.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={createStaff} disabled={loading}>
          <Text style={styles.btnText}>{loading ? "Saving..." : "Add Staff & Generate Restricted Link"}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Current Delivery Staff</Text>
      {staff.length === 0 ? <Text style={styles.note}>No delivery staff added yet.</Text> : null}

      {staff.map((person) => (
        <View key={person.id} style={styles.staffCard}>
          <Text style={styles.staffName}>{person.name || "Delivery Staff"}</Text>
          <Text style={styles.meta}>Phone: {person.phone || "Not provided"}</Text>
          <Text style={styles.meta}>Status: {person.is_active === false ? "Inactive" : person.status || "available"}</Text>
          <Text style={styles.meta}>Assigned: {person.summary?.assigned || 0} | Delivered: {person.summary?.delivered || 0}</Text>
          <Text style={styles.meta}>Cash pending reconciliation: Rs {Number(person.summary?.cash_pending || 0).toFixed(2)}</Text>
          <View style={styles.row}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => reconcileCash(person.id)}>
              <Text style={styles.btnText}>Reconcile Cash</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dangerBtn} onPress={() => disableStaff(person.id)}>
              <Text style={styles.btnText}>Disable Access</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 70, gap: 14, backgroundColor: "#fff" },
  title: { fontSize: 28, fontWeight: "900", color: "#111827" },
  note: { color: "#4b5563", lineHeight: 21 },
  card: { borderWidth: 1, borderColor: "#dbeafe", backgroundColor: "#f8fbff", borderRadius: 8, padding: 14, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, backgroundColor: "#fff" },
  warning: { color: "#9a3412", backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 8, padding: 10 },
  primaryBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14 },
  secondaryBtn: { flex: 1, backgroundColor: "#0f766e", borderRadius: 8, padding: 12 },
  dangerBtn: { flex: 1, backgroundColor: "#dc2626", borderRadius: 8, padding: 12 },
  btnText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  staffCard: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, gap: 4 },
  staffName: { fontSize: 18, fontWeight: "900", color: "#111827" },
  meta: { color: "#374151" },
  row: { flexDirection: "row", gap: 10, marginTop: 8 },
});
