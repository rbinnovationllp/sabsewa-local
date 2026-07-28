import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

type BrandHeaderProps = {
  subtitle?: string;
  compact?: boolean;
};

export default function BrandHeader({ subtitle, compact = false }: BrandHeaderProps) {
  return (
    <View style={[styles.wrap, compact && styles.compactWrap]}>
      <Image
        source={
          compact
            ? require("@/assets/images/sabsewa-local-symbol.png")
            : require("@/assets/images/sabsewa-local-app-header.png")
        }
        style={compact ? styles.symbol : styles.banner}
        resizeMode="contain"
        accessibilityLabel="SabSewa Local logo"
      />
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "flex-start", marginBottom: 18 },
  compactWrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  banner: { width: "100%", height: 86 },
  symbol: { width: 42, height: 42 },
  subtitle: { color: "#4b5563", fontSize: 14, lineHeight: 20, marginTop: 6 },
});
