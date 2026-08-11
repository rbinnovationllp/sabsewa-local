import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router } from "expo-router";
import StackHeader from "../../components/StackHeader";

export default function AdminEntryScreen() {
  return (
    <View style={styles.screen}>
      <StackHeader title="SabSewa Local" subtitle="Secure Company CRM" backHref="/" />
      <View style={styles.card}>
        <Text style={styles.title}>Company Master CRM</Text>
        <Text style={styles.body}>
          Admin access is protected by Supabase authentication, server-side Master Admin role verification,
          and the Master Admin secret-code gate.
        </Text>
        <TouchableOpacity style={styles.primary} onPress={() => router.push("/auth/Login?role=master_admin&next=/company" as any)}>
          <Text style={styles.primaryText}>Login as Master Admin</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={() => router.push("/company" as any)}>
          <Text style={styles.secondaryText}>Open CRM If Already Logged In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc", padding: 20 },
  card: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    marginTop: 56,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#ffffff",
  },
  title: { fontSize: 26, fontWeight: "900", color: "#0f172a", marginBottom: 10 },
  body: { fontSize: 15, lineHeight: 22, color: "#475569", marginBottom: 20 },
  primary: { backgroundColor: "#0f766e", borderRadius: 8, paddingVertical: 14, alignItems: "center", marginBottom: 12 },
  primaryText: { color: "#ffffff", fontWeight: "900", fontSize: 16 },
  secondary: { borderWidth: 1, borderColor: "#2563eb", borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  secondaryText: { color: "#2563eb", fontWeight: "900", fontSize: 16 },
});
