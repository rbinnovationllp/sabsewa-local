import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLanguage } from "@/providers/LanguageProvider";
import { SABSEWA_LANGUAGES, type SabSewaLanguageCode } from "@/constants/languages";

export default function LanguageSelector() {
  const { language, setLanguage, isLanguageAvailable, t } = useLanguage();

  return (
    <View>
      <Text style={styles.label}>{t("language.choose")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {SABSEWA_LANGUAGES.map((option) => {
        const available = isLanguageAvailable(option.code);
        return (
        <TouchableOpacity
          key={option.code}
          style={[styles.button, !available && styles.disabled, language === option.code && styles.active]}
          disabled={!available}
          accessibilityState={{ disabled: !available, selected: language === option.code }}
          onPress={() => setLanguage(option.code as SabSewaLanguageCode)}
        >
          <Text style={language === option.code ? styles.activeText : styles.text}>{option.nativeName}</Text>
          <Text style={language === option.code ? styles.activeSubText : styles.subText}>{option.englishName}</Text>
          {!available ? <Text style={styles.comingSoon}>{t("language.comingSoon")}</Text> : null}
        </TouchableOpacity>
      );})}
      </ScrollView>
      <Text style={styles.note}>{t("language.selectorNote")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: "900", marginBottom: 8 },
  row: { flexDirection: "row", gap: 8, paddingRight: 20 },
  button: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minWidth: 96 },
  active: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  disabled: { opacity: 0.55, backgroundColor: "#f8fafc" },
  text: { color: "#333", fontWeight: "700" },
  activeText: { color: "#fff", fontWeight: "900" },
  subText: { color: "#666", fontSize: 11, marginTop: 2 },
  activeSubText: { color: "#dbeafe", fontSize: 11, marginTop: 2 },
  comingSoon: { color: "#9a3412", fontSize: 10, fontWeight: "800", marginTop: 4 },
  note: { color: "#666", fontSize: 12, lineHeight: 17, marginTop: 8 },
});
