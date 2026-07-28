import { StyleSheet, Text, View } from "react-native";

type MapMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  pinColor?: string;
};

type CrossPlatformMapProps = {
  style?: any;
  initialRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  markers: MapMarker[];
};

export default function CrossPlatformMap({
  style,
  initialRegion,
  markers,
}: CrossPlatformMapProps) {
  return (
    <View style={[styles.fallback, style]}>
      <Text style={styles.title}>Map view</Text>
      <Text style={styles.muted}>
        Centre: {initialRegion.latitude.toFixed(5)}, {initialRegion.longitude.toFixed(5)}
      </Text>
      {markers.map((marker) => (
        <View key={marker.id} style={styles.markerRow}>
          <Text style={styles.markerTitle}>{marker.title || "Location"}</Text>
          {marker.description ? <Text style={styles.muted}>{marker.description}</Text> : null}
          <Text style={styles.coords}>
            {marker.latitude.toFixed(5)}, {marker.longitude.toFixed(5)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    minHeight: 220,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f8fafc",
    padding: 14,
    justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "900", color: "#111827", marginBottom: 4 },
  muted: { color: "#4b5563", marginTop: 3 },
  markerRow: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
  markerTitle: { fontWeight: "900", color: "#0f766e" },
  coords: { color: "#111827", fontWeight: "700", marginTop: 3 },
});
