import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function CustomerProfile() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>

      <Text style={styles.heading}>My Profile</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>Rahul Verma</Text>

        <Text style={styles.label}>Phone</Text>
        <Text style={styles.value}>+91 98765 43210</Text>

        <Text style={styles.label}>City</Text>
        <Text style={styles.value}>Gurugram</Text>
      </View>

      <TouchableOpacity style={styles.btn}>
        <Text style={styles.btnText}>Edit Profile</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#fff" },

  heading: { fontSize: 28, fontWeight: "800", color: "#2962ff", marginBottom: 25 },

  card: {
    backgroundColor: "#f5f5f5",
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
  },

  label: { color: "#616161", marginTop: 10 },
  value: { fontSize: 18, fontWeight: "800" },

  btn: {
    backgroundColor: "#2962ff",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
});


