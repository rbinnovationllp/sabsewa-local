import React from "react";
import { Stack } from "expo-router";
import { Platform } from "react-native";

import { LanguageProvider } from "@/providers/LanguageProvider";
import AuthProvider from "@/providers/AuthProvider";
import { UserProvider } from "@/contexts/UserContext";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";

export default function RootLayout() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <UserProvider>
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
