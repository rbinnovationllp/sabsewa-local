import React from "react";
import { Text } from "react-native";

export default function PolicyTranslationDisclaimer(_props: { position?: string }) {
  return (
    <Text style={{ color: "#666", fontSize: 12, lineHeight: 18 }}>
      Translations are provided for convenience. The English version is the reference version.
    </Text>
  );
}
