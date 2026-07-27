import React, { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { captureInventoryWithGemini } from "../api/geminiAgents";

export default function VendorInventoryCaptureScreen() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  async function runDemoCapture() {
    setLoading(true);
    setResult(null);

    // Replace this with Expo ImagePicker output converted to base64.
    const demoBase64 = "replace_with_real_image_base64_from_image_picker";
    const response = await captureInventoryWithGemini({
      imageBase64: demoBase64,
      mimeType: "image/jpeg"
    });

    setResult(response);
    setLoading(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Gemini Inventory Capture</Text>
      <Text style={styles.subtitle}>
        Vendor takes a photo of shelf, invoice, or handwritten list. Gemini extracts draft inventory.
      </Text>

      <TouchableOpacity style={styles.button} onPress={runDemoCapture} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Calling Gemini..." : "Capture Inventory"}</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator style={styles.loader} />}

      {result ? (
        <View style={styles.output}>
          <Text style={styles.outputTitle}>Gemini Result</Text>
          <Text style={styles.code}>{JSON.stringify(result, null, 2)}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14 },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#555", lineHeight: 20 },
  button: { backgroundColor: "#1a73e8", padding: 14, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700" },
  loader: { marginTop: 10 },
  output: { padding: 12, borderWidth: 1, borderColor: "#ddd", borderRadius: 8 },
  outputTitle: { fontWeight: "700", marginBottom: 8 },
  code: { fontFamily: "monospace", fontSize: 12 }
});

