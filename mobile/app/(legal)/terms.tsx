import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import LanguageSelector from "@/components/LanguageSelector";
import TranslatedText from "@/components/TranslatedText";
import PolicyTranslationDisclaimer from "@/components/PolicyTranslationDisclaimer";

export default function TermsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <LanguageSelector />

      <PolicyTranslationDisclaimer position="top" />

      <TranslatedText style={styles.title}>
        SabSewa Terms & Conditions
      </TranslatedText>

      <TranslatedText style={styles.body}>
        By accessing or using the SabSewa Local mobile app, you agree to comply with
        these Terms and Conditions. Participation on the platform is voluntary.
      </TranslatedText>

      <TranslatedText style={styles.body}>
        SabSewa reserves the right to approve, suspend, or terminate access to
        any user or service provider in accordance with platform policies.
      </TranslatedText>

      <TranslatedText style={styles.body}>
        Customer credit, if offered, is approved and managed only by the individual
        vendor. SabSewa Local and Rashi Bhartiya Innovation LLP do not finance,
        guarantee, collect, recover, or assume responsibility for any customer
        credit amount. Credit recovery, disputes, settlements, and legal actions
        remain solely between the concerned vendor and customer.
      </TranslatedText>

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
