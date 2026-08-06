import React, { useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import BrandHeader from "@/components/BrandHeader";
import { supabase } from "@/lib/supabase";

const PARTNER_TERMS_VERSION = "2026-08-05";

const partnerTypes = [
  "Individual",
  "Consultant",
  "Organization",
  "NGO",
  "Educational Institution",
  "Other Stakeholder",
];

const benefits = [
  "Earn 10% of net revenue from vendors onboarded through verified partner efforts.",
  "Help local vendors digitize storefronts, credit records, delivery policies and payment workflows.",
  "Support expansion across cities, districts, campuses, markets and community networks in India.",
  "Work independently with a transparent application, review and approval process.",
];

const responsibilities = [
  "Promote SabSewa Local ethically and lawfully.",
  "Share accurate information with vendors and avoid false commitments.",
  "Do not collect payments or make binding promises unless the company authorizes it in writing.",
  "Protect vendor, customer, pricing, business and technical information.",
];

const legalPoints = [
  "The partner is an independent business associate, not an employee, agent, franchisee or legal partner of the company.",
  "There is no salary, fixed remuneration, PF, ESI, gratuity, bonus, leave benefit, medical insurance or other employment benefit.",
  "Commission is payable only for eligible vendors approved by the company and linked to verified partner efforts.",
  "Net revenue means revenue after GST, statutory taxes, payment gateway charges, refunds, chargebacks, discounts and legally applicable deductions.",
  "The partner is responsible for their own taxes, statutory registrations, insurance and legal compliance.",
  "Disputes are subject to the exclusive jurisdiction of competent courts at Gurugram, Haryana, India.",
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
    state: "",
    coverage_area: "",
    expected_vendor_reach: "",
    experience_summary: "",
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
      form.email,
      form.city,
      form.state,
      form.coverage_area,
      form.experience_summary,
    ];
    if (required.some((value) => !String(value || "").trim())) {
      Alert.alert("Partner application", "Please fill all required fields before submitting.");
      return;
    }
    if (!accepted) {
      Alert.alert("Terms acceptance required", "Please accept the Partner Program Terms & Conditions before registration.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("partner_applications").insert({
        applicant_name: form.applicant_name.trim(),
        partner_type: form.partner_type,
        organization_name: form.organization_name.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        city: form.city.trim(),
        state: form.state.trim(),
        coverage_area: form.coverage_area.trim(),
        expected_vendor_reach: Number(form.expected_vendor_reach || 0) || null,
        experience_summary: form.experience_summary.trim(),
        referral_source: form.referral_source.trim() || null,
        revenue_share_percent: 10,
        terms_version: PARTNER_TERMS_VERSION,
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        acceptance_summary:
          "Applicant accepted independent associate status, no employment benefits, commission-only earnings, 10% net revenue share, compliance responsibilities and Gurugram jurisdiction.",
      });

      if (error) throw error;
      Alert.alert("Application submitted", "Thank you. Our team will review your partner application and contact you after verification.");
      setForm({
        applicant_name: "",
        partner_type: "Individual",
        organization_name: "",
        phone: "",
        email: "",
        city: "",
        state: "",
        coverage_area: "",
        expected_vendor_reach: "",
        experience_summary: "",
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
        <Text style={styles.title}>Grow SabSewa Local across India</Text>
        <Text style={styles.lead}>
          Individuals, organizations, consultants, NGOs, educational institutions and local ecosystem builders can apply to help onboard trusted vendors and expand digital neighborhood commerce.
        </Text>
        <TouchableOpacity style={styles.heroButton} onPress={() => scrollRef.current?.scrollTo({ y: formOffsetY, animated: true })}>
          <Text style={styles.heroButtonText}>Apply for Partnership</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.band}>
        <Text style={styles.sectionTitle}>Revenue Sharing</Text>
        <Text style={styles.largeMetric}>10%</Text>
        <Text style={styles.bodyText}>
          Partners receive 10% of net revenue generated from vendors they successfully onboard, subject to company verification, approval, audit rights and the official Partner Program Terms & Conditions.
        </Text>
      </View>

      <View style={styles.grid}>
        <InfoPanel title="Benefits" items={benefits} />
        <InfoPanel title="Responsibilities" items={responsibilities} />
      </View>

      <View style={styles.termsBox}>
        <Text style={styles.sectionTitle}>Partner Program Terms Summary</Text>
        {legalPoints.map((point) => (
          <Text key={point} style={styles.bullet}>- {point}</Text>
        ))}
        <Text style={styles.termsNote}>
          By submitting this application, you confirm that you have read and agree to the Partner Program Terms & Conditions, including independent associate status, commission-only compensation and exclusive Gurugram, Haryana jurisdiction.
        </Text>
      </View>

      <View nativeID="application" style={styles.formCard} onLayout={(event) => setFormOffsetY(event.nativeEvent.layout.y)}>
        <Text style={styles.sectionTitle}>Partner Application</Text>
        <Field label="Full Name *" value={form.applicant_name} onChangeText={(v) => setValue("applicant_name", v)} />
        <Text style={styles.label}>Partner Type *</Text>
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
        <Field label="Organization / Institution Name" value={form.organization_name} onChangeText={(v) => setValue("organization_name", v)} />
        <Field label="Mobile Number *" value={form.phone} onChangeText={(v) => setValue("phone", v)} keyboardType="phone-pad" />
        <Field label="Email Address *" value={form.email} onChangeText={(v) => setValue("email", v)} keyboardType="email-address" />
        <View style={styles.twoCol}>
          <Field label="City *" value={form.city} onChangeText={(v) => setValue("city", v)} containerStyle={styles.flexField} />
          <Field label="State *" value={form.state} onChangeText={(v) => setValue("state", v)} containerStyle={styles.flexField} />
        </View>
        <Field label="Coverage Area *" value={form.coverage_area} onChangeText={(v) => setValue("coverage_area", v)} placeholder="Markets, districts, campuses or communities" />
        <Field label="Expected Vendor Reach" value={form.expected_vendor_reach} onChangeText={(v) => setValue("expected_vendor_reach", v)} keyboardType="numeric" />
        <Field label="Relevant Experience / Network *" value={form.experience_summary} onChangeText={(v) => setValue("experience_summary", v)} multiline />
        <Field label="Referral Source" value={form.referral_source} onChangeText={(v) => setValue("referral_source", v)} />

        <TouchableOpacity style={styles.acceptRow} onPress={() => setAccepted((value) => !value)}>
          <View style={[styles.checkbox, accepted && styles.checked]}>{accepted ? <Text style={styles.checkText}>✓</Text> : null}</View>
          <Text style={styles.acceptText}>
            I have read and agree to the Partner Program Terms & Conditions. I understand this is not employment, there is no guaranteed income, and commission is 10% of eligible net revenue only.
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
  band: { borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", borderRadius: 8, padding: 16, marginBottom: 14 },
  sectionTitle: { color: "#111827", fontSize: 20, fontWeight: "900", marginBottom: 10 },
  largeMetric: { color: "#f97316", fontSize: 46, fontWeight: "900" },
  bodyText: { color: "#374151", lineHeight: 21 },
  grid: { gap: 12, marginBottom: 14 },
  infoPanel: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, backgroundColor: "#fff" },
  infoTitle: { color: "#0f766e", fontSize: 18, fontWeight: "900", marginBottom: 8 },
  bullet: { color: "#374151", lineHeight: 21, marginBottom: 5 },
  termsBox: { borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#f8fafc", borderRadius: 8, padding: 14, marginBottom: 14 },
  termsNote: { color: "#7c2d12", backgroundColor: "#fff7ed", borderRadius: 8, padding: 10, lineHeight: 19, marginTop: 8 },
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
