import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";
import { apiUrl } from "@/lib/backend";

function money(value: any) { return `Rs ${Number(value || 0).toFixed(2)}`; }

export default function PartnerDashboardScreen() {
  const [applicationId, setApplicationId] = useState("");
  const [phone, setPhone] = useState("");
  const [statements, setStatements] = useState<any[]>([]);
  const [partner, setPartner] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!applicationId.trim() || !phone.trim()) return Alert.alert("Partner dashboard", "Enter Partner Application ID and mobile number.");
    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/partner/applications/${applicationId.trim()}/commission-statements?phone=${encodeURIComponent(phone.trim())}`));
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load dashboard.");
      setPartner(json.partner);
      setStatements(json.statements || []);
    } catch (error: any) {
      Alert.alert("Partner dashboard", error?.message || "Unable to load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Partner Dashboard" />
      <Text style={styles.heading}>Partner Dashboard</Text>
      <Text style={styles.subheading}>Check referred vendors, eligible earnings and payment history after SabSewa approval.</Text>
      <TextInput style={styles.input} value={applicationId} onChangeText={setApplicationId} placeholder="Partner Application UUID" />
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Registered mobile number" keyboardType="phone-pad" />
      <TouchableOpacity style={styles.button} onPress={load}><Text style={styles.buttonText}>{loading ? "Loading..." : "Load Partner Dashboard"}</Text></TouchableOpacity>
      {partner ? <View style={styles.card}><Text style={styles.name}>{partner.applicant_name}</Text><Text>Status: {partner.status}</Text><Text>Partner ID: {partner.partner_id || "-"}</Text><Text>Referral Code: {partner.referral_code || "-"}</Text></View> : null}
      {statements.map((row) => (
        <View key={row.id} style={styles.card}>
          <Text style={styles.name}>{row.period_month}</Text>
          <Text>Eligible Revenue: {money(row.eligible_revenue)}</Text>
          <Text>Commission Earned: {money(row.gross_commission)}</Text>
          <Text>Net Payable: {money(row.net_payable)}</Text>
          <Text>Status: {String(row.payment_status || "pending").replace(/_/g, " ")}</Text>
          <Text>Review Status: {String(row.review_status || "not_started").replace(/_/g, " ")}</Text>
          <Text>Archive Status: {String(row.archive_status || "active").replace(/_/g, " ")}</Text>
          <Text>Payment Date: {row.payment_date || "-"}</Text>
          <Text>Reference: {row.reference_number || "-"}</Text>
          {row.transaction_detail_archived ? <Text style={styles.notice}>{row.partner_archive_message}</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 70, paddingHorizontal: 20, paddingBottom: 50, backgroundColor: "#fff", minHeight: "100%" },
  heading: { fontSize: 26, fontWeight: "900", color: "#111827", marginBottom: 8 },
  subheading: { color: "#475569", lineHeight: 20, marginBottom: 14 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: "#fff" },
  button: { backgroundColor: "#1166ff", borderRadius: 8, padding: 12, alignItems: "center", marginBottom: 12 },
  buttonText: { color: "#fff", fontWeight: "900" },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 12, backgroundColor: "#fff" },
  name: { fontWeight: "900", fontSize: 18, marginBottom: 6 },
  notice: { marginTop: 8, color: "#92400e", backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 8, padding: 10 },
});
