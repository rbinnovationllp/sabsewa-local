import MapView, { Marker } from "react-native-maps";

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
    <MapView style={style} initialRegion={initialRegion}>
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
          title={marker.title}
          description={marker.description}
          pinColor={marker.pinColor}
        />
      ))}
    </MapView>
  );
}
