import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { apiUrl } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";

export default function RecognisedDevicesScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<any[]>([]);

  useEffect(() => {
    loadDevices();
  }, [user?.id]);

  async function loadDevices() {
    if (!user?.id) return;
    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/auth/trusted-devices/${user.id}`));
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load devices.");
      setDevices(json.devices || []);
    } catch (error) {
      Alert.alert("Devices unavailable", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function revokeDevice(deviceId: string) {
    if (!user?.id) return;
    try {
      const response = await fetch(apiUrl("/api/auth/revoke-device"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, device_session_id: deviceId }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to revoke device.");
      await loadDevices();
    } catch (error) {
      Alert.alert("Revoke failed", error instanceof Error ? error.message : "Unknown error");
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading recognised devices...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Recognised Devices</Text>
      <Text style={styles.subtitle}>Devices listed here can keep a secure Supabase refresh session. Revoke any device you no longer use.</Text>
      {devices.map((device) => (
        <View key={device.id} style={styles.card}>
          <Text style={styles.name}>{device.device_name || "Device"}</Text>
          <Text style={styles.muted}>{device.platform || "Unknown platform"} · {device.app_version || "App"}</Text>
          <Text style={styles.muted}>Last seen: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "Never"}</Text>
          <Text style={device.revoked_at ? styles.revoked : styles.trusted}>{device.revoked_at ? "Revoked" : "Trusted"}</Text>
          {!device.revoked_at ? (
            <TouchableOpacity style={styles.revokeBtn} onPress={() => revokeDevice(device.id)}>
              <Text style={styles.revokeText}>Sign Out This Device</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  heading: { fontSize: 26, fontWeight: "900" },
  subtitle: { color: "#555", lineHeight: 20, marginTop: 6, marginBottom: 18 },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginBottom: 12 },
  name: { fontWeight: "900", fontSize: 16 },
  muted: { color: "#666", marginTop: 4 },
  trusted: { color: "#16a34a", fontWeight: "900", marginTop: 8 },
  revoked: { color: "#dc2626", fontWeight: "900", marginTop: 8 },
  revokeBtn: { marginTop: 12, backgroundColor: "#dc2626", borderRadius: 8, padding: 10 },
  revokeText: { color: "#fff", textAlign: "center", fontWeight: "900" },
});
