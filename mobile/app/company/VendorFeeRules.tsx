import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";

interface CategoryItem {
  slug: string;
  display_name?: string;
}

interface FeeRule {
  id?: string;
  category_slug: string;
  onboarding_fee_amount: number;
  security_deposit_amount: number;
  per_completed_order_charge: number;
  tax_rate_percent: number;
}

const CATEGORY_DEFAULT_VALUES: Record<
  string,
  {
    onboardingFee: string;
    securityDeposit: string;
    perOrderCharge: string;
    taxRate: string;
  }
> = {
  vegetables_fruits: {
    onboardingFee: "500",
    securityDeposit: "5000",
    perOrderCharge: "15", // ₹15 for Vegetables & Fruits
    taxRate: "18",
  },
  kirana_general: {
    onboardingFee: "1000",
    securityDeposit: "5000",
    perOrderCharge: "20", // ₹20 for Kirana & General
    taxRate: "18",
  },
  restaurant_pharmacy: {
    onboardingFee: "2000",
    securityDeposit: "5000",
    perOrderCharge: "25", // ₹25 for Restaurant & Pharmacy
    taxRate: "18",
  },
};

export default function VendorFeeRulesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [feeRules, setFeeRules] = useState<FeeRule[]>([]);

  // Form state
  const [selectedCategory, setSelectedCategory] = useState("vegetables_fruits");
  const [onboardingFee, setOnboardingFee] = useState("500");
  const [securityDeposit, setSecurityDeposit] = useState("5000");
  const [perOrderCharge, setPerOrderCharge] = useState("15");
  const [taxRate, setTaxRate] = useState("18");

  useEffect(() => {
    loadAdminConfig();
  }, [user?.id]);

  function populateFormValues(slug: string, existingRules: FeeRule[] = feeRules) {
    const existingRule = existingRules.find((r) => r.category_slug === slug);
    if (existingRule) {
      setOnboardingFee(String(existingRule.onboarding_fee_amount ?? "500"));
      setSecurityDeposit(String(existingRule.security_deposit_amount ?? "5000"));
      setPerOrderCharge(String(existingRule.per_completed_order_charge ?? "15"));
      setTaxRate(String(existingRule.tax_rate_percent ?? "18"));
    } else {
      const defaults = CATEGORY_DEFAULT_VALUES[slug] || {
        onboardingFee: "500",
        securityDeposit: "5000",
        perOrderCharge: "15",
        taxRate: "18",
      };
      setOnboardingFee(defaults.onboardingFee);
      setSecurityDeposit(defaults.securityDeposit);
      setPerOrderCharge(defaults.perOrderCharge);
      setTaxRate(defaults.taxRate);
    }
  }

  function handleSelectCategory(slug: string) {
    setSelectedCategory(slug);
    populateFormValues(slug, feeRules);
  }

  async function loadAdminConfig() {
    setLoading(true);
    try {
      const response = await authenticatedFetch("/api/vendor/onboarding/admin/config");
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Failed to fetch fee configuration.");
      }

      const fetchedCategories: CategoryItem[] = json.categories || [];
      const fetchedFeeRules: FeeRule[] = json.fee_rules || [];

      setCategories(fetchedCategories);
      setFeeRules(fetchedFeeRules);

      const initialCategory = fetchedCategories.length > 0 ? fetchedCategories[0].slug : "vegetables_fruits";
      setSelectedCategory(initialCategory);
      populateFormValues(initialCategory, fetchedFeeRules);
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
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Failed to update fee rule.");
      }

      Alert.alert("Fee Rule Saved", "Category fee rule updated successfully.");
      await loadAdminConfig();
    } catch (error) {
      Alert.alert("Save Error", error instanceof Error ? error.message : "Could not save fee rule.");
    } finally {
      setSaving(false);
    }
  }

  const handleGoHome = () => {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    } else {
      router.replace("/");
    }
  };

  const handleGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      router.back();
    }
  };

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
      {/* Navigation Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={handleGoBack} style={styles.navBackBtn}>
          <Text style={styles.navBackText}>← Back</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleGoHome} style={styles.navHomeBtn}>
          <Text style={styles.navHomeIcon}>🏠</Text>
          <Text style={styles.navHomeText}>Home</Text>
        </TouchableOpacity>
      </View>

      <BrandHeader compact subtitle="Company Administration" />
      <Text style={styles.heading}>Vendor Fee Rules</Text>

      {/* Fee Policy Form Panel */}
      <View style={styles.panel}>
        <Text style={styles.section}>Update Fee Policy</Text>

        <Text style={styles.label}>Select Category</Text>
        <View style={styles.chipRow}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.slug}
              style={[styles.chip, selectedCategory === cat.slug && styles.chipActive]}
              onPress={() => handleSelectCategory(cat.slug)}
            >
              <Text style={[styles.chipText, selectedCategory === cat.slug && styles.chipTextActive]}>
                {cat.display_name || cat.slug.replace(/_/g, " ").toUpperCase()}
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
          placeholder="15"
        />

        <Text style={styles.label}>Tax Rate (%)</Text>
        <TextInput
          style={styles.input}
          value={taxRate}
          onChangeText={setTaxRate}
          keyboardType="numeric"
          placeholder="18"
        />

        <TouchableOpacity
          style={[styles.primaryBtn, saving && styles.disabled]}
          onPress={saveFeeRule}
          disabled={saving}
        >
          <Text style={styles.primaryText}>
            {saving ? "Saving Rule..." : "Save Category Rule"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Active Rules List */}
      <View style={styles.panel}>
        <Text style={styles.section}>Active Fee Rules</Text>
        {feeRules.length === 0 ? (
          <Text style={styles.muted}>No active fee rules configured.</Text>
        ) : null}
        {feeRules.map((rule) => (
          <View key={rule.id || rule.category_slug} style={styles.ruleCard}>
            <Text style={styles.ruleTitle}>
              {String(rule.category_slug).replace(/_/g, " ").toUpperCase()}
            </Text>
            <Text style={styles.muted}>Onboarding Fee: Rs {rule.onboarding_fee_amount}</Text>
            <Text style={styles.muted}>Security Deposit: Rs {rule.security_deposit_amount}</Text>
            <Text style={styles.ruleHighlight}>
              Per-Order Charge: Rs {rule.per_completed_order_charge}
            </Text>
            <Text style={styles.muted}>Tax: {rule.tax_rate_percent}%</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 48,
    backgroundColor: "#ffffff",
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  navBackBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },
  navBackText: { fontSize: 14, fontWeight: "700", color: "#334155" },
  navHomeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#059669",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    gap: 6,
  },
  navHomeIcon: { fontSize: 14 },
  navHomeText: { color: "#065f46", fontWeight: "700", fontSize: 14 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  heading: { fontSize: 28, fontWeight: "900", color: "#111827", marginBottom: 14 },
  panel: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
    backgroundColor: "#ffffff",
  },
  section: { fontSize: 18, fontWeight: "900", color: "#111827", marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "700", color: "#374151", marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#ffffff",
    fontSize: 15,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 6 },
  chip: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#f8fafc",
  },
  chipActive: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  chipText: { color: "#374151", fontWeight: "700" },
  chipTextActive: { color: "#ffffff" },
  primaryBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14, marginTop: 18 },
  primaryText: { color: "#ffffff", textAlign: "center", fontWeight: "900", fontSize: 16 },
  ruleCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    backgroundColor: "#f9fafb",
  },
  ruleTitle: { fontWeight: "900", color: "#111827", marginBottom: 4 },
  ruleHighlight: { color: "#059669", fontWeight: "800", fontSize: 13, marginVertical: 2 },
  muted: { color: "#6b7280", fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.6 },
});