// app/rider/order.tsx
import { useEffect, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import { apiUrl } from "@/lib/backend";

const PAYMENT_OPTIONS = [
  { key: "cash", label: "Cash collected" },
  { key: "vendor_qr", label: "Vendor UPI/QR shown" },
  { key: "already_paid", label: "Customer says already paid" },
];

export default function RiderOrderScreen() {
  const router = useRouter();
  const params: any = useLocalSearchParams();
  const token = params.token as string;
  const assignmentId = params.assignment_id as string;
  const orderId = params.order_id as string;

  const [tracking, setTracking] = useState(false);
  const [watcher, setWatcher] = useState<Location.LocationSubscription | null>(null);
  const [paymentContext, setPaymentContext] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [creditNotes, setCreditNotes] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadPaymentContext();
    return () => {
      if (watcher) watcher.remove();
    };
  }, [orderId]);

  async function loadPaymentContext() {
    if (!orderId) return;
    try {
      const response = await fetch(apiUrl(`/api/settlement/orders/${orderId}/payment-context`));
      const json = await response.json();
      if (json.success) {
        setPaymentContext(json);
        const total = Number(json.order?.quoted_total_amount || json.order?.total_amount || 0);
        if (total > 0) setCashAmount(String(total.toFixed(2)));
      }
    } catch (err) {
      console.log("payment-context error:", err);
    }
  }

  async function startTracking() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      alert("GPS permission denied");
      return;
    }

    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5 },
      async (loc) => {
        try {
          await fetch(apiUrl("/api/rider/update-location"), {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-rider-token": token },
            body: JSON.stringify({ assignment_id: assignmentId, lat: loc.coords.latitude, lng: loc.coords.longitude }),
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
    const response = await fetch(apiUrl("/api/rider/picked"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-rider-token": token },
      body: JSON.stringify({ assignment_id: assignmentId }),
    });
    const json = await response.json();
    alert(json.success ? "Marked as picked. Customer will receive order tracking." : json.message || "Unable to mark picked.");
  }

  async function reportCashCollected() {
    setBusy(true);
    try {
      const response = await fetch(apiUrl("/api/rider/cash-collected"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-rider-token": token },
        body: JSON.stringify({
          assignment_id: assignmentId,
          amount_collected: cashAmount,
          payment_reference: paymentReference.trim() || null,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || "Unable to report cash collection.");
      await loadPaymentContext();
      alert("Cash collection reported. Vendor must reconcile physical cash handover.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to report cash collection.");
    } finally {
      setBusy(false);
    }
  }

  async function requestCreditApproval() {
    setBusy(true);
    try {
      const response = await fetch(apiUrl("/api/rider/request-credit"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-rider-token": token },
        body: JSON.stringify({ assignment_id: assignmentId, note: creditNotes.trim() || null }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || "Unable to request vendor approval.");
      alert("Credit/Udhaar request sent to vendor for approval.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to request vendor approval.");
    } finally {
      setBusy(false);
    }
  }

  async function markDelivered() {
    setBusy(true);
    try {
      const response = await fetch(apiUrl("/api/rider/delivered"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-rider-token": token },
        body: JSON.stringify({ assignment_id: assignmentId, idempotency_key: `${assignmentId}-${Date.now()}` }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || "Unable to mark delivered.");
      stopTracking();
      alert("Delivery marked as completed.");
      router.replace({ pathname: "/rider", params: { token } });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Unable to mark delivered.");
    } finally {
      setBusy(false);
    }
  }

  const order = paymentContext?.order;
  const vendor = paymentContext?.vendor;
  const qrCode = paymentContext?.qr_code;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Restricted Delivery Terminal</Text>
      <Text style={styles.meta}>Assigned delivery only. Product, KYC, order acceptance and vendor credit decisions remain with the vendor.</Text>

      {order ? (
        <View style={styles.card}>
          <Text style={styles.vendorName}>{vendor?.shop_name || vendor?.vendor_name || "Vendor"}</Text>
          <Text style={styles.meta}>Order #{order.order_number || orderId}</Text>
          <Text style={styles.amount}>Collectable Amount: Rs {Number(order.quoted_total_amount || order.total_amount || 0).toFixed(2)}</Text>
          <Text style={styles.meta}>Payment must be to vendor account/QR or vendor-approved cash collection only.</Text>
        </View>
      ) : null}

      {qrCode?.public_url ? (
        <View style={styles.qrPanel}>
          <Text style={styles.sectionTitle}>{qrCode.label || "Vendor QR Code"}</Text>
          <Image source={{ uri: qrCode.public_url }} style={styles.qrImage} resizeMode="contain" />
          {qrCode.upi_id ? <Text style={styles.meta}>Vendor UPI: {qrCode.upi_id}</Text> : null}
        </View>
      ) : (
        <View style={styles.warningPanel}>
          <Text style={styles.warningTitle}>No vendor QR saved</Text>
          <Text style={styles.warningText}>Do not use personal QR. Collect cash only if the vendor permits it.</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Payment Handling</Text>
      <View style={styles.optionGrid}>
        {PAYMENT_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[styles.optionBtn, paymentMethod === option.key && styles.optionActive]}
            onPress={() => setPaymentMethod(option.key)}
          >
            <Text style={[styles.optionText, paymentMethod === option.key && styles.optionTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {paymentMethod === "cash" ? (
        <>
          <TextInput style={styles.input} value={cashAmount} onChangeText={setCashAmount} keyboardType="decimal-pad" placeholder="Cash amount collected" />
          <TextInput style={styles.input} value={paymentReference} onChangeText={setPaymentReference} placeholder="Cash note / optional reference" />
          <TouchableOpacity style={styles.btnSuccess} onPress={reportCashCollected} disabled={busy}>
            <Text style={styles.btnText}>Report Cash Collected</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {paymentMethod === "already_paid" ? (
        <View style={styles.warningPanel}>
          <Text style={styles.warningText}>Ask the customer to show vendor payment proof. Final payment confirmation remains with the vendor.</Text>
        </View>
      ) : null}

      <TextInput style={styles.input} value={creditNotes} onChangeText={setCreditNotes} placeholder="If customer requests Udhaar, enter note for vendor approval" />
      <TouchableOpacity style={styles.btnSecondary} onPress={requestCreditApproval} disabled={busy}>
        <Text style={styles.btnText}>Request Vendor Credit/Udhaar Approval</Text>
      </TouchableOpacity>

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

      <TouchableOpacity style={styles.btnSuccess} onPress={markDelivered} disabled={busy}>
        <Text style={styles.btnText}>{busy ? "Saving..." : "Mark Delivered"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40, gap: 14, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "900", marginBottom: 4 },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, backgroundColor: "#f9fafb" },
  vendorName: { fontSize: 18, fontWeight: "900", color: "#111827" },
  meta: { color: "#4b5563", marginTop: 4 },
  amount: { fontSize: 20, fontWeight: "900", marginTop: 8, color: "#166534" },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  qrPanel: { borderWidth: 1, borderColor: "#d1fae5", borderRadius: 8, padding: 14, alignItems: "center", backgroundColor: "#ecfdf5" },
  qrImage: { width: 220, height: 220, marginVertical: 10, backgroundColor: "#fff" },
  warningPanel: { borderWidth: 1, borderColor: "#fed7aa", borderRadius: 8, padding: 12, backgroundColor: "#fff7ed" },
  warningTitle: { fontWeight: "900", color: "#9a3412" },
  warningText: { color: "#7c2d12", marginTop: 4 },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionBtn: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#fff" },
  optionActive: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  optionText: { fontWeight: "800", color: "#374151" },
  optionTextActive: { color: "#fff" },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, padding: 12 },
  btnPrimary: { backgroundColor: "#007bff", padding: 14, borderRadius: 8 },
  btnSecondary: { backgroundColor: "#f59e0b", padding: 14, borderRadius: 8 },
  btnDanger: { backgroundColor: "#dc2626", padding: 14, borderRadius: 8 },
  btnSuccess: { backgroundColor: "#16a34a", padding: 14, borderRadius: 8 },
  btnText: { color: "white", textAlign: "center", fontWeight: "700" },
});
