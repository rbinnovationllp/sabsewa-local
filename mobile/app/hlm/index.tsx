// app/hlm/index.tsx
import { useRouter } from "expo-router";
import React from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import BrandHeader from "@/components/BrandHeader";

export default function SabSewaHLM() {
  const router = useRouter();

  const goHome = () => router.push("/");
  const goAuth = () => router.push("/auth");

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BrandHeader subtitle="Nearby shops and real-world local services" />

      {/* INTRO BOX */}
      <View style={styles.infoCard}>
        <Text style={styles.infoHeading}>What is SabSewa Local?</Text>
        <Text style={styles.infoText}>
          SabSewa Local lets you shop from{" "}
          <Text style={styles.bold}>verified local stores</Text> in your
          neighbourhood — kirana, fruits, vegetables, medical stores,
          tiffin centres, restaurants, dairy shops and more.
        </Text>
        <Text style={styles.infoText}>
          All shops are <Text style={styles.bold}>trusted, registered, and location-verified.</Text>
        </Text>
      </View>

      {/* WHY CHOOSE SECTION */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Why choose SabSewa Local?</Text>

        <View style={styles.pointRow}>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.pointText}>Fast delivery from nearby stores.</Text>
        </View>

        <View style={styles.pointRow}>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.pointText}>Choose only verified vendors.</Text>
        </View>

        <View style={styles.pointRow}>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.pointText}>Support small local shopkeepers.</Text>
        </View>

        <View style={styles.pointRow}>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.pointText}>Credit option (Pay Later) coming soon.</Text>
        </View>
      </View>

      {/* CATEGORIES */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top categories</Text>

        <View style={styles.chipRow}>
          <View style={styles.chip}><Text style={styles.chipText}>Kirana Store</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>Vegetables</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>Fruits</Text></View>
        </View>

        <View style={styles.chipRow}>
          <View style={styles.chip}><Text style={styles.chipText}>Medical Store</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>Bakery</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>Restaurants</Text></View>
        </View>

        <View style={styles.chipRow}>
          <View style={styles.chip}><Text style={styles.chipText}>Dairy</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>Tiffin Service</Text></View>
          <View style={styles.chip}><Text style={styles.chipText}>Snacks Corner</Text></View>
        </View>
      </View>

      {/* CTA CARDS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>How do you want to continue?</Text>

        {/* Customer CTA */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>I am a Customer</Text>
          <Text style={styles.cardText}>
            I want to shop from nearby trusted stores and get home delivery.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={goAuth}>
            <Text style={styles.primaryBtnText}>Login / Register</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.aiBtn} onPress={() => router.push("/customer/GeminiOrder" as any)}>
            <Text style={styles.aiBtnText}>Order with Gemini</Text>
          </TouchableOpacity>
        </View>

        {/* Vendor CTA */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>I am a Shop Owner</Text>
          <Text style={styles.cardText}>
            I want to list my store on SabSewa and get more local customers.
          </Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={goAuth}>
            <Text style={styles.secondaryBtnText}>Register as Vendor</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* BACK BUTTON */}
      <TouchableOpacity style={styles.backBtn} onPress={goHome}>
        <Text style={styles.backBtnText}>← Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ---------------------- STYLES ---------------------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 18, paddingBottom: 30 },

  infoCard: {
    backgroundColor: "#fff3e0",
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  infoHeading: { fontSize: 16, fontWeight: "700", marginBottom: 6, color: "#e65100" },
  infoText: { fontSize: 13, color: "#6d4c41", marginBottom: 4 },
  bold: { fontWeight: "700" },

  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#212121", marginBottom: 8 },

  pointRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 5 },
  dot: { fontSize: 18, marginRight: 6 },
  pointText: { fontSize: 13, color: "#333", flex: 1 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 6 },
  chip: {
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: { fontSize: 12, color: "#444" },

  card: {
    backgroundColor: "#fafafa",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#333" },
  cardText: { fontSize: 13, color: "#666", marginTop: 4, marginBottom: 10 },

  primaryBtn: {
    backgroundColor: "#fb8c00",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  secondaryBtn: {
    backgroundColor: "#ffe0b2",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#e65100", fontWeight: "700", fontSize: 13 },
  aiBtn: {
    backgroundColor: "#1166ff",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  aiBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  backBtn: { marginTop: 12, alignItems: "center" },
  backBtnText: { fontSize: 13, color: "#fb8c00", fontWeight: "600" },
});



