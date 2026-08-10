import { useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

const statuses = ["pending", "under_review", "approved", "rejected", "active", "suspended", "revoked"] as const;

function fmtMoney(value: any) {
  const n = Number(value || 0);
  return `Rs ${n.toFixed(2)}`;
}

export default function PartnerApplicationsScreen() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  async function loadApplications() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("partner_applications")
        .select("*, partner_referred_vendors(id, referral_status, vendor_id, eligible_revenue_amount, benefit_earned_amount), partner_commission_events(id, status, gross_revenue, net_revenue, commission_amount)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setApplications(data || []);
    } catch (error: any) {
      Alert.alert("Partner applications", error?.message || "Unable to load applications.");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const patch: any = {
      status,
      reviewed_by: user?.id || null,
      reviewed_at: new Date().toISOString(),
    };
    if (status === "approved") patch.approved_at = new Date().toISOString();
    if (status === "active") patch.active_at = new Date().toISOString();
    if (status === "rejected") patch.rejected_at = new Date().toISOString();
    if (status === "suspended") patch.suspended_at = new Date().toISOString();

    const { error } = await supabase
      .from("partner_applications")
      .update(patch)
      .eq("id", id);
    if (error) {
      Alert.alert("Update failed", error.message);
      return;
    }
    loadApplications();
  }

  useEffect(() => {
    loadApplications();
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return applications;
    return applications.filter((application) => {
      const haystack = [
        application.applicant_name,
        application.partner_id,
        application.referral_code,
        application.phone,
        application.email,
        application.city,
        application.district,
        application.state,
        application.status,
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [applications, search]);

  const counts = useMemo(() => {
    return statuses.reduce((acc: Record<string, number>, status) => {
      acc[status] = applications.filter((item) => item.status === status).length;
      return acc;
    }, {});
  }, [applications]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Partner Management" />
      <Text style={styles.heading}>Partner Management</Text>
      <Text style={styles.alertTitle}>Pending Partner Applications: {counts.pending || 0}</Text>
      <Text style={styles.subheading}>
        Review partner applications, activate approved partners, track referral codes, referred vendors, eligible revenue, payable benefits and partner status.
      </Text>

      <View style={styles.counterGrid}>
        {statuses.map((status) => (
          <View key={status} style={styles.counterCard}>
            <Text style={styles.counterValue}>{counts[status] || 0}</Text>
            <Text style={styles.counterLabel}>{status.replace(/_/g, " ")}</Text>
          </View>
        ))}
      </View>

      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name, Partner ID, referral code, phone, city, state or status"
      />

      <TouchableOpacity style={styles.refreshButton} onPress={loadApplications}>
        <Text style={styles.refreshText}>{loading ? "Loading..." : "Refresh Partner Dashboard"}</Text>
      </TouchableOpacity>

      {filtered.map((application) => {
        const referrals = application.partner_referred_vendors || [];
        const commissions = application.partner_commission_events || [];
        const activated = referrals.filter((item: any) => ["approved", "commission_eligible"].includes(item.referral_status)).length;
        const eligibleRevenue = referrals.reduce((sum: number, item: any) => sum + Number(item.eligible_revenue_amount || 0), 0);
        const earned = referrals.reduce((sum: number, item: any) => sum + Number(item.benefit_earned_amount || 0), 0)
          + commissions.reduce((sum: number, item: any) => sum + Number(item.commission_amount || 0), 0);
        const paid = commissions.filter((item: any) => item.status === "paid").reduce((sum: number, item: any) => sum + Number(item.commission_amount || 0), 0);

        return (
          <View key={application.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.name}>{application.applicant_name}</Text>
                <Text style={styles.meta}>{application.partner_type} | {application.city}, {application.district || "-"}, {application.state}</Text>
                <Text style={styles.meta}>{application.phone}{application.email ? ` | ${application.email}` : ""}</Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>{String(application.status || "pending").replace(/_/g, " ")}</Text>
              </View>
            </View>

            <View style={styles.identityBox}>
              <Text style={styles.identityText}>Application ID: {application.application_id || application.partner_id || "Generated after SQL update"}</Text>
              <Text style={styles.identityText}>Partner ID: {application.partner_id || "Generated after SQL update"}</Text>
              <Text style={styles.identityText}>Referral Code: {application.referral_code || "Generated after SQL update"}</Text>
              <Text style={styles.identityText}>Referral Link: {application.referral_link || "Generated after SQL update"}</Text>
              <Text style={styles.identityText}>Benefit %: {Number(application.revenue_share_percent || 10).toFixed(2)}%</Text>
            </View>

            <Text style={styles.body}>Area: {application.proposed_area_of_operation || application.coverage_area}</Text>
            <Text style={styles.body}>Vendor onboarding plan: {application.vendor_onboarding_plan || application.experience_summary}</Text>
            <Text style={styles.body}>Customer awareness plan: {application.customer_awareness_plan || "Not captured in older application."}</Text>

            <View style={styles.metricGrid}>
              <Metric label="Referred Vendors" value={String(referrals.length)} />
              <Metric label="Activated Vendors" value={String(activated)} />
              <Metric label="Eligible Revenue" value={fmtMoney(eligibleRevenue)} />
              <Metric label="Benefit Earned" value={fmtMoney(earned)} />
              <Metric label="Paid" value={fmtMoney(paid)} />
              <Metric label="Pending" value={fmtMoney(Math.max(0, earned - paid))} />
            </View>

            <View style={styles.actions}>
              {statuses.map((status) => (
                <TouchableOpacity key={status} style={styles.actionButton} onPress={() => updateStatus(application.id, status)}>
                  <Text style={styles.actionText}>{status.replace(/_/g, " ")}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}

      {!filtered.length && !loading ? <Text style={styles.empty}>No partner applications found.</Text> : null}
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 70, paddingBottom: 50, paddingHorizontal: 20, backgroundColor: "#fff", minHeight: "100%" },
  heading: { fontSize: 26, fontWeight: "900", color: "#111827", marginBottom: 8 },
  subheading: { color: "#475569", lineHeight: 20, marginBottom: 14 },
  alertTitle: { color: "#9a3412", backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fdba74", borderRadius: 8, padding: 10, fontWeight: "900", marginBottom: 12 },
  counterGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  counterCard: { minWidth: 120, flexGrow: 1, borderWidth: 1, borderColor: "#dbeafe", borderRadius: 8, padding: 10, backgroundColor: "#f8fbff" },
  counterValue: { color: "#1166ff", fontSize: 22, fontWeight: "900" },
  counterLabel: { color: "#334155", fontWeight: "800", textTransform: "capitalize" },
  searchInput: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: "#fff" },
  refreshButton: { backgroundColor: "#1166ff", borderRadius: 8, padding: 12, alignItems: "center", marginBottom: 12 },
  refreshText: { color: "#fff", fontWeight: "900" },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 12, backgroundColor: "#fff" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "flex-start" },
  name: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  meta: { color: "#475569", marginTop: 4 },
  statusPill: { backgroundColor: "#ecfeff", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { color: "#0f766e", fontWeight: "900", textTransform: "capitalize" },
  identityBox: { borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", borderRadius: 8, padding: 10, marginTop: 10 },
  identityText: { color: "#7c2d12", fontWeight: "800", marginBottom: 3 },
  body: { color: "#374151", marginTop: 8, lineHeight: 19 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  metricCard: { minWidth: 130, flexGrow: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, backgroundColor: "#f8fafc" },
  metricValue: { color: "#111827", fontWeight: "900", fontSize: 16 },
  metricLabel: { color: "#64748b", marginTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  actionButton: { borderWidth: 1, borderColor: "#1166ff", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  actionText: { color: "#1166ff", fontWeight: "800", textTransform: "capitalize" },
  empty: { color: "#64748b", marginTop: 20 },
});