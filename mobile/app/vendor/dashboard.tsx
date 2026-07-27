import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useUser } from "@/contexts/UserContext";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function VendorDashboard() {
  const legacyUser = useUser().user;
  const { user } = useAuth();
  const router = useRouter();

  const [vendor, setVendor] = useState<any>(null);
  const [terminals, setTerminals] = useState<any[]>([]);

  useEffect(() => {
    loadVendor();
  }, [user?.id, legacyUser?.id]);

  async function loadVendor() {
    const userId = user?.id || legacyUser?.id;
    if (!userId) return;

    const { data: vendorData } = await supabase
      .from("vendors")
      .select("*")
      .eq("owner_user_id", userId)
      .single();

    if (!vendorData) return;
    setVendor(vendorData);

    const { data: terminalData } = await supabase
      .from("vendor_terminals")
      .select("*")
      .eq("vendor_id", vendorData.id)
      .order("created_at");

    setTerminals(terminalData || []);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Vendor Dashboard</Text>

      {vendor ? (
        <View style={styles.vendorPanel}>
          <Text style={styles.vendorName}>{vendor.shop_name || vendor.vendor_name || "Vendor"}</Text>
          <Text style={styles.vendorCode}>{vendor.public_vendor_id || "Vendor ID pending"}</Text>
          <Text style={styles.terminalDetails}>
            {vendor.city_code || "UNK"}-{vendor.locality_code || "GEN"}
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Available Terminals</Text>

      {terminals.map((terminal) => (
        <TouchableOpacity
          key={terminal.id}
          style={styles.terminalBox}
          onPress={() => router.push(`/vendor/TerminalSelector?terminal=${terminal.id}`)}
        >
          <Text style={styles.terminalName}>{terminal.terminal_name}</Text>
          <Text style={styles.vendorCode}>{terminal.public_terminal_id || "Terminal ID pending"}</Text>
          <Text style={styles.terminalDetails}>
            City: {terminal.city} | Phone: {terminal.phone}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: "#007bff" }]}
        onPress={() => vendor && router.push(`/vendor/AddItem?vendor=${vendor.id}`)}
      >
        <Text style={styles.btnText}>Add New Item</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: "#0f766e" }]}
        onPress={() => vendor && router.push(`/vendor/GeminiInventory?vendor=${vendor.id}`)}
      >
        <Text style={styles.btnText}>Gemini Inventory Capture</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: "#475569" }]}
        onPress={() => vendor && router.push(`/vendor/StorageUsage?vendor=${vendor.id}`)}
      >
        <Text style={styles.btnText}>Storage Usage</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: "#28a745" }]}
        onPress={() => vendor && router.push(`/vendor/EditItem?vendor=${vendor.id}`)}
      >
        <Text style={styles.btnText}>Manage Items & Prices</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: "#ff8800" }]}
        onPress={() => vendor && router.push(`/vendor/CreditList?vendor=${vendor.id}`)}
      >
        <Text style={styles.btnText}>Customer Credits</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: "#1166ff" }]}
        onPress={() => vendor && router.push(`/vendor/SecurityWallet?vendor=${vendor.id}`)}
      >
        <Text style={styles.btnText}>Vendor Advance Balance</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: "#6f42c1" }]}
        onPress={() => vendor && router.push(`/vendor/Orders?vendor=${vendor.id}`)}
      >
        <Text style={styles.btnText}>Orders</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.btn, { backgroundColor: "#b91c1c" }]}
        onPress={() => vendor && router.push(`/vendor/ExitAndRefund?vendor=${vendor.id}`)}
      >
        <Text style={styles.btnText}>Exit & Refund</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 70,
    paddingBottom: 50,
    paddingHorizontal: 20,
  },
  heading: {
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 15,
  },
  vendorPanel: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    marginBottom: 25,
    backgroundColor: "#f8fafc",
  },
  vendorName: {
    fontSize: 20,
    fontWeight: "700",
  },
  vendorCode: {
    marginTop: 4,
    fontWeight: "900",
    color: "#1166ff",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  terminalBox: {
    padding: 15,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 15,
    backgroundColor: "#f5f5f5",
  },
  terminalName: {
    fontSize: 16,
    fontWeight: "800",
  },
  terminalDetails: {
    opacity: 0.7,
  },
  btn: {
    padding: 15,
    marginTop: 15,
    borderRadius: 10,
  },
  btnText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "800",
    fontSize: 16,
  },
});
