import { Redirect, Slot, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { apiUrl, authenticatedApiHeaders, MASTER_ADMIN_SESSION_STORAGE_KEY } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";
import { isAdminRole } from "@/utils/roleRouter";

export default function CompanyLayout() {
  const router = useRouter();
  const { user, role, loading, roleLoading } = useAuth();
  const [secret, setSecret] = useState("");
  const [checking, setChecking] = useState(true);
  const [verified, setVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasAdminRole = isAdminRole(role);

  const handleGoHome = () => {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    } else {
      router.replace("/");
    }
  };

  const handleGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      router.back();
    }
  };

  useEffect(() => {
    async function checkSession() {
      if (loading || roleLoading) return;
      if (!user || !hasAdminRole) {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(MASTER_ADMIN_SESSION_STORAGE_KEY);
        }
        setChecking(false);
        return;
      }
      try {
        const response = await fetch(apiUrl("/api/admin/master/session"), {
          headers: await authenticatedApiHeaders(),
        });
        const json = await response.json();
        setVerified(Boolean(response.ok && json?.success));
      } catch {
        setVerified(false);
      } finally {
        setChecking(false);
      }
    }
    checkSession();
  }, [loading, roleLoading, user?.id, hasAdminRole]);

  async function verifySecret() {
    setError(null);
    setSubmitting(true);
    const entered = secret.trim();

    try {
      const response = await fetch(apiUrl("/api/admin/master/verify-secret"), {
        method: "POST",
        headers: await authenticatedApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ secret: entered }),
      });

      const json = await response.json().catch(() => ({}));
      if (response.ok && json?.success) {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            MASTER_ADMIN_SESSION_STORAGE_KEY,
            json.master_admin_session?.token || "master_admin_session_valid"
          );
        }
        setSecret("");
        setVerified(true);
        return;
      }

      throw new Error(json?.error || "Incorrect Master Admin secret code.");
    } catch (err: any) {
      setError(err?.message || "Verification failed. Please check the secret code.");
    } finally {
      setSubmitting(false);
    }
  }

  const renderHeader = () => (
    <View style={styles.navBar}>
      <TouchableOpacity onPress={handleGoBack} style={styles.navBackBtn}>
        <Text style={styles.navBackText}>←</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleGoHome} style={styles.navHomeBtn}>
        <Text style={styles.navHomeIcon}>🏠</Text>
        <Text style={styles.navHomeText}>Home</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading || roleLoading || checking) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1667f2" />
        <Text style={styles.muted}>Checking admin access...</Text>
      </View>
    );
  }

  if (!user) return <Redirect href="/auth/Login" />;

  if (!hasAdminRole) return <Redirect href="/auth/unauthorized" />;

  if (!verified) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <View style={styles.centered}>
          <Text style={styles.title}>Master Admin Verification</Text>
          <Text style={styles.muted}>
            Enter your private Master Admin secret code to unlock the Company CRM.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextInput
            value={secret}
            onChangeText={setSecret}
            secureTextEntry
            placeholder="Master Admin Secret Code"
            style={styles.input}
            onSubmitEditing={verifySecret}
          />
          <TouchableOpacity
            style={[styles.button, (!secret.trim() || submitting) && styles.buttonDisabled]}
            onPress={verifySecret}
            disabled={submitting || !secret.trim()}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Verify & Open CRM</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return <Slot />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  navBackBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    backgroundColor: "#ffffff",
  },
  navBackText: { fontSize: 16, fontWeight: "700", color: "#334155" },
  navHomeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#059669",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    gap: 6,
  },
  navHomeIcon: { fontSize: 14 },
  navHomeText: { color: "#065f46", fontWeight: "700", fontSize: 14 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 24, fontWeight: "900", color: "#111827", marginBottom: 8, textAlign: "center" },
  muted: { color: "#64748b", textAlign: "center", marginBottom: 14, maxWidth: 440 },
  error: {
    color: "#991b1b",
    backgroundColor: "#fef2f2",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    fontWeight: "800",
    maxWidth: 440,
    width: "100%",
    textAlign: "center",
  },
  input: {
    width: "100%",
    maxWidth: 440,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#fff",
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#1667f2",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
