import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

const statuses = ["pending", "under_review", "approved", "rejected"] as const;

export default function PartnerApplicationsScreen() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadApplications() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("partner_applications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setApplications(data || []);
    } catch (error: any) {
      Alert.alert("Partner applications", error?.message || "Unable to load applications.");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase
      .from("partner_applications")
      .update({
        status,
        reviewed_by: user?.id || null,
        reviewed_at: new Date().toISOString(),
      })
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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Partner Applications" />
      <Text style={styles.heading}>Partner Applications</Text>
      <TouchableOpacity style={styles.refreshButton} onPress={loadApplications}>
        <Text style={styles.refreshText}>{loading ? "Loading..." : "Refresh"}</Text>
      </TouchableOpacity>

      {applications.map((application) => (
        <View key={application.id} style={styles.card}>
          <Text style={styles.name}>{application.applicant_name}</Text>
          <Text style={styles.meta}>{application.partner_type} | {application.city}, {application.state}</Text>
          <Text style={styles.meta}>{application.email} | {application.phone}</Text>
          <Text style={styles.body}>Coverage: {application.coverage_area}</Text>
          <Text style={styles.body}>Experience: {application.experience_summary}</Text>
          <Text style={styles.status}>Status: {application.status}</Text>
          <View style={styles.actions}>
            {statuses.map((status) => (
              <TouchableOpacity key={status} style={styles.actionButton} onPress={() => updateStatus(application.id, status)}>
                <Text style={styles.actionText}>{status.replace("_", " ")}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      {!applications.length && !loading ? <Text style={styles.empty}>No partner applications yet.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 70, paddingBottom: 50, paddingHorizontal: 20, backgroundColor: "#fff", minHeight: "100%" },
  heading: { fontSize: 26, fontWeight: "900", color: "#111827", marginBottom: 14 },
  refreshButton: { backgroundColor: "#1166ff", borderRadius: 8, padding: 12, alignItems: "center", marginBottom: 12 },
  refreshText: { color: "#fff", fontWeight: "900" },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 12, backgroundColor: "#fff" },
  name: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  meta: { color: "#475569", marginTop: 4 },
  body: { color: "#374151", marginTop: 8, lineHeight: 19 },
  status: { color: "#0f766e", fontWeight: "900", marginTop: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  actionButton: { borderWidth: 1, borderColor: "#1166ff", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  actionText: { color: "#1166ff", fontWeight: "800", textTransform: "capitalize" },
  empty: { color: "#64748b", marginTop: 20 },
});
