// app/auth/index.tsx

import React, { useEffect } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { useAuth } from "@/providers/AuthProvider";
import { routeUser } from "@/src/utils/roleRouter";

export default function AuthEntryScreen() {
  const router = useRouter();
  const { user, loading, role, roleLoading } = useAuth();

  // Auto-route logged-in users
 
useEffect(() => {
  if (!loading && !roleLoading && user && role) {
    // module can come from:
    // 1. localStorage
    // 2. user metadata
    // 3. last visited screen
    router.replace(routeUser(role, user.user_metadata?.last_module) as any);
  }
}, [loading, roleLoading, user, role, router]);


  const goLogin = () => router.push("/auth/Login");

  const goRegister = (role: string) => {
    if (role === "vendor") {
      router.push("/vendor/register" as any);
      return;
    }

    router.push({
      pathname: "/auth/Register",
      params: { role },
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.heading}>Welcome to SabSewa</Text>
        <Text style={styles.subheading}>
          Choose how you want to use the platform
        </Text>
      </View>

      {/* CUSTOMER */}
      <TouchableOpacity
        style={[styles.roleCard, styles.customerCard]}
        onPress={() => goRegister("customer")}
      >
        <Text style={styles.roleTitle}>Customer</Text>
        <Text style={styles.roleDesc}>
          Order from nearby vendors and track local delivery.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.roleCard, styles.vendorCard]}
        onPress={() => goRegister("vendor")}
      >
        <Text style={styles.roleTitle}>Vendor</Text>
        <Text style={styles.roleDesc}>
          Manage terminals, catalogue, orders, customer credit, and vendor advance balance.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.roleCard, styles.riderCard]}
        onPress={() => goRegister("rider")}
      >
        <Text style={styles.roleTitle}>Rider</Text>
        <Text style={styles.roleDesc}>
          Receive delivery assignments and share live order status.
        </Text>
      </TouchableOpacity>

      {/* LOGIN */}
      <TouchableOpacity style={styles.loginBtn} onPress={goLogin}>
        <Text style={styles.loginText}>Already have an account? Login</Text>
      </TouchableOpacity>

      {/* BACK */}
      <TouchableOpacity style={styles.backBtn} onPress={() => router.push("/")}>
        <Text style={styles.backText}>← Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* -------------------- STYLES -------------------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  wrapper: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 30,
  },
  heading: {
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    color: "#555",
  },

  roleCard: {
    padding: 18,
    borderRadius: 14,
    marginBottom: 16,
  },
  customerCard: {
    backgroundColor: "#e3f2fd",
  },
  vendorCard: {
    backgroundColor: "#e8f5e9",
  },
  riderCard: {
    backgroundColor: "#fff3e0",
  },

  roleTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },
  roleDesc: {
    fontSize: 14,
    color: "#444",
  },

  loginBtn: {
    marginTop: 20,
    alignItems: "center",
  },
  loginText: {
    color: "#2962ff",
    fontWeight: "700",
  },

  backBtn: {
    marginTop: 30,
    alignItems: "center",
  },
  backText: {
    color: "#555",
  },
});
