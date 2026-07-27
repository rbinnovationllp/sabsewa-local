import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { captureInventoryWithGemini } from "@/services/gemini";

export default function GeminiInventoryScreen() {
  const params: any = useLocalSearchParams();
  const { user } = useAuth();
  const [vendorId, setVendorId] = useState<string | null>(params.vendor ? String(params.vendor) : null);
  const [terminalId, setTerminalId] = useState<string>(params.terminal ? String(params.terminal) : "");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    resolveVendor();
  }, [user?.id]);

  async function resolveVendor() {
    if (vendorId || !user?.id) return;
    const { data } = await supabase.from("vendors").select("id").eq("owner_user_id", user.id).single();
    if (data?.id) setVendorId(data.id);
  }

  async function captureInventory() {
    if (!vendorId) {
      Alert.alert("Vendor missing", "Vendor profile is required.");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.75,
    });

    if (picked.canceled || !picked.assets[0]?.base64) return;

    setLoading(true);
    try {
      const json = await captureInventoryWithGemini({
        imageBase64: picked.assets[0].base64,
        mimeType: picked.assets[0].mimeType || "image/jpeg",
        vendorId,
        userId: user?.id,
      });
      if (!json.success) throw new Error(json.error || "Gemini capture failed");
      setResult(json);
    } catch (error) {
      Alert.alert("Gemini failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function saveDraftItems() {
    if (!vendorId || !terminalId.trim()) {
      Alert.alert("Terminal required", "Enter or open this screen with a terminal id before saving.");
      return;
    }

    const items = Array.isArray(result?.data?.items) ? result.data.items : [];
    if (items.length === 0) {
      Alert.alert("No items", "Gemini did not return inventory items.");
      return;
    }

    setSaving(true);
    const rows = items.map((item: any) => ({
      vendor_id: vendorId,
      terminal_id: terminalId.trim(),
      item_name: item.name,
      price: Number(item.price || 0),
      is_available: true,
    }));

    const { error } = await supabase.from("vendor_items").insert(rows);
    setSaving(false);

    if (error) {
      Alert.alert("Save failed", error.message);
      return;
    }

    Alert.alert("Saved", "Gemini draft inventory was saved for vendor review.");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Gemini Inventory Capture</Text>
      <Text style={styles.subtitle}>Upload a shelf, invoice, or handwritten list photo. Gemini will extract draft catalogue items for real-world local orders.</Text>

      <Text style={styles.label}>Terminal ID</Text>
      <TextInput style={styles.input} value={terminalId} onChangeText={setTerminalId} placeholder="Terminal id" />

      <TouchableOpacity style={styles.primaryBtn} onPress={captureInventory} disabled={loading}>
        <Text style={styles.primaryText}>{loading ? "Calling Gemini..." : "Upload Photo to Gemini"}</Text>
      </TouchableOpacity>

      {loading ? <ActivityIndicator style={{ marginTop: 20 }} /> : null}

      {result?.data ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Gemini Result</Text>
          {(result.data.items || []).map((item: any, index: number) => (
            <View key={`${item.name}-${index}`} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.meta}>{item.category} | Rs {Number(item.price || 0).toFixed(2)} | confidence {item.confidence}</Text>
            </View>
          ))}
          <Text style={styles.meta}>Audit log: {result.audit_log_id || "not written"}</Text>
          <TouchableOpacity style={styles.saveBtn} onPress={saveDraftItems} disabled={saving}>
            <Text style={styles.primaryText}>{saving ? "Saving..." : "Save Draft Items"}</Text>
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
  label: { fontWeight: "800", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, marginBottom: 14 },
  primaryBtn: { backgroundColor: "#1166ff", padding: 14, borderRadius: 10, alignItems: "center" },
  saveBtn: { backgroundColor: "#16a34a", padding: 14, borderRadius: 10, alignItems: "center", marginTop: 14 },
  primaryText: { color: "#fff", fontWeight: "900" },
  panel: { marginTop: 18, borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14 },
  panelTitle: { fontSize: 18, fontWeight: "900", marginBottom: 10 },
  itemRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#eee" },
  itemName: { fontWeight: "900" },
  meta: { color: "#666", marginTop: 4 },
});
