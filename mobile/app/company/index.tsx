import { ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import BrandHeader from "@/components/BrandHeader";

export default function CompanyCrmHome() {
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Company Master CRM" />
      <Text style={styles.heading}>Company CRM</Text>

      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/VendorDirectory" as any)}>
        <Text style={styles.buttonText}>Vendor Directory</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/WalletDisputes" as any)}>
        <Text style={styles.buttonText}>Wallet Disputes</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/UnservedAreaLeads" as any)}>
        <Text style={styles.buttonText}>Unserved Area Leads</Text>
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
