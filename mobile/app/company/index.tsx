import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import BrandHeader from "@/components/BrandHeader";
import { apiUrl } from "@/lib/backend";

export default function CompanyCrmHome() {
  const router = useRouter();
  const [paymentEnvironment, setPaymentEnvironment] = useState<any>(null);

  useEffect(() => {
    fetch(apiUrl("/api/admin/payment-environment"))
      .then((response) => response.json())
      .then((json) => {
        if (json?.success) setPaymentEnvironment(json.payment_environment);
      })
      .catch(() => setPaymentEnvironment(null));
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Company Master CRM" />
      <Text style={styles.heading}>Company CRM</Text>

      {paymentEnvironment ? (
        <View style={[
          styles.environmentBanner,
          paymentEnvironment.live_payments_enabled ? styles.liveBanner : styles.testBanner,
        ]}>
          <Text style={styles.environmentTitle}>{paymentEnvironment.banner}</Text>
          <Text style={styles.environmentText}>{paymentEnvironment.payment_message}</Text>
        </View>
      ) : null}

      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/VendorDirectory" as any)}>
        <Text style={styles.buttonText}>Vendor Directory</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/VendorFeeRules" as any)}>
        <Text style={styles.buttonText}>Vendor Fee Rules</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/Billing" as any)}>
        <Text style={styles.buttonText}>Billing Portal</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/WalletDisputes" as any)}>
        <Text style={styles.buttonText}>Wallet Disputes</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/UnservedAreaLeads" as any)}>
        <Text style={styles.buttonText}>Unserved Area Leads</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/PartnerApplications" as any)}>
        <Text style={styles.buttonText}>Partner Applications</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/DataRecovery" as any)}>
        <Text style={styles.buttonText}>Data Recovery</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 70,
    paddingBottom: 50,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
    minHeight: "100%",
  },
  heading: {
    fontSize: 26,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 18,
  },
  environmentBanner: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  testBanner: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fb923c",
  },
  liveBanner: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#10b981",
  },
  environmentTitle: {
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
  },
  environmentText: {
    color: "#374151",
    lineHeight: 18,
  },
  button: {
    backgroundColor: "#1166ff",
    borderRadius: 8,
    padding: 15,
    marginBottom: 12,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "900",
    textAlign: "center",
  },
});
