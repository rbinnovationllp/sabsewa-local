import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrandHeader subtitle="Nearby shops, fast ordering, and local delivery." />

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Customer</Text>
        <Text style={styles.panelText}>Discover local vendors, use Gemini ordering, build a cart, and track delivery.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/hlm" as any)}>
          <Text style={styles.primaryText}>Start Shopping</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/customer/GeminiOrder" as any)}>
          <Text style={styles.secondaryText}>Order with Gemini</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Vendor</Text>
        <Text style={styles.panelText}>Manage terminals, catalogue, orders, customer credit, and vendor advance balance.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/vendor/dashboard" as any)}>
          <Text style={styles.primaryText}>Vendor Dashboard</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Rider</Text>
        <Text style={styles.panelText}>View assigned deliveries and update delivery progress with location tracking.</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/rider" as any)}>
          <Text style={styles.primaryText}>Rider App</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 20, paddingTop: 64, paddingBottom: 40 },
  panel: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
    backgroundColor: "#fff"
  },
  panelTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  panelText: { color: "#4b5563", marginTop: 6, marginBottom: 14, lineHeight: 20 },
  primaryButton: { backgroundColor: "#1166ff", borderRadius: 8, padding: 13, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "900" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#1166ff",
    borderRadius: 8,
    padding: 13,
    alignItems: "center",
    marginTop: 10
  },
  secondaryText: { color: "#1166ff", fontWeight: "900" }
});
