import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";

export default function CustomerDashboard() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>

      <BrandHeader subtitle="Order nearby products and local services from verified vendors" />

      {/* SERVICE CARDS */}
      <View style={styles.grid}>
        <TouchableOpacity
          style={[styles.card, { backgroundColor: "#2962ff" }]}
          onPress={() => router.push("/customer/discover")}
        >
          <Text style={styles.cardTitle}>Find Vendors</Text>
          <Text style={styles.cardText}>Search within 1 km</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { backgroundColor: "#0f766e" }]}
          onPress={() => router.push("/customer/GeminiOrder")}
        >
          <Text style={styles.cardTitle}>AI Order Helper</Text>
          <Text style={styles.cardText}>Describe what you need</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { backgroundColor: "#ff8f00" }]}
          onPress={() => router.push("/hyperlocal/cart")}
        >
          <Text style={styles.cardTitle}>Cart</Text>
          <Text style={styles.cardText}>Review items and pay</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { backgroundColor: "#2e7d32" }]}
          onPress={() => router.push("/customer/track")}
        >
          <Text style={styles.cardTitle}>Track Order</Text>
          <Text style={styles.cardText}>Follow delivery status</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { backgroundColor: "#512da8" }]}
          onPress={() => router.push("/customer/support")}
        >
          <Text style={styles.cardTitle}>Help & Support</Text>
          <Text style={styles.cardText}>Get Assistance</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.complaintBtn} onPress={() => router.push("/customer/complaint")}>
        <Text style={styles.complaintText}>Raise a Complaint</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.profileBtn} onPress={() => router.push("/customer/profile")}>
        <Text style={styles.profileText}>My Profile</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#ffffff" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },

  card: {
    width: "48%",
    padding: 16,
    borderRadius: 14,
    marginBottom: 15,
  },
  cardTitle: { color: "#fff", fontSize: 18, fontWeight: "800" },
  cardText: { color: "#e3f2fd", marginTop: 5, fontSize: 12 },

  complaintBtn: {
    backgroundColor: "#c62828",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 20,
  },
  complaintText: { color: "#fff", fontWeight: "800" },

  profileBtn: {
    backgroundColor: "#eeeeee",
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 15,
    marginBottom: 50,
  },
  profileText: { color: "#424242", fontWeight: "800" },
});


