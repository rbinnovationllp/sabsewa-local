import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity } from "react-native";

export default function Complaint() {
  const [msg, setMsg] = useState("");

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      
      <Text style={styles.heading}>Raise Complaint</Text>
      <Text style={styles.subheading}>Tell us what went wrong</Text>

      <TextInput
        style={styles.input}
        placeholder="Describe your issue..."
        multiline
        value={msg}
        onChangeText={setMsg}
      />

      <TouchableOpacity style={styles.btn}>
        <Text style={styles.btnText}>Submit Complaint</Text>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#fff" },

  heading: { fontSize: 26, fontWeight: "800", color: "#c62828" },
  subheading: { marginBottom: 20 },

  input: {
    backgroundColor: "#f5f5f5",
    padding: 14,
    minHeight: 150,
    borderRadius: 12,
    marginBottom: 20,
  },

  btn: {
    backgroundColor: "#c62828",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
});


