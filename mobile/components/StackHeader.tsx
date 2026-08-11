import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { router, Link } from "expo-router";

// Standardizing interface props for StackHeader component
interface StackHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string; // Route to go back to (optional)
  showBack?: boolean; // explicitly show/hide back button
}

export default function StackHeader({
  title,
  subtitle,
  backHref,
  showBack = true,
}: StackHeaderProps) {
  const handleBack = () => {
    if (backHref) {
      router.push(backHref as any);
    } else {
      router.back();
    }
  };

  const renderBackButton = () => {
    if (!showBack) return null;

    if (backHref) {
      // Using Link component for better semantic routing on web
      return (
        <Link href={backHref as any} asChild>
          <TouchableOpacity style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
        </Link>
      );
    } else {
      // Direct router navigation for default back behavior
      return (
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
      );
    }
  };

  return (
    <View style={styles.header}>
      {renderBackButton()}
      <View style={styles.textContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    width: "100%",
  },
  backButton: {
    padding: 10,
    marginRight: 10,
  },
  backButtonText: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1e293b", // Neutral color
  },
  textContainer: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "900", // Extra bold
    color: "#1e293b",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 2,
  },
});