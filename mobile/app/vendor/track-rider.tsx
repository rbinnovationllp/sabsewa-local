import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function TrackRiderScreen() {
  const params: any = useLocalSearchParams();
  const orderId = params.order_id;

  const [rider, setRider] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRiderLocation();

    // Subscribe to live updates every 5 seconds
    const interval = setInterval(fetchRiderLocation, 5000);

    return () => clearInterval(interval);
  }, []);

  async function fetchRiderLocation() {
    const { data, error } = await supabase
      .from("delivery_assignments")
      .select("rider_lat, rider_lng, status")
      .eq("order_id", orderId)
      .maybeSingle();

    if (!error && data) {
      setRider(data);
    }

    setLoading(false);
  }

  if (loading || !rider) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="blue" />
        <Text style={{ marginTop: 10 }}>Fetching rider location…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* STATUS TEXT */}
      <View style={styles.statusBar}>
        <Text style={styles.statusText}>
          Rider Status: {rider.status?.toUpperCase()}
        </Text>
      </View>

      {/* MAP */}
      <MapView
        style={{ flex: 1 }}
        initialRegion={{
          latitude: rider.rider_lat || 28.6139,
          longitude: rider.rider_lng || 77.2090,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
      >
        {/* RIDER MARKER */}
        <Marker
          coordinate={{
            latitude: rider.rider_lat,
            longitude: rider.rider_lng,
          }}
          title="Delivery Boy"
          description="Current rider location"
          pinColor="blue"
        />

        {/* CUSTOMER LOCATION */}
        {params.customer_lat && params.customer_lng && (
          <Marker
            coordinate={{
              latitude: Number(params.customer_lat),
              longitude: Number(params.customer_lng),
            }}
            title="Customer"
            description="Delivery destination"
            pinColor="green"
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  statusBar: {
    padding: 10,
    backgroundColor: "#007bff",
  },
  statusText: {
    color: "white",
    fontSize: 16,
    textAlign: "center",
    fontWeight: "700",
  },
});


