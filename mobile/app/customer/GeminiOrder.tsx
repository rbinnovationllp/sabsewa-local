import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { parseOrderWithGemini } from "@/services/gemini";

export default function GeminiOrderScreen() {
  const params: any = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [vendorId, setVendorId] = useState(String(params.vendor || ""));
  const [terminalId, setTerminalId] = useState(String(params.terminal || ""));
  const [orderText, setOrderText] = useState("2 kg atta, 1 packet namak, aur doodh");
  const [languageHint, setLanguageHint] = useState("Hinglish");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function parseOrder() {
    if (!orderText.trim()) {
      Alert.alert("Order required", "Type the customer order first.");
      return;
    }

    setLoading(true);
    try {
      const json = await parseOrderWithGemini({
        orderText,
        languageHint,
        userId: user?.id,
        vendorId: vendorId || undefined,
      });
      if (!json.success) throw new Error(json.error || "Gemini order parsing failed");
      setResult(json);
    } catch (error) {
      Alert.alert("Gemini failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function createCartDraft() {
    if (!vendorId || !terminalId) {
      Alert.alert("Vendor required", "Enter vendor and terminal ids before creating a cart.");
      return;
    }

    const requestedItems = Array.isArray(result?.data?.items) ? result.data.items : [];
    if (requestedItems.length === 0) {
      Alert.alert("No parsed items", "Ask Gemini to create a cart draft first.");
      return;
    }

    const { data, error } = await supabase
      .from("vendor_items")
      .select("id, item_name")
      .eq("vendor_id", vendorId)
      .eq("terminal_id", terminalId)
      .eq("is_available", true)
      .eq("available_today", true)
      .neq("stock_status", "out_of_stock");

    if (error) {
      Alert.alert("Catalogue error", error.message);
      return;
    }

    const cart: Record<string, number> = {};
    requestedItems.forEach((requestItem: any) => {
      const wanted = String(requestItem.name || requestItem.local_name || "").toLowerCase();
      const match = (data || []).find((item: any) =>
        wanted.includes(String(item.item_name || "").toLowerCase()) ||
        String(item.item_name || "").toLowerCase().includes(wanted)
      );
      if (match?.id) cart[match.id] = Number(requestItem.quantity || 1);
    });

    if (Object.keys(cart).length === 0) {
      Alert.alert("Review needed", "No catalogue match was found. Add or map these items first.");
      return;
    }

    router.push({
      pathname: "/hyperlocal/cart" as any,
      params: {
        vendor: vendorId,
        terminal: terminalId,
        cartData: JSON.stringify(cart),
      },
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Gemini Conversational Ordering</Text>
      <Text style={styles.subtitle}>Type a local-language order. Gemini converts it into a cart draft for nearby real-world shops.</Text>

      <TextInput style={styles.input} value={vendorId} onChangeText={setVendorId} placeholder="Vendor id" />
      <TextInput style={styles.input} value={terminalId} onChangeText={setTerminalId} placeholder="Terminal id" />
      <TextInput style={styles.input} value={languageHint} onChangeText={setLanguageHint} placeholder="Language hint" />
      <TextInput style={[styles.input, styles.textArea]} multiline value={orderText} onChangeText={setOrderText} />

      <TouchableOpacity style={styles.primaryBtn} onPress={parseOrder} disabled={loading}>
        <Text style={styles.primaryText}>{loading ? "Calling Gemini..." : "Create Cart Draft"}</Text>
      </TouchableOpacity>

      {result?.data ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Gemini Result</Text>
          {(result.data.items || []).map((item: any, index: number) => (
            <View key={`${item.name}-${index}`} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.local_name || item.name}</Text>
              <Text style={styles.meta}>{item.quantity} {item.unit} | {item.name} | confidence {item.confidence}</Text>
            </View>
          ))}
          <Text style={styles.meta}>Audit log: {result.audit_log_id || "not written"}</Text>
          <TouchableOpacity style={styles.saveBtn} onPress={createCartDraft}>
            <Text style={styles.primaryText}>Open Matched Cart</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  heading: { fontSize: 24, fontWeight: "900" },
  subtitle: { marginTop: 8, marginBottom: 18, color: "#555", lineHeight: 20 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, marginBottom: 12 },
  textArea: { minHeight: 110, textAlignVertical: "top" },
  primaryBtn: { backgroundColor: "#1166ff", padding: 14, borderRadius: 10, alignItems: "center" },
  saveBtn: { backgroundColor: "#16a34a", padding: 14, borderRadius: 10, alignItems: "center", marginTop: 14 },
  primaryText: { color: "#fff", fontWeight: "900" },
  panel: { marginTop: 18, borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14 },
  panelTitle: { fontSize: 18, fontWeight: "900", marginBottom: 10 },
  itemRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#eee" },
  itemName: { fontWeight: "900" },
  meta: { color: "#666", marginTop: 4 },
});
