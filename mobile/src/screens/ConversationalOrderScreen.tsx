import React, { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { parseOrderWithGemini } from "../api/geminiAgents";

export default function ConversationalOrderScreen() {
  const [orderText, setOrderText] = useState("2 kilo tamatar, 1 packet bread aur 1 liter doodh");
  const [loading, setLoading] = useState(false);
  const [cartDraft, setCartDraft] = useState<unknown>(null);

  async function parseOrder() {
    setLoading(true);
    setCartDraft(null);

    const response = await parseOrderWithGemini({
      orderText,
      languageHint: "hi-en"
    });

    setCartDraft(response);
    setLoading(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Gemini Conversational Ordering</Text>
      <Text style={styles.subtitle}>
        Customer types or speaks in local language. Gemini converts it into cart JSON.
      </Text>

      <TextInput
        value={orderText}
        onChangeText={setOrderText}
        multiline
        style={styles.input}
        placeholder="Type your order..."
      />

      <TouchableOpacity style={styles.button} onPress={parseOrder} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? "Calling Gemini..." : "Create Cart Draft"}</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator style={styles.loader} />}

      {cartDraft ? (
        <View style={styles.output}>
          <Text style={styles.outputTitle}>Cart Draft</Text>
          <Text style={styles.code}>{JSON.stringify(cartDraft, null, 2)}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14 },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { color: "#555", lineHeight: 20 },
  input: { minHeight: 110, borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, textAlignVertical: "top" },
  button: { backgroundColor: "#188038", padding: 14, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700" },
  loader: { marginTop: 10 },
  output: { padding: 12, borderWidth: 1, borderColor: "#ddd", borderRadius: 8 },
  outputTitle: { fontWeight: "700", marginBottom: 8 },
  code: { fontFamily: "monospace", fontSize: 12 }
});

