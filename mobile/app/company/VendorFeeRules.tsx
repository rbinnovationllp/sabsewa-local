import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";

export default function VendorFeeRulesScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [feeRules, setFeeRules] = useState<any[]>([]);

  // Form state
  const [selectedCategory, setSelectedCategory] = useState("");
  const [onboardingFee, setOnboardingFee] = useState("500");
  const [securityDeposit, setSecurityDeposit] = useState("5000");
  const [perOrderCharge, setPerOrderCharge] = useState("10");
  const [taxRate, setTaxRate] = useState("18");

  useEffect(() => {
    loadAdminConfig();
  }, [user?.id]);

  async function loadAdminConfig() {
    setLoading(true);
    try {
      const response = await authenticatedFetch("/api/vendor/onboarding/admin/config");
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Failed to fetch fee configuration.");
      
      setCategories(json.categories || []);
      setFeeRules(json.fee_rules || []);
      if (json.categories?.length > 0) {
        setSelectedCategory(json.categories[0].slug);
      }
    } catch (error) {
      Alert.alert("Admin Config", error instanceof Error ? error.message : "Unable to load configurations.");
    } finally {
      setLoading(false);
    }
  }

  async function saveFeeRule() {
    if (!selectedCategory) {
      Alert.alert("Category Required", "Please select a business category.");
      return;
    }

    setSaving(true);
    try {
      const response = await authenticatedFetch("/api/vendor/onboarding/admin/fee-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_slug: selectedCategory,
          onboarding_fee_amount: Number(onboardingFee),
          security_deposit_amount: Number(securityDeposit),
          per_completed_order_charge: Number(perOrderCharge),
          tax_rate_percent: Number(taxRate),
          currency: "INR",
          actor_user_id: user?.id || null,
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Failed to update fee rule.");

      Alert.alert("Fee Rule Saved", "Category fee rule updated successfully.");
      await loadAdminConfig();
    } catch (error) {
      Alert.alert("Save Error", error instanceof Error ? error.message : "Could not save fee rule.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1166ff" />
        <Text style={styles.muted}>Loading fee rules...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Company Administration" />
      <Text style={styles.heading}>Vendor Fee Rules</Text>

      <View style={styles.panel}>
        <Text style={styles.section}>Update Fee Policy</Text>

        <Text style={styles.label}>Select Category</Text>
        <View style={styles.chipRow}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.slug}
              style={[styles.chip, selectedCategory === cat.slug && styles.chipActive]}
              onPress={() => setSelectedCategory(cat.slug)}
            >
              <Text style={[styles.chipText, selectedCategory === cat.slug && styles.chipTextActive]}>
                {cat.display_name || cat.slug}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Onboarding Fee (Rs)</Text>
        <TextInput
          style={styles.input}
          value={onboardingFee}
          onChangeText={setOnboardingFee}
          keyboardType="numeric"
          placeholder="500"
        />

        <Text style={styles.label}>Security Deposit (Rs)</Text>
        <TextInput
          style={styles.input}
          value={securityDeposit}
          onChangeText={setSecurityDeposit}
          keyboardType="numeric"
          placeholder="5000"
        />

        <Text style={styles.label}>Per Completed Order Charge (Rs)</Text>
        <TextInput
          style={styles.input}
          value={perOrderCharge}
          onChangeText={setPerOrderCharge}
          keyboardType="numeric"
          placeholder="10"
        />

        <Text style={styles.label}>Tax Rate (%)</Text>
        <TextInput
          style={styles.input}
          value={taxRate}
          onChangeText={setTaxRate}
          keyboardType="numeric"
          placeholder="18"
        />

        <TouchableOpacity style={[styles.primaryBtn, saving && styles.disabled]} onPress={saveFeeRule} disabled={saving}>
          <Text style={styles.primaryText}>{saving ? "Saving Rule..." : "Save Category Rule"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>Active Fee Rules</Text>
        {feeRules.length === 0 ? <Text style={styles.muted}>No active fee rules configured.</Text> : null}
        {feeRules.map((rule) => (
          <View key={rule.id || rule.category_slug} style={styles.ruleCard}>
            <Text style={styles.ruleTitle}>{String(rule.category_slug).toUpperCase()}</Text>
            <Text style={styles.muted}>Onboarding Fee: Rs {rule.onboarding_fee_amount}</Text>
            <Text style={styles.muted}>Security Deposit: Rs {rule.security_deposit_amount}</Text>
            <Text style={styles.muted}>Per-Order Charge: Rs {rule.per_completed_order_charge}</Text>
            <Text style={styles.muted}>Tax: {rule.tax_rate_percent}%</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 48, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  heading: { fontSize: 28, fontWeight: "900", color: "#111827", marginBottom: 14 },
  panel: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 14, backgroundColor: "#fff" },
  section: { fontSize: 18, fontWeight: "900", color: "#111827", marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "700", color: "#374151", marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, backgroundColor: "#fff" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 6 },
  chip: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  chipActive: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  chipText: { color: "#374151", fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  primaryBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14, marginTop: 18 },
  primaryText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  ruleCard: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, marginTop: 8, backgroundColor: "#f9fafb" },
  ruleTitle: { fontWeight: "900", color: "#111827", marginBottom: 4 },
  muted: { color: "#6b7280", fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.6 },
});