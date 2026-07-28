import React from "react";
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function CustomerSupport() {
  const supportEmail = "support@sabsewa.in";
  const primaryPhone = "+918450092846";
  const secondaryPhone = "+918178113449";

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.heading}>Help & Support</Text>
      <Text style={styles.subheading}>Get help from the SabSewa Local team</Text>

      <View style={styles.row}>
        <TouchableOpacity style={styles.btn} onPress={() => Linking.openURL(`tel:${primaryPhone}`)}>
          <Text style={styles.btnText}>Call Support</Text>
          <Text style={styles.contactText}>+91 8450092846</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btn}
          onPress={() => Linking.openURL(`https://wa.me/${secondaryPhone.replace("+", "")}`)}
        >
          <Text style={styles.btnText}>WhatsApp</Text>
          <Text style={styles.contactText}>+91 8178113449</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.fullBtn} onPress={() => Linking.openURL(`mailto:${supportEmail}`)}>
        <Text style={styles.btnText}>Email Support</Text>
        <Text style={styles.contactText}>{supportEmail}</Text>
      </TouchableOpacity>

      <View style={styles.faq}>
        <Text style={styles.faqTitle}>FAQs</Text>

        <Text style={styles.q}>Q: My delivery is late?</Text>
        <Text style={styles.a}>A: Track the order in the app and contact support if the status has not updated.</Text>

        <Text style={styles.q}>Q: How do I pay?</Text>
        <Text style={styles.a}>A: Pay the concerned vendor directly using UPI, cash, card, or another method accepted by that vendor. SabSewa Local does not collect order payments for vendors.</Text>

        <Text style={styles.q}>Q: I received the wrong item?</Text>
        <Text style={styles.a}>A: Raise a complaint with your order ID so the SabSewa Local team can review available transaction evidence.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#fff" },
  heading: { fontSize: 24, fontWeight: "800", color: "#2962ff" },
  subheading: { fontSize: 14, color: "#616161", marginBottom: 20 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  btn: {
    backgroundColor: "#e3f2fd",
    padding: 14,
    borderRadius: 12,
    width: "48%",
  },
  btnText: { color: "#1a237e", fontWeight: "700" },
  contactText: { color: "#1a237e", marginTop: 4 },
  fullBtn: {
    backgroundColor: "#bbdefb",
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
  },
  faq: {
    backgroundColor: "#f5f5f5",
    padding: 14,
    borderRadius: 12,
  },
  faqTitle: { fontWeight: "800", fontSize: 16, marginBottom: 8 },
  q: { fontWeight: "700", marginTop: 10 },
  a: { color: "#616161" },
});
