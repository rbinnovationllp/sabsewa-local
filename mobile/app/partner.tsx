import React, { useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";
import { supabase } from "@/lib/supabase";

const PARTNER_TERMS_VERSION = "partner-program-local-2026-08-10";
const DEFAULT_BENEFIT_PERCENT = 10;

const partnerTypes = [
  "Existing Customer",
  "Non-Customer",
  "Existing Vendor",
  "Non-Vendor",
  "Individual",
  "Local Business Promoter",
  "Marketing or Business Development Professional",
  "Consultant",
  "Organization",
  "NGO",
  "Educational Institution",
  "Other Stakeholder",
];

const vendorExamples = [
  "Vegetable shops",
  "Fruit vendors",
  "Kirana/general stores",
  "Restaurants",
  "Pharmacies",
  "Dairy shops",
  "Bakeries",
  "Tiffin providers",
  "Other supported local businesses",
];

const benefitRules = [
  "Initial partner benefit is 10% of eligible SabSewa Local company revenue attributable to vendors successfully onboarded through the partner.",
  "The percentage is configurable by Master Admin and remains subject to final Partner Program Terms.",
  "GST, statutory taxes, refundable security deposits, refunds, chargebacks, discounts, payment-gateway charges and legally required deductions are excluded.",
  "This is a referral/revenue benefit only. It is not 10% equity, ownership, shareholding, partnership in law, employment, franchise rights or guaranteed income.",
];

export default function PartnerWithUsScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [formOffsetY, setFormOffsetY] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [form, setForm] = useState({
    applicant_name: "",
    partner_type: "Individual",
    organization_name: "",
    phone: "",
    email: "",
    city: "",
    district: "",
    state: "",
    proposed_area_of_operation: "",
    expected_vendor_reach: "",
    experience_summary: "",
    vendor_onboarding_plan: "",
    customer_awareness_plan: "",
    referral_source: "",
  });

  function setValue(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitApplication() {
    const required = [
      form.applicant_name,
      form.partner_type,
      form.phone,
      form.city,
      form.district,
      form.state,
      form.proposed_area_of_operation,
      form.experience_summary,
      form.vendor_onboarding_plan,
      form.customer_awareness_plan,
    ];
    if (required.some((value) => !String(value || "").trim())) {
      Alert.alert("Partner application", "Please fill all mandatory fields before submitting.");
      return;
    }
    if (!accepted) {
      Alert.alert("Terms acceptance required", "Please accept the Partner Program Terms before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const acceptanceSummary =
        "Applicant accepted open-to-everyone Partner Program terms, vendor onboarding and local customer awareness responsibilities, independent associate status, no employment/equity rights, configurable benefit initially 10%, eligible-revenue exclusions and company review rights.";

      const { error } = await supabase.from("partner_applications").insert({
        applicant_name: form.applicant_name.trim(),
        partner_type: form.partner_type,
        applicant_category: form.partner_type,
        organization_name: form.organization_name.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim() ? form.email.trim().toLowerCase() : null,
        city: form.city.trim(),
        district: form.district.trim(),
        state: form.state.trim(),
        coverage_area: form.proposed_area_of_operation.trim(),
        proposed_area_of_operation: form.proposed_area_of_operation.trim(),
        hyperlocal_promotion_area: "Normally 500 metres to 1 kilometre around onboarded vendors, subject to final SabSewa Local distance rules.",
        expected_vendor_reach: Number(form.expected_vendor_reach || 0) || null,
        experience_summary: form.experience_summary.trim(),
        vendor_onboarding_plan: form.vendor_onboarding_plan.trim(),
        customer_awareness_plan: form.customer_awareness_plan.trim(),
        referral_source: form.referral_source.trim() || null,
        revenue_share_percent: DEFAULT_BENEFIT_PERCENT,
        net_revenue_definition:
          "Eligible company revenue excludes GST/statutory taxes, refundable security deposits, refunds, chargebacks, discounts, payment-gateway charges and legally required deductions. This is not equity or company ownership.",
        terms_version: PARTNER_TERMS_VERSION,
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        acceptance_summary: acceptanceSummary,
      });

      if (error) throw error;
      Alert.alert("Application submitted", "Thank you. SabSewa Local will review your partner application in the Company CRM.");
      setForm({
        applicant_name: "",
        partner_type: "Individual",
        organization_name: "",
        phone: "",
        email: "",
        city: "",
        district: "",
        state: "",
        proposed_area_of_operation: "",
        expected_vendor_reach: "",
        experience_summary: "",
        vendor_onboarding_plan: "",
        customer_awareness_plan: "",
        referral_source: "",
      });
      setAccepted(false);
    } catch (error: any) {
      Alert.alert("Submission failed", error?.message || "Unable to submit partner application right now.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView ref={scrollRef} style={styles.screen} contentContainerStyle={styles.content}>
      <BrandHeader compact subtitle="Partner Program" />

      <View style={styles.hero}>
        <Text style={styles.kicker}>Partner With Us</Text>
        <Text style={styles.title}>Help SabSewa Local Grow Across India & Earn Benefits</Text>
        <Text style={styles.lead}>
          The Partner Program is open to eligible customers, vendors, independent individuals, local promoters, business-development professionals and organizations who can help create active local SabSewa marketplaces.
        </Text>
        <TouchableOpacity style={styles.heroButton} onPress={() => scrollRef.current?.scrollTo({ y: formOffsetY, animated: true })}>
          <Text style={styles.heroButtonText}>Apply to Become a Partner</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.principleBox}>
        <Text style={styles.principleText}>
          A successful SabSewa Partner does not simply add shops to the platform - the Partner helps create an active SabSewa marketplace in the locality by bringing local vendors and making local customers aware that they can order from those nearby shops through SabSewa Local.
        </Text>
      </View>

      <View style={styles.grid}>
        <InfoPanel
          title="1. Build the Local Vendor Network"
          items={[
            "Identify, approach, explain and help suitable local vendors join SabSewa Local.",
            `Supported businesses include ${vendorExamples.join(", ")}.`,
            "Use the assigned Partner ID, referral code or referral link so vendor attribution is permanently recorded.",
          ]}
        />
        <InfoPanel
          title="2. Build Customer Awareness"
          items={[
            "Tell people in the same locality that nearby shops are available on SabSewa Local.",
            "Promote mobile-browser/app usage around onboarded vendors, normally within 500 metres to 1 kilometre, subject to final distance rules.",
            "Customers remain free to buy from any available SabSewa Local vendor in their nearby area, regardless of which Partner onboarded the vendor.",
          ]}
        />
      </View>

      <View style={styles.band}>
        <Text style={styles.sectionTitle}>Partner Benefit</Text>
        <Text style={styles.largeMetric}>10%</Text>
        <Text style={styles.bodyText}>
          Initial configurable partner benefit on eligible SabSewa Local company revenue attributable to successfully onboarded vendors.
        </Text>
        {benefitRules.map((point) => (
          <Text key={point} style={styles.bullet}>- {point}</Text>
        ))}
      </View>

      <View style={styles.termsBox}>
        <Text style={styles.sectionTitle}>Partner Terms Summary</Text>
        <Text style={styles.bullet}>- Partner is an independent business associate, not an employee, agent, franchisee, legal partner or shareholder.</Text>
        <Text style={styles.bullet}>- Partner must not collect money, promise approval, promise income, or misrepresent SabSewa Local terms.</Text>
        <Text style={styles.bullet}>- Partner must help both sides of the local ecosystem: vendor onboarding and customer awareness/usage.</Text>
        <Text style={styles.bullet}>- Partner benefits are payable only for eligible verified revenue after company review and audit.</Text>
        <Text style={styles.bullet}>- Master Admin may configure percentage, eligibility, geography, status and payment handling according to final Partner Program Terms.</Text>
      </View>

      <View nativeID="application" style={styles.formCard} onLayout={(event) => setFormOffsetY(event.nativeEvent.layout.y)}>
        <Text style={styles.sectionTitle}>Apply to Become a Partner</Text>
        <Field label="Full Name *" value={form.applicant_name} onChangeText={(v) => setValue("applicant_name", v)} />
        <Text style={styles.label}>Applicant Type *</Text>
        <View style={styles.chips}>
          {partnerTypes.map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.chip, form.partner_type === type && styles.chipSelected]}
              onPress={() => setValue("partner_type", type)}
            >
              <Text style={[styles.chipText, form.partner_type === type && styles.chipTextSelected]}>{type}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Field label="Organization / Business Name" value={form.organization_name} onChangeText={(v) => setValue("organization_name", v)} />
        <Field label="Mobile Number *" value={form.phone} onChangeText={(v) => setValue("phone", v)} keyboardType="phone-pad" />
        <Field label="Email Address (optional)" value={form.email} onChangeText={(v) => setValue("email", v)} keyboardType="email-address" />
        <View style={styles.twoCol}>
          <Field label="City *" value={form.city} onChangeText={(v) => setValue("city", v)} containerStyle={styles.flexField} />
          <Field label="District *" value={form.district} onChangeText={(v) => setValue("district", v)} containerStyle={styles.flexField} />
        </View>
        <Field label="State *" value={form.state} onChangeText={(v) => setValue("state", v)} />
        <Field label="Proposed Area of Operation *" value={form.proposed_area_of_operation} onChangeText={(v) => setValue("proposed_area_of_operation", v)} placeholder="Local markets, wards, sectors, towns or districts" />
        <Field label="Expected Vendor Reach" value={form.expected_vendor_reach} onChangeText={(v) => setValue("expected_vendor_reach", v)} keyboardType="numeric" />
        <Field label="Experience / Background *" value={form.experience_summary} onChangeText={(v) => setValue("experience_summary", v)} multiline />
        <Field label="How will you onboard local vendors? *" value={form.vendor_onboarding_plan} onChangeText={(v) => setValue("vendor_onboarding_plan", v)} multiline />
        <Field label="How will you create local customer awareness? *" value={form.customer_awareness_plan} onChangeText={(v) => setValue("customer_awareness_plan", v)} multiline />
        <Field label="Referral Source" value={form.referral_source} onChangeText={(v) => setValue("referral_source", v)} />

        <TouchableOpacity style={styles.acceptRow} onPress={() => setAccepted((value) => !value)}>
          <View style={[styles.checkbox, accepted && styles.checked]}>{accepted ? <Text style={styles.checkText}>âœ“</Text> : null}</View>
          <Text style={styles.acceptText}>
            I accept that the Partner Program is for vendor onboarding and customer awareness. I understand the initial 10% benefit applies only to eligible company revenue, is configurable by SabSewa Local, and does not mean equity or ownership.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.submitButton, submitting && styles.disabled]} onPress={submitApplication} disabled={submitting}>
          <Text style={styles.submitText}>{submitting ? "Submitting..." : "Submit Partner Application"}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function InfoPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <View style={styles.infoPanel}>
      <Text style={styles.infoTitle}>{title}</Text>
      {items.map((item) => (
        <Text key={item} style={styles.bullet}>- {item}</Text>
      ))}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  containerStyle,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad";
  multiline?: boolean;
  containerStyle?: any;
}) {
  return (
    <View style={[styles.field, containerStyle]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType || "default"}
        multiline={multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#ffffff" },
  content: { padding: 20, paddingTop: 64, paddingBottom: 50 },
  hero: { backgroundColor: "#ecfeff", borderWidth: 1, borderColor: "#99f6e4", borderRadius: 8, padding: 18, marginBottom: 14 },
  kicker: { color: "#f97316", fontWeight: "900", marginBottom: 8, textTransform: "uppercase" },
  title: { color: "#0f172a", fontSize: 30, fontWeight: "900", lineHeight: 36 },
  lead: { color: "#334155", lineHeight: 21, marginTop: 10, marginBottom: 16 },
  heroButton: { backgroundColor: "#1166ff", borderRadius: 8, padding: 14, alignItems: "center" },
  heroButtonText: { color: "#fff", fontWeight: "900" },
  principleBox: { borderWidth: 1, borderColor: "#bbf7d0", backgroundColor: "#f0fdf4", borderRadius: 8, padding: 14, marginBottom: 14 },
  principleText: { color: "#14532d", fontWeight: "800", lineHeight: 22 },
  band: { borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", borderRadius: 8, padding: 16, marginBottom: 14 },
  sectionTitle: { color: "#111827", fontSize: 20, fontWeight: "900", marginBottom: 10 },
  largeMetric: { color: "#f97316", fontSize: 46, fontWeight: "900" },
  bodyText: { color: "#374151", lineHeight: 21, marginBottom: 8 },
  grid: { gap: 12, marginBottom: 14 },
  infoPanel: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, backgroundColor: "#fff" },
  infoTitle: { color: "#0f766e", fontSize: 18, fontWeight: "900", marginBottom: 8 },
  bullet: { color: "#374151", lineHeight: 21, marginBottom: 5 },
  termsBox: { borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#f8fafc", borderRadius: 8, padding: 14, marginBottom: 14 },
  formCard: { borderWidth: 1, borderColor: "#dbeafe", backgroundColor: "#f8fbff", borderRadius: 8, padding: 16 },
  field: { marginBottom: 12 },
  label: { color: "#334155", fontWeight: "800", marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#fff", borderRadius: 8, padding: 12 },
  textArea: { minHeight: 92, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: "#99f6e4", borderRadius: 999, paddingVertical: 8, paddingHorizontal: 11, backgroundColor: "#fff" },
  chipSelected: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  chipText: { color: "#0f766e", fontWeight: "800" },
  chipTextSelected: { color: "#fff" },
  twoCol: { flexDirection: "row", gap: 10 },
  flexField: { flex: 1 },
  acceptRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginVertical: 12 },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: "#64748b", borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  checkText: { color: "#fff", fontWeight: "900" },
  acceptText: { flex: 1, color: "#334155", lineHeight: 19 },
  submitButton: { backgroundColor: "#f97316", borderRadius: 8, padding: 14, alignItems: "center" },
  disabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontWeight: "900" },
});