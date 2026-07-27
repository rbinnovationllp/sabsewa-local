import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { supabase } from "@/lib/supabase";
import { useUser } from "@/contexts/UserContext";
import { apiUrl } from "@/lib/backend";

export default function ManageOrder({ order }) {
  const { user } = useUser();
  const [status, setStatus] = useState(order.status);

  async function updateStatus(type) {
    const payload = {
      order_id: order.id,
      vendor_id: user.id,
      new_status: type,
    };

    const res = await fetch(apiUrl("/api/vendor/orders/status"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (json.success) setStatus(type);
    else alert(json.error);
  }

  async function acceptOrder() {
    const payload = {
      order_id: order.id,
      vendor_id: user.id,
      vendor_comment: "Order accepted",
    };

    const res = await fetch(apiUrl("/api/vendor/orders/accept"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (json.success) setStatus("accepted");
    else alert(json.error);
  }

  async function rejectOrder() {
    const payload = {
      order_id: order.id,
      vendor_id: user.id,
      vendor_comment: "Out of stock",
    };

    const res = await fetch(apiUrl("/api/vendor/orders/reject"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (json.success) setStatus("rejected");
    else alert(json.error);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Order #{order.id}</Text>
      <Text>Status: {status}</Text>

      {status === "pending" && (
        <>
          <TouchableOpacity style={styles.btnAccept} onPress={acceptOrder}>
            <Text style={styles.btnText}>Accept</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnReject} onPress={rejectOrder}>
            <Text style={styles.btnText}>Reject</Text>
          </TouchableOpacity>
        </>
      )}

      {status === "accepted" && (
        <>
          <TouchableOpacity style={styles.btnOther} onPress={() => updateStatus("packed")}>
            <Text style={styles.btnText}>Mark Packed</Text>
          </TouchableOpacity>
        </>
      )}

      {status === "packed" && (
        <TouchableOpacity style={styles.btnOther} onPress={() => updateStatus("out_for_delivery")}>
          <Text style={styles.btnText}>Out for Delivery</Text>
        </TouchableOpacity>
      )}

      {status === "out_for_delivery" && (
        <TouchableOpacity style={styles.btnOther} onPress={() => updateStatus("completed")}>
          <Text style={styles.btnText}>Mark Completed</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 10 },
  btnAccept: { backgroundColor: "green", padding: 15, borderRadius: 8, marginVertical: 10 },
  btnReject: { backgroundColor: "red", padding: 15, borderRadius: 8, marginVertical: 10 },
  btnOther: { backgroundColor: "purple", padding: 15, borderRadius: 8, marginVertical: 10 },
  btnText: { color: "white", textAlign: "center", fontSize: 16, fontWeight: "700" },
});


