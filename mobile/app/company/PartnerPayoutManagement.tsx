import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";

function money(value: any) {
  return `Rs ${Number(value || 0).toFixed(2)}`;
}

export default function PartnerPayoutManagementScreen() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await authenticatedFetch("/api/partner/admin/payouts");
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load Partner payouts.");
      setRows(json.payouts || []);
    } catch (error: any) {
      Alert.alert("Partner payouts", error?.message || "Unable to load Partner payouts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => [row.partner_id, row.partner_name, row.phone, row.city, row.district, row.state, row.payment_status].join(" ").toLowerCase().includes(needle));
  }, [rows, search]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Partner Payouts" />
      <Text style={styles.heading}>Partner Payout Management</Text>
      <Text style={styles.subheading}>Review calculated commission statements, masked payment details and payout status. This ledger does not transfer money automatically.</Text>
      <TextInput style={styles.search} value={search} onChangeText={setSearch} placeholder="Search by partner, phone, city, state or payment status" />
      <TouchableOpacity style={styles.refresh} onPress={load}><Text style={styles.refreshText}>{loading ? "Loading..." : "Refresh Payout Ledger"}</Text></TouchableOpacity>
      {filtered.map((row) => (
        <View key={row.id} style={styles.card}>
          <View style={styles.header}>
            <View>
              <Text style={styles.name}>{row.partner_name}</Text>
              <Text style={styles.meta}>{row.partner_id} | {row.city}, {row.district}, {row.state}</Text>
              <Text style={styles.meta}>{row.phone}</Text>
            </View>
            <Text style={styles.status}>{String(row.payment_status || "pending").replace(/_/g, " ")}</Text>
          </View>
          <View style={styles.grid}>
            <Metric label="Period" value={row.period_month} />
            <Metric label="Payment Method" value={row.payment_method || "-"} />
            <Metric label="Masked Details" value={row.masked_payment_details || "-"} />
            <Metric label="Eligible Vendors" value={String(row.eligible_vendor_count || 0)} />
            <Metric label="Eligible Revenue" value={money(row.eligible_revenue)} />
            <Metric label="Commission Rate" value={`${Number(row.commission_rate || 0).toFixed(2)}%`} />
            <Metric label="Gross Commission" value={money(row.gross_commission)} />
            <Metric label="Deductions/TDS" value={money(Number(row.deductions || 0) + Number(row.tds_tax || 0))} />
            <Metric label="Net Payable" value={money(row.net_payable)} />
            <Metric label="Payment Date" value={row.payment_date || "-"} />
            <Metric label="Reference" value={row.reference_number || "-"} />
          </View>
        </View>
      ))}
      {!filtered.length && !loading ? <Text style={styles.empty}>No Partner payout statements found.</Text> : null}
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { paddingTop: 70, paddingHorizontal: 20, paddingBottom: 50, backgroundColor: "#fff", minHeight: "100%" },
  heading: { fontSize: 26, fontWeight: "900", color: "#111827", marginBottom: 8 },
  subheading: { color: "#475569", lineHeight: 20, marginBottom: 14 },
  search: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: "#fff" },
  refresh: { backgroundColor: "#1166ff", borderRadius: 8, padding: 12, alignItems: "center", marginBottom: 12 },
  refreshText: { color: "#fff", fontWeight: "900" },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 12, backgroundColor: "#fff" },
  header: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  name: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  meta: { color: "#475569", marginTop: 4 },
  status: { color: "#0f766e", fontWeight: "900", textTransform: "capitalize" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  metric: { minWidth: 150, flexGrow: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, backgroundColor: "#f8fafc" },
  metricLabel: { color: "#64748b", marginBottom: 4 },
  metricValue: { color: "#111827", fontWeight: "900" },
  empty: { color: "#64748b", marginTop: 20 },
});