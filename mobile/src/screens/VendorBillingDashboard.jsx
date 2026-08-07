import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from "react-native";
import axios from "axios";

export default function VendorBillingDashboard({ vendorId }) {
  const [billingSummary, setBillingSummary] = useState(null);
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    try {
      const res = await axios.get(`https://api.sabsewa.in/api/vendor/billing/${vendorId}`);
      setBillingSummary(res.data.summary);
      setInvoices(res.data.invoices);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Vendor Billing & Tax Portal</Text>
      
      {/* Disclaimer Box */}
      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerText}>
          GST charged by SabSewa Local is shown separately on your tax invoice. If your business is GST registered, you may be eligible to claim Input Tax Credit subject to applicable GST regulations and vendor eligibility.
        </Text>
      </View>

      {/* Unbilled Current Period */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current Unbilled Period</Text>
        <Text style={styles.stat}>Orders Charged: {billingSummary?.unbilled_orders_count || 0}</Text>
        <Text style={styles.stat}>Base Platform Fee: ₹{(billingSummary?.unbilled_base_paise || 0) / 100}</Text>
        <Text style={styles.stat}>Estimated GST (18%): ₹{(billingSummary?.unbilled_gst_paise || 0) / 100}</Text>
        <Text style={styles.totalText}>Total Unbilled: ₹{(billingSummary?.unbilled_total_paise || 0) / 100}</Text>
      </View>

      {/* Billing History */}
      <Text style={styles.sectionTitle}>Invoices & Tax Statements</Text>
      <FlatList
        data={invoices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.invoiceRow}>
            <View>
              <Text style={styles.invNumber}>{item.invoice_number}</Text>
              <Text style={styles.invSub}>Taxable: ₹{item.taxable_value_paise / 100} | GST: ₹{item.total_gst_paise / 100}</Text>
            </View>
            <Text style={item.payment_status === "paid" ? styles.paidTag : styles.unpaidTag}>
              ₹{item.total_invoice_amount_paise / 100} ({item.payment_status.toUpperCase()})
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#F8F9FA" },
  header: { fontSize: 20, fontWeight: "bold", marginBottom: 12 },
  disclaimerBox: { backgroundColor: "#E3F2FD", padding: 12, borderRadius: 8, marginBottom: 16 },
  disclaimerText: { fontSize: 12, color: "#0D47A1" },
  card: { backgroundColor: "#FFF", padding: 16, borderRadius: 8, marginBottom: 16, borderBackWidth: 1, borderColor: "#DDD" },
  cardTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 8 },
  stat: { fontSize: 14, color: "#444" },
  totalText: { fontSize: 16, fontWeight: "bold", color: "#2E7D32", marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", marginBottom: 8 },
  invoiceRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#FFF", padding: 12, borderRadius: 6, marginBottom: 8 },
  invNumber: { fontWeight: "bold", fontSize: 14 },
  invSub: { fontSize: 12, color: "#666" },
  paidTag: { color: "#2E7D32", fontWeight: "bold" },
  unpaidTag: { color: "#C62828", fontWeight: "bold" }
});