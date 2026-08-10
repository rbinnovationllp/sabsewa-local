import React, { useEffect } from "react";
import { Stack, useRouter, usePathname } from "expo-router";
import { Platform, View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { LanguageProvider, useLanguage } from "@/providers/LanguageProvider";
import AuthProvider, { useAuth } from "@/providers/AuthProvider";
import { UserProvider } from "@/contexts/UserContext";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";

function TopNavigationBar() {
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const { role } = useAuth();

  const isHome = pathname === "/" || pathname === "/index";
  const handleGoHome = () => {
    if (role === "vendor") {
      router.replace("/vendor/dashboard" as any);
    } else if (role === "customer") {
      router.replace("/customer/dashboard" as any);
    } else {
      router.replace("/" as any);
    }
  };

  return (
    <View style={styles.navBar}>
      <View style={styles.navLeft}>
        {!isHome && (
          <TouchableOpacity 
            style={styles.navButton} 
            onPress={() => router.back()}
            accessibilityLabel={t("common.back")}
          >
            <Ionicons name="arrow-back" size={22} color="#0f766e" />
          </TouchableOpacity>
        )}
        <TouchableOpacity 
          style={styles.homeButton} 
          onPress={handleGoHome}
          accessibilityLabel={t("common.home")}
        >
          <Ionicons name="home" size={20} color="#0f766e" />
          <Text style={styles.homeText}>{t("common.home")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <UserProvider>
          <TopNavigationBar />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: Platform.select({
                ios: "default",
                android: "fade_from_bottom",
                default: "fade",
              }),
            }}
          />
          <PwaInstallPrompt />
        </UserProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  navBar: {
    height: 52,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Platform.OS === "android" ? 4 : 0,
    zIndex: 100,
  },
  navLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  navButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },
  homeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#f0fdf4",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  homeText: {
    color: "#0f766e",
    fontWeight: "700",
    fontSize: 14,
  },
});