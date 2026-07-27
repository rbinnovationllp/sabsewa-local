import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import LanguageSelector from "@/components/LanguageSelector";
import TranslatedText from "@/components/TranslatedText";
import PolicyTranslationDisclaimer from "@/components/PolicyTranslationDisclaimer";

export default function PrivacyScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <LanguageSelector />

      <PolicyTranslationDisclaimer position="top" />

      <TranslatedText style={styles.title}>
        SabSewa Privacy Policy
      </TranslatedText>

      <TranslatedText style={styles.body}>
        SabSewa respects user privacy and is committed to protecting personal
        information collected on the platform in accordance with applicable
        laws.
      </TranslatedText>

      <TranslatedText style={styles.body}>
        Personal data is collected for verification, service delivery, and
        platform integrity. SabSewa does not sell user data to third parties.
      </TranslatedText>

      {/* More privacy sections will be added here */}

      <PolicyTranslationDisclaimer position="bottom" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    marginTop: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
  },
});
