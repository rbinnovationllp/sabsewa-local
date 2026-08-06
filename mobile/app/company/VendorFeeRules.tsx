import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";

function money(value: unknown) {
  return `Rs ${Number(value || 0).toFixed(2)}`;
}

export default function VendorFeeRulesScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [feeRules, setFeeRules] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("other");
  const [categoryName, setCategoryName] = useState("");
  const [onboardingFee, setOnboardingFee] = useState("");
  const [securityDeposit, setSecurityDeposit] = useState("");
  const [orderCharge, setOrderCharge] = useState("");
  const [taxRate, setTaxRate] = useState("0");

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const response = await authenticatedFetch("/api/vendor/onboarding/admin/config");
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load configuration.");
      setCategories(json.categories || []);
      setFeeRules(json.fee_rules || []);
      const first = json.fee_rules?.[0];
      if (first) selectRule(first.category_slug, json.fee_rules, json.categories);
    } catch (error) {
      Alert.alert("Fee rules", error instanceof Error ? error.message : "Unable to load fee rules.");
    } finally {
      setLoading(false);
    }
  }

  function selectRule(categorySlug: string, rules = feeRules, nextCategories = categories) {
    const rule = rules.find((item) => item.category_slug === categorySlug);
    const category = nextCategories.find((item) => item.slug === categorySlug);
    setSelectedCategory(categorySlug);
    setCategoryName(category?.display_name || categorySlug);
    setOnboardingFee(String(rule?.onboarding_fee_amount ?? ""));
    setSecurityDeposit(String(rule?.security_deposit_amount ?? "5000"));
    setOrderCharge(String(rule?.per_completed_order_charge ?? ""));
    setTaxRate(String(rule?.tax_rate_percent ?? "0"));
  }

  async function saveCategoryAndRule() {
    if (!selectedCategory.trim() || !categoryName.trim()) {
      Alert.alert("Category required", "Enter a category slug and display name.");
      return;
    }
    setSaving(true);
    try {
      const categoryResponse = await authenticatedFetch("/api/vendor/onboarding/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: selectedCategory.trim().toLowerCase(),
          display_name: categoryName.trim(),
          actor_user_id: user?.id || null,
        }),
      });
      const categoryJson = await categoryResponse.json();
      if (!categoryResponse.ok || !categoryJson.success) throw new Error(categoryJson.error || "Category update failed.");

      const ruleResponse = await authenticatedFetch("/api/vendor/onboarding/admin/fee-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_slug: selectedCategory.trim().toLowerCase(),
          onboarding_fee_amount: onboardingFee,
          security_deposit_amount: securityDeposit,
          per_completed_order_charge: orderCharge,
          tax_rate_percent: taxRate,
          onboarding_fee_refundable: false,
          security_deposit_refundable: true,
          actor_user_id: user?.id || null,
        }),
      });
      const ruleJson = await ruleResponse.json();
      if (!ruleResponse.ok || !ruleJson.success) throw new Error(ruleJson.error || "Fee rule update failed.");

      Alert.alert("Saved", "Vendor fee configuration updated.");
      await loadConfig();
    } catch (error) {
      Alert.alert("Fee rules", error instanceof Error ? error.message : "Unable to save fee rules.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading fee configuration...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Company Master CRM" />
      <Text style={styles.heading}>Vendor Fee Rules</Text>

      <View style={styles.ruleGrid}>
        {feeRules.map((rule) => (
          <TouchableOpacity key={rule.id} style={[styles.ruleCard, selectedCategory === rule.category_slug && styles.ruleActive]} onPress={() => selectRule(rule.category_slug)}>
            <Text style={styles.ruleTitle}>{rule.category_slug}</Text>
            <Text style={styles.muted}>Onboarding {money(rule.onboarding_fee_amount)}</Text>
            <Text style={styles.muted}>Deposit {money(rule.security_deposit_amount)}</Text>
            <Text style={styles.muted}>Completed order {money(rule.per_completed_order_charge)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>Edit Category and Active Fee Rule</Text>
        <TextInput style={styles.input} value={selectedCategory} onChangeText={setSelectedCategory} placeholder="category slug" autoCapitalize="none" />
        <TextInput style={styles.input} value={categoryName} onChangeText={setCategoryName} placeholder="display name" />
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.flex]} value={onboardingFee} onChangeText={setOnboardingFee} placeholder="onboarding fee" keyboardType="numeric" />
          <TextInput style={[styles.input, styles.flex]} value={securityDeposit} onChangeText={setSecurityDeposit} placeholder="security deposit" keyboardType="numeric" />
        </View>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.flex]} value={orderCharge} onChangeText={setOrderCharge} placeholder="per completed order" keyboardType="numeric" />
          <TextInput style={[styles.input, styles.flex]} value={taxRate} onChangeText={setTaxRate} placeholder="tax %" keyboardType="numeric" />
        </View>
        <TouchableOpacity style={[styles.saveBtn, saving && styles.disabled]} onPress={saveCategoryAndRule} disabled={saving}>
          <Text style={styles.saveText}>{saving ? "Saving..." : "Save Fee Rule"}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 70, paddingHorizontal: 20, paddingBottom: 48, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  heading: { fontSize: 26, fontWeight: "900", color: "#111827", marginBottom: 14 },
  ruleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  ruleCard: { width: "48%", minWidth: 220, flexGrow: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 12, backgroundColor: "#fff" },
  ruleActive: { borderColor: "#1166ff", backgroundColor: "#eff6ff" },
  ruleTitle: { fontWeight: "900", color: "#111827", marginBottom: 4 },
  muted: { color: "#6b7280", fontSize: 12, lineHeight: 18 },
  panel: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, backgroundColor: "#fff" },
  section: { fontSize: 18, fontWeight: "900", color: "#111827", marginBottom: 10 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  flex: { flex: 1, minWidth: 130 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: "#fff" },
  saveBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14 },
  saveText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  disabled: { opacity: 0.6 },
});
