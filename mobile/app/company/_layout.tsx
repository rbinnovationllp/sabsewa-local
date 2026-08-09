import { Redirect, Slot } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { apiUrl, authenticatedApiHeaders, MASTER_ADMIN_SESSION_STORAGE_KEY } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";

export default function CompanyLayout() {
  const { user, role, loading, roleLoading } = useAuth();
  const [secret, setSecret] = useState("");
  const [checking, setChecking] = useState(true);
  const [verified, setVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMasterAdmin = String(role || "").toLowerCase() === "master_admin";

  useEffect(() => {
    async function checkSession() {
      if (loading || roleLoading || !user || !isMasterAdmin) {
        setChecking(false);
        return;
      }
      try {
        const response = await fetch(apiUrl("/api/admin/master/session"), { headers: await authenticatedApiHeaders() });
        const json = await response.json();
        setVerified(Boolean(response.ok && json?.success));
      } catch {
        setVerified(false);
      } finally {
        setChecking(false);
      }
    }
    checkSession();
  }, [loading, roleLoading, user?.id, isMasterAdmin]);

  async function verifySecret() {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(apiUrl("/api/admin/master/verify-secret"), {
        method: "POST",
        headers: await authenticatedApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ secret }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Master Admin verification failed.");
      if (typeof window !== "undefined") window.sessionStorage.setItem(MASTER_ADMIN_SESSION_STORAGE_KEY, json.master_admin_session.token);
      setSecret("");
      setVerified(true);
    } catch (err: any) {
      setError(err?.message || "Master Admin verification failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || roleLoading || checking) return <View style={styles.centered}><ActivityIndicator /><Text style={styles.muted}>Checking admin access...</Text></View>;
  if (!user) return <Redirect href="/auth/Login" />;
  if (!isMasterAdmin) return <View style={styles.centered}><Text style={styles.title}>Master Admin access required</Text><Text style={styles.muted}>This CRM requires an authenticated Master Admin account.</Text></View>;
  if (!verified) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Master Admin Verification</Text>
        <Text style={styles.muted}>Enter your private Master Admin secret code to unlock the Company CRM.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <TextInput value={secret} onChangeText={setSecret} secureTextEntry placeholder="Master Admin Secret Code" style={styles.input} />
        <TouchableOpacity style={styles.button} onPress={verifySecret} disabled={submitting || !secret.trim()}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify & Open CRM</Text>}
        </TouchableOpacity>
      </View>
    );
  }
  return <Slot />;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#f8fafc" },
  title: { fontSize: 24, fontWeight: "900", color: "#111827", marginBottom: 8, textAlign: "center" },
  muted: { color: "#64748b", textAlign: "center", marginBottom: 14 },
  error: { color: "#991b1b", backgroundColor: "#fef2f2", padding: 10, borderRadius: 8, marginBottom: 10, fontWeight: "800" },
  input: { width: "100%", maxWidth: 440, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, backgroundColor: "#fff", padding: 14, marginBottom: 12 },
  button: { width: "100%", maxWidth: 440, backgroundColor: "#1667f2", borderRadius: 10, padding: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "900" },
});