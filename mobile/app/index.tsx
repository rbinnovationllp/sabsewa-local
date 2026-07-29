import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";
import LanguageSelector from "@/components/LanguageSelector";
import { useAuth } from "@/providers/AuthProvider";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.user_metadata?.role;
  const isCustomer = role === "customer";
  const isVendor = role === "vendor";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrandHeader subtitle="Everything Local. One Trusted Marketplace." />

      <View style={styles.hero}>
        <Text style={styles.brandTitle}>SabSewa Local</Text>
        <Text style={styles.tagline}>Everything Local. One Trusted Marketplace.</Text>
        <TextInput style={styles.input} placeholder="Select location or enter PIN/locality" />
        <TextInput style={styles.input} placeholder="Search by shop, category or product" />
        <LanguageSelector />
      </View>

      <View style={styles.categoryRow}>
        {["Grocery", "Vegetables", "Fruits", "Dairy", "Medical", "Tiffin"].map((label) => (
          <TouchableOpacity key={label} style={styles.categoryChip} onPress={() => router.push("/customer/discover" as any)}>
            <Text style={styles.categoryText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{isCustomer ? "Welcome Back" : "Shop from nearby stores"}</Text>
        <Text style={styles.panelText}>Find verified local shops, choose available products, and prepare your cart for review.</Text>
        {isCustomer ? (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/customer/discover" as any)}>
              <Text style={styles.primaryText}>Continue Shopping</Text>
            </TouchableOpacity>
            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/customer/GeminiOrder" as any)}>
                <Text style={styles.secondaryText}>Order Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/customer/GeminiOrder" as any)}>
                <Text style={styles.secondaryText}>Recent Shops</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/customer/track" as any)}>
                <Text style={styles.secondaryText}>My Orders</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/customer/discover" as any)}>
              <Text style={styles.primaryText}>Shop from Nearby Stores</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push({ pathname: "/auth/Register", params: { role: "customer" } } as any)}>
              <Text style={styles.secondaryText}>Register as Customer</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{isVendor ? "Vendor Operations" : "Grow your local shop"}</Text>
        <Text style={styles.panelText}>Manage today’s items, orders, wallet balance and customer requests from one vendor dashboard.</Text>
        {isVendor ? (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/vendor/dashboard" as any)}>
              <Text style={styles.primaryText}>Open Vendor Dashboard</Text>
            </TouchableOpacity>
            <View style={styles.actionGrid}>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/vendor/TodayAvailability" as any)}>
                <Text style={styles.secondaryText}>Manage Today's Items</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/vendor/Orders" as any)}>
                <Text style={styles.secondaryText}>View Orders</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/vendor/SecurityWallet" as any)}>
                <Text style={styles.secondaryText}>Wallet Balance</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.push({ pathname: "/auth/Register", params: { role: "vendor" } } as any)}>
              <Text style={styles.primaryText}>Register Your Shop</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push("/auth/Login" as any)}>
              <Text style={styles.secondaryText}>Vendor Login</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Verified Nearby Vendors</Text>
        <Text style={styles.panelText}>Nearby vendors will appear after you select your location and category. Customers never need to enter vendor or terminal IDs.</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Popular Products</Text>
        <Text style={styles.panelText}>Atta, milk, vegetables, fruits, medicines and tiffin items can be ordered from registered nearby shops when available.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 20, paddingTop: 64, paddingBottom: 40 },
  hero: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
    backgroundColor: "#f8fbff",
  },
  brandTitle: { fontSize: 28, fontWeight: "900", color: "#0f766e" },
  tagline: { color: "#f97316", fontSize: 16, fontWeight: "900", marginTop: 4, marginBottom: 14 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: "#fff" },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  categoryChip: { borderWidth: 1, borderColor: "#99f6e4", backgroundColor: "#ecfeff", borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12 },
  categoryText: { color: "#0f766e", fontWeight: "900" },
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
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primaryButton: { backgroundColor: "#1166ff", borderRadius: 8, padding: 13, alignItems: "center" },
  primaryText: { color: "#fff", fontWeight: "900" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#1166ff",
    borderRadius: 8,
    padding: 13,
    alignItems: "center",
    marginTop: 10,
    flexGrow: 1
  },
  secondaryText: { color: "#1166ff", fontWeight: "900" }
});
