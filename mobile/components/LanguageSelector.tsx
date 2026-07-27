import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLanguage } from "@/providers/LanguageProvider";
import { SABSEWA_LANGUAGES, type SabSewaLanguageCode } from "@/constants/languages";

export default function LanguageSelector() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <View>
      <Text style={styles.label}>{t("Choose Language")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {SABSEWA_LANGUAGES.map((option) => (
        <TouchableOpacity
          key={option.code}
          style={[styles.button, language === option.code && styles.active]}
          onPress={() => setLanguage(option.code as SabSewaLanguageCode)}
        >
          <Text style={language === option.code ? styles.activeText : styles.text}>{option.nativeName}</Text>
          <Text style={language === option.code ? styles.activeSubText : styles.subText}>{option.englishName}</Text>
        </TouchableOpacity>
      ))}
      </ScrollView>
      <Text style={styles.note}>{t("English is the default language. More Indian languages will be quality-tested and released in phases.")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: "900", marginBottom: 8 },
  row: { flexDirection: "row", gap: 8, paddingRight: 20 },
  button: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minWidth: 96 },
  active: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  text: { color: "#333", fontWeight: "700" },
  activeText: { color: "#fff", fontWeight: "900" },
  subText: { color: "#666", fontSize: 11, marginTop: 2 },
  activeSubText: { color: "#dbeafe", fontSize: 11, marginTop: 2 },
  note: { color: "#666", fontSize: 12, lineHeight: 17, marginTop: 8 },
});
