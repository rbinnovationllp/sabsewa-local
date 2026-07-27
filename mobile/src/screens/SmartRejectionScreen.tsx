import React, { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { createSmartRejectionMessage } from "../api/geminiAgents";

export default function SmartRejectionScreen() {
  const [reason, setReason] = useState("Milk stock khatam hai aur delivery boy available nahi hai");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<unknown>(null);

  async function generateMessage() {
    setLoading(true);
    setMessage(null);

    const response = await createSmartRejectionMessage({
      orderId: "00000000-0000-0000-0000-000000000000",
      vendorReason: reason,
      customerLanguage: "hi",
      unavailableItems: ["milk"]
    });

    setMessage(response);
    setLoading(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Gemini Smart Rejection</Text>
      <Text style={styles.subtitle}>
        Vendor enters a rough rejection reason. Gemini creates a customer-friendly support message.
      </Text>

      <TextInput
        value={reason}
        onChangeText={setReason}
        multiline
        style={styles.input}
        placeholder="Vendor reason..."
      />

      <TouchableOpacity style={styles.button} onPress={generateMessage} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Calling Gemini..." : "Generate Support Message"}</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator style={styles.loader} />}

      {message ? (
        <View style={styles.output}>
          <Text style={styles.outputTitle}>Customer Message Draft</Text>
          <Text style={styles.code}>{JSON.stringify(message, null, 2)}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14 },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#555", lineHeight: 20 },
  input: { minHeight: 100, borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, textAlignVertical: "top" },
  button: { backgroundColor: "#f29900", padding: 14, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#111", fontWeight: "800" },
  loader: { marginTop: 10 },
  output: { padding: 12, borderWidth: 1, borderColor: "#ddd", borderRadius: 8 },
  outputTitle: { fontWeight: "700", marginBottom: 8 },
  code: { fontFamily: "monospace", fontSize: 12 }
});

