import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { apiUrl } from "@/lib/backend";
import { useCart } from "@/providers/CartContext";

export default function AlternativeVendorsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { reassignToAlternativeVendor } = useCart();
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAlternatives() {
      try {
        const query = new URLSearchParams({
          category: String(params.category || "kirana"),
          locality: String(params.locality || ""),
        });
        const res = await fetch(apiUrl(`/api/discovery/vendors?${query.toString()}`));
        const json = await res.json();
        if (json.success) {
          // Filter out the failed/declined vendor ID
          setVendors((json.vendors || []).filter((v: any) => v.id !== params.failedVendorId));
        }
      } catch (e) {
        console.error("Failed to load alternative vendors", e);
      } finally {
        setLoading(false);
      }
    }
    fetchAlternatives();
  }, []);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.alertBanner}>
        <Text style={styles.alertTitle}>Vendor Currently Unavailable</Text>
        <Text style={styles.alertBody}>
          The vendor was unable to accept your order in time. Your cart items have been saved! Choose another nearby vendor below to place your order immediately.
        </Text>
      </View>

      <Text style={styles.sectionHeader}>Other Nearby Shops with Matching Items</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} size="large" color="#0f766e" />
      ) : (
        vendors.map((vendor) => (
          <View key={vendor.id} style={styles.vendorCard}>
            <View>
              <Text style={styles.shopName}>{vendor.shop_name}</Text>
              <Text style={styles.shopMeta}>{vendor.category} • ⚡ {vendor.distance_label || "Within 1 km"}</Text>
              <Text style={styles.shopMeta}>⭐ {Number(vendor.rating || 4.5).toFixed(1)} • Approx. {vendor.estimated_fulfilment_minutes || 15} mins delivery</Text>
            </View>

            <TouchableOpacity 
              style={styles.selectBtn} 
              onPress={() => reassignToAlternativeVendor(vendor)}
            >
              <Text style={styles.selectBtnText}>Order from this Shop</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  alertBanner: { backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", padding: 14, borderRadius: 10, marginBottom: 16 },
  alertTitle: { color: "#c2410c", fontWeight: "900", fontSize: 16 },
  alertBody: { color: "#9a3412", marginTop: 4, lineHeight: 18, fontSize: 13 },
  sectionHeader: { fontSize: 18, fontWeight: "800", color: "#0f172a", marginBottom: 12 },
  vendorCard: { borderWidth: 1, borderColor: "#e2e8f0", padding: 14, borderRadius: 10, marginBottom: 12, backgroundColor: "#f8fafc" },
  shopName: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  shopMeta: { fontSize: 12, color: "#64748b", marginTop: 2 },
  selectBtn: { backgroundColor: "#0f766e", padding: 12, borderRadius: 8, marginTop: 10, alignItems: "center" },
  selectBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});