// app/rider/order.tsx
import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import { apiUrl } from "@/lib/backend";

export default function RiderOrderScreen() {
  const params: any = useLocalSearchParams();
  const token = params.token as string;
  const assignmentId = params.assignment_id as string;

  const [tracking, setTracking] = useState(false);
  const [watcher, setWatcher] = useState<Location.LocationSubscription | null>(null);

  async function startTracking() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      alert("GPS permission denied");
      return;
    }

    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 5,
      },
      async (loc) => {
        try {
          await fetch(apiUrl("/api/rider/update-location"), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-rider-token": token,
            },
            body: JSON.stringify({
              assignment_id: assignmentId,
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
            }),
          });
        } catch (err) {
          console.log("update-location error:", err);
        }
      }
    );

    setWatcher(sub);
    setTracking(true);
  }

  function stopTracking() {
    if (watcher) watcher.remove();
    setWatcher(null);
    setTracking(false);
  }

  async function markPicked() {
    await fetch(apiUrl("/api/rider/picked"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rider-token": token,
      },
      body: JSON.stringify({ assignment_id: assignmentId }),
    });
    alert("Marked as picked. Customer will receive tracking SMS.");
  }

  async function markDelivered() {
    await fetch(apiUrl("/api/rider/delivered"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rider-token": token,
      },
      body: JSON.stringify({ assignment_id: assignmentId }),
    });
    stopTracking();
    alert("Order marked as delivered ✅");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Order Actions</Text>
      <Text>Assignment: {assignmentId}</Text>

      {!tracking ? (
        <TouchableOpacity style={styles.btnPrimary} onPress={startTracking}>
          <Text style={styles.btnText}>Start GPS Tracking</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.btnDanger} onPress={stopTracking}>
          <Text style={styles.btnText}>Stop GPS Tracking</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.btnSecondary} onPress={markPicked}>
        <Text style={styles.btnText}>Mark as Picked</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnSuccess} onPress={markDelivered}>
        <Text style={styles.btnText}>Mark as Delivered</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, gap: 15 },
  title: { fontSize: 22, fontWeight: "900", marginBottom: 10 },
  btnPrimary: { backgroundColor: "#007bff", padding: 14, borderRadius: 8 },
  btnSecondary: { backgroundColor: "#f59e0b", padding: 14, borderRadius: 8 },
  btnDanger: { backgroundColor: "#dc2626", padding: 14, borderRadius: 8 },
  btnSuccess: { backgroundColor: "#16a34a", padding: 14, borderRadius: 8 },
  btnText: { color: "white", textAlign: "center", fontWeight: "700" },
});


