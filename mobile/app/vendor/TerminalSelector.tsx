import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function TerminalSelector() {
  const params: any = useLocalSearchParams();
  const router = useRouter();

  const terminalId = params.terminal;

  const [terminal, setTerminal] = useState(null);

  useEffect(() => {
    if (terminalId) loadTerminal();
  }, [terminalId]);

  async function loadTerminal() {
    const { data, error } = await supabase
      .from("vendor_terminals")
      .select("*")
      .eq("id", terminalId)
      .single();

    if (!error) setTerminal(data);
  }

  if (!terminal) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading terminal...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <Text style={styles.heading}>Managing:</Text>
      <Text style={styles.terminalName}>{terminal.terminal_name}</Text>
      <Text style={styles.subtitle}>{terminal.address}</Text>

      {/* Actions */}
      <Text style={styles.sectionTitle}>What would you like to do?</Text>

      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: "#007bff" }]}
        onPress={() => router.push(`/vendor/AddItem?terminal=${terminalId}&vendor=${terminal.vendor_id}`)}
      >
        <Text style={styles.btnText}>📦 Add New Item</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: "#28a745" }]}
        onPress={() => router.push(`/vendor/EditItem?terminal=${terminalId}&vendor=${terminal.vendor_id}`)}
      >
        <Text style={styles.btnText}>✏️ Manage Items & Prices</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: "#ff8800" }]}
        onPress={() => router.push(`/vendor/CreditList?terminal=${terminalId}&vendor=${terminal.vendor_id}`)}
      >
        <Text style={styles.btnText}>💳 Customer Credits</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: "#6f42c1" }]}
        onPress={() => router.push(`/vendor/Orders?terminal=${terminalId}&vendor=${terminal.vendor_id}`)}
      >
        <Text style={styles.btnText}>📜 Order Settlements</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.actionBtn, { backgroundColor: "#e63946" }]}
        onPress={() => router.push(`/vendor/EditItem?terminal=${terminalId}&vendor=${terminal.vendor_id}`)}
      >
        <Text style={styles.btnText}>📊 Update Stock</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1, justifyContent: "center", alignItems: "center"
  },
  loadingText: {
    fontSize: 18, opacity: 0.6
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 70,
    paddingBottom: 60,
  },
  heading: {
    fontSize: 22,
    fontWeight: "800",
  },
  terminalName: {
    fontSize: 26,
    fontWeight: "900",
    marginTop: 5,
  },
  subtitle: {
    opacity: 0.7,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 20,
  },
  actionBtn: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 15,
    elevation: 2,
  },
  btnText: {
    color: "#fff",
    textAlign: "center",
    fontSize: 17,
    fontWeight: "800",
  },
});


