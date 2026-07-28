import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import LanguageSelector from "@/components/LanguageSelector";
import PolicyTranslationDisclaimer from "@/components/PolicyTranslationDisclaimer";
import TranslatedText from "@/components/TranslatedText";
import BrandHeader from "@/components/BrandHeader";

type Section = {
  title?: string;
  body: string;
};

type Props = {
  title: string;
  version: string;
  sections: Section[];
};

export default function LegalDocumentScreen({ title, version, sections }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Legal documents and platform policies" />
      <LanguageSelector />
      <PolicyTranslationDisclaimer position="top" />

      <TranslatedText style={styles.title}>{title}</TranslatedText>
      <Text style={styles.version}>Authoritative English version: {version}</Text>
      <Text style={styles.notice}>
        This production-oriented text must be reviewed by an Indian technology/e-commerce lawyer before publication. Translations are for user convenience; legally reviewed English text remains authoritative unless a reviewed local-language version is issued.
      </Text>

      {sections.map((section, index) => (
        <View key={`${section.title || "section"}-${index}`} style={styles.section}>
          {section.title ? <TranslatedText style={styles.sectionTitle}>{section.title}</TranslatedText> : null}
          <TranslatedText style={styles.body}>{section.body}</TranslatedText>
        </View>
      ))}

      <PolicyTranslationDisclaimer position="bottom" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14 },
  title: { fontSize: 22, fontWeight: "800", marginTop: 8 },
  version: { fontSize: 12, color: "#555", fontWeight: "700" },
  notice: { fontSize: 12, color: "#7a4b00", lineHeight: 18, backgroundColor: "#fff8e6", borderWidth: 1, borderColor: "#f3d38b", borderRadius: 8, padding: 10 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 16, fontWeight: "800" },
  body: { fontSize: 14, lineHeight: 20, opacity: 0.92 },
});
