import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiUrl } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";

export default function VendorDeliverySettingsScreen() {
  const params: any = useLocalSearchParams();
  const { user } = useAuth();
  const terminalId = String(params.terminal || "");

  const [settings, setSettings] = useState({
    free_delivery_min_order: "500",
    delivery_fee_below_min: "30",
    minimum_delivery_order_value: "0",
    service_radius_meters: "500",
    estimated_delivery_min_minutes: "30",
    estimated_delivery_max_minutes: "60",
    delivery_available: true,
    pickup_available: true,
    delivery_provider_type: "vendor",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [terminalId]);

  async function loadSettings() {
    if (!terminalId) return;
    const response = await fetch(apiUrl(`/api/vendor/delivery-settings/terminal/${terminalId}`));
    const json = await response.json();
    if (json.success && json.settings) {
      setSettings({
        free_delivery_min_order: String(json.settings.free_delivery_min_order ?? 500),
        delivery_fee_below_min: String(json.settings.delivery_fee_below_min ?? 30),
        minimum_delivery_order_value: String(json.settings.minimum_delivery_order_value ?? 0),
        service_radius_meters: String(json.settings.service_radius_meters ?? 500),
        estimated_delivery_min_minutes: String(json.settings.estimated_delivery_min_minutes ?? 30),
        estimated_delivery_max_minutes: String(json.settings.estimated_delivery_max_minutes ?? 60),
        delivery_available: json.settings.delivery_available !== false,
        pickup_available: Boolean(json.settings.pickup_available),
        delivery_provider_type: json.settings.delivery_provider_type || "vendor",
      });
    }
  }

  function setValue(key: string, value: string | boolean) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings() {
    if (!terminalId) {
      Alert.alert("Terminal required", "Open delivery settings from a terminal.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(apiUrl(`/api/vendor/delivery-settings/terminal/${terminalId}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          actor_user_id: user?.id,
          reason: "Vendor CRM delivery settings update",
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to save settings.");
      Alert.alert("Saved", "Delivery settings have been updated and recorded in the audit log.");
    } catch (error) {
      Alert.alert("Save failed", error instanceof Error ? error.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Delivery Settings</Text>
      <Text style={styles.note}>
        Use a reasonable estimated delivery window. SabSewa Local does not support unsafe countdown delivery promises.
      </Text>

      <Text style={styles.label}>Minimum order for free delivery</Text>
      <TextInput style={styles.input} keyboardType="decimal-pad" value={settings.free_delivery_min_order} onChangeText={(v) => setValue("free_delivery_min_order", v)} />

      <Text style={styles.label}>Delivery fee below that value</Text>
      <TextInput style={styles.input} keyboardType="decimal-pad" value={settings.delivery_fee_below_min} onChangeText={(v) => setValue("delivery_fee_below_min", v)} />

      <Text style={styles.label}>Optional minimum order for delivery acceptance</Text>
      <TextInput style={styles.input} keyboardType="decimal-pad" value={settings.minimum_delivery_order_value} onChangeText={(v) => setValue("minimum_delivery_order_value", v)} />

      <Text style={styles.label}>Service radius in metres</Text>
      <TextInput style={styles.input} keyboardType="number-pad" value={settings.service_radius_meters} onChangeText={(v) => setValue("service_radius_meters", v)} />

      <Text style={styles.label}>Estimated delivery window</Text>
      <View style={styles.row}>
        <TextInput style={[styles.input, styles.half]} keyboardType="number-pad" value={settings.estimated_delivery_min_minutes} onChangeText={(v) => setValue("estimated_delivery_min_minutes", v)} placeholder="Min minutes" />
        <TextInput style={[styles.input, styles.half]} keyboardType="number-pad" value={settings.estimated_delivery_max_minutes} onChangeText={(v) => setValue("estimated_delivery_max_minutes", v)} placeholder="Max minutes" />
      </View>

      <TouchableOpacity style={[styles.toggle, settings.delivery_available && styles.toggleOn]} onPress={() => setValue("delivery_available", !settings.delivery_available)}>
        <Text style={styles.toggleText}>{settings.delivery_available ? "Delivery Available" : "Delivery Paused"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.toggle, settings.pickup_available && styles.toggleOn]} onPress={() => setValue("pickup_available", !settings.pickup_available)}>
        <Text style={styles.toggleText}>{settings.pickup_available ? "Pickup Available" : "Pickup Not Available"}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.saveBtn} onPress={saveSettings} disabled={saving}>
        <Text style={styles.saveText}>{saving ? "Saving..." : "Save Delivery Settings"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 64, paddingBottom: 40 },
  heading: { fontSize: 26, fontWeight: "900", marginBottom: 10 },
  note: { color: "#7c2d12", backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fed7aa", borderRadius: 8, padding: 12, lineHeight: 20, marginBottom: 18 },
  label: { fontWeight: "800", color: "#111827", marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, padding: 12, marginBottom: 14, backgroundColor: "#fff" },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  toggle: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, padding: 13, marginBottom: 10, alignItems: "center" },
  toggleOn: { backgroundColor: "#ecfdf5", borderColor: "#34d399" },
  toggleText: { fontWeight: "900", color: "#064e3b" },
  saveBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 10 },
  saveText: { color: "#fff", fontWeight: "900" },
});
