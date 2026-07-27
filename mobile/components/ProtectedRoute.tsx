import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuth } from "@/providers/AuthProvider";

type Props = {
  children?: React.ReactNode;
  allowedRoles?: string[];
  allow?: string[];
  module?: string;
  alert?: unknown;
};

export default function ProtectedRoute({ children }: Props) {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
        <Text>Loading...</Text>
      </View>
    );
  }

  return <>{children}</>;
}
