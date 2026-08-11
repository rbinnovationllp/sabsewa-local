import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, Alert, Platform } from "react-native";
import StackHeader from "@/components/StackHeader";
import { Link, router } from "expo-router";
import { apiUrl } from "@/lib/backend";

export default function AdminLoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Required Fields", "Please enter both admin email and password.");
      return;
    }

    setSubmitting(true);
    try {
      // Add 'role=admin' to ensure only admin accounts can log in here
      const response = await fetch(apiUrl(`/api/auth/login?role=admin`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || "Login failed. Please check credentials.");
      }

      // 1. If successful, the token will be stored by the backend/axios instance
      // 2. Redirect to the core admin panel dashboard
      Alert.alert("Success", "Admin login successful. Redirecting to dashboard...");
      
      // Navigate to the core admin dashboard (ensure this route exists)
      router.replace("/(admin)/dashboard"); 

    } catch (error: any) {
      console.error("Admin Login Error:", error);
      Alert.alert("Login Failed", error?.message || "Invalid credentials or server error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <StackHeader title="SabSewa Local" subtitle="Admin Portal Access" backHref="/" />
      
      <View style={styles.authCard}>
        <View style={styles.headerArea}>
          <Text style={styles.authTitle}>Internal Admin Login</Text>
          <Text style={styles.authSub}>Access requires authorized administrator credentials.</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Administrator Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="admin@sabsewa.in"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Access Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••••••"
          />
        </View>

        <TouchableOpacity 
          style={[styles.loginBtn, submitting && styles.disabledBtn]} 
          onPress={handleLogin} 
          disabled={submitting}
        >
          <Text style={styles.loginBtnText}>{submitting ? "Authenticating..." : "Sign In to Admin Panel"}</Text>
        </TouchableOpacity>

        <Link href="/" asChild>
          <TouchableOpacity style={styles.backLink}>
            <Text style={styles.backLinkText}>← Back to Public Website</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, paddingTop: 40, alignItems: "center" },
  authCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 450,
    marginTop: 40,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  headerArea: { marginBottom: 24, alignItems: "center" },
  authTitle: { fontSize: 24, fontWeight: "900", color: "#1e293b", marginBottom: 6 },
  authSub: { fontSize: 14, color: "#64748b", textAlign: "center", lineHeight: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: "800", color: "#475569", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    backgroundColor: "#f1f5f9",
  },
  loginBtn: {
    backgroundColor: "#0f172a", // Dark admin theme
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  loginBtnText: { color: "#ffffff", fontWeight: "900", fontSize: 16 },
  disabledBtn: { opacity: 0.7 },
  backLink: { marginTop: 20, alignItems: "center" },
  backLinkText: { color: "#0284c7", fontSize: 13, fontWeight: "800" },
});