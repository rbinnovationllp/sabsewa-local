import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";

export default function UnauthorizedScreen() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "700", color: "#c62828", marginBottom: 10 }}>
        Access Denied
      </Text>
      <Text style={{ fontSize: 14, color: "#555", marginBottom: 20 }}>
        Your current role does not allow you to view this screen.
      </Text>

      <TouchableOpacity
        onPress={() => router.push("/")}
        style={{
          backgroundColor: "#1e88e5",
          padding: 14,
          borderRadius: 8,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>Go Back Home</Text>
      </TouchableOpacity>
    </View>
  );
}


