import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import BrandHeader from "@/components/BrandHeader";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { setVendorSessionContext, vendorDestinationForStatus } from "@/lib/vendorLoginRouting";

export default function VendorBusinessSelector() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    loadVendors();
  }, [user?.id]);

  async function loadVendors() {
    if (!user?.id) {
      setLoading(false);
      setError("Please login with your vendor mobile number.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const { data, error: queryError } = await supabase
        .from("vendors")
        .select("id, shop_name, vendor_name, owner_name, phone_number, phone, locality, city, category, kyc_status, onboarding_payment_status, lifecycle_status, status, created_at")
        .eq("owner_user_id", user.id)
        .order("created_at", { ascending: false });
      if (queryError) throw queryError;
      setVendors(data || []);
      if (!data?.length) setError("No vendor business is linked with this authenticated account.");
    } catch (err: any) {
      setError(err?.message || "Unable to load your vendor businesses.");
    } finally {
      setLoading(false);
    }
  }

  function openVendor(vendor: any) {
    setVendorSessionContext();
    router.replace(vendorDestinationForStatus(vendor) as any);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrandHeader compact subtitle="Vendor account" />
      <Text style={styles.title}>Select Business / Branch</Text>
      <Text style={styles.muted}>Choose the shop or branch you want to manage.</Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#1667f2" />
          <Text style={styles.muted}>Loading linked vendor businesses...</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {vendors.map((vendor) => (
        <TouchableOpacity key={vendor.id} style={styles.card} onPress={() => openVendor(vendor)}>
          <Text style={styles.cardTitle}>{vendor.shop_name || vendor.vendor_name || "Registered shop"}</Text>
          <Text style={styles.line}>{vendor.owner_name || vendor.vendor_name || "Owner"} | {vendor.phone_number || vendor.phone || "Phone not recorded"}</Text>
          <Text style={styles.line}>{[vendor.locality, vendor.city].filter(Boolean).join(", ") || "Locality not recorded"}</Text>
          <Text style={styles.status}>KYC: {String(vendor.kyc_status || "not_started").replace(/_/g, " ")} | Payment: {String(vendor.onboarding_payment_status || "pending").replace(/_/g, " ")}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "900", color: "#0f172a", marginTop: 12 },
  muted: { color: "#64748b", marginTop: 6, marginBottom: 12 },
  loading: { alignItems: "center", padding: 20 },
  error: { color: "#991b1b", backgroundColor: "#fef2f2", padding: 12, borderRadius: 8, fontWeight: "800", marginVertical: 12 },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: "900", color: "#0f766e", marginBottom: 6 },
  line: { color: "#334155", marginBottom: 4 },
  status: { color: "#1d4ed8", fontWeight: "800", marginTop: 6 },
});
