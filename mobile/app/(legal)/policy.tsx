import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import LanguageSelector from "@/components/LanguageSelector";
import { useLanguage } from "@/providers/LanguageProvider";
import TranslatedText from "@/components/TranslatedText";
import PolicyTranslationDisclaimer from "@/components/PolicyTranslationDisclaimer";

/**
 * NOTE:
 * - English is the source of truth
 * - Translation will be applied in STEP 2
 */

export default function PolicyScreen() {
  const { language } = useLanguage();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Language Selector */}
      <LanguageSelector />

      {/* TOP DISCLAIMER */}
      <PolicyTranslationDisclaimer position="top" />

      {/* POLICY TITLE */}
      <TranslatedText style={styles.title}>
  SabSewa Local Platform Policy
</TranslatedText>

      {/* POLICY CONTENT — ENGLISH MASTER */}
      <TranslatedText style={styles.body}>
  SabSewa Local is a mobile marketplace platform designed to connect customers
  with nearby vendors for real-world local products, delivery, and services.
</TranslatedText>

<TranslatedText style={styles.body}>
  SabSewa Local operates as a trust-based marketplace facilitation platform and is
  not a political, religious, lending, credit, collection, or financial institution.
</TranslatedText>

<TranslatedText style={styles.body}>
  Vendor-approved customer credit is a private commercial arrangement between the
  vendor and customer. The app records vendor-wise limits, purchases, payments,
  balances, due dates, and reminders, but SabSewa Local and Rashi Bhartiya
  Innovation LLP do not finance, guarantee, collect, or recover those dues.
</TranslatedText>

      {/* BOTTOM DISCLAIMER */}
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
