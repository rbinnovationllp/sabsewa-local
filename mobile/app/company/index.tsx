import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import BrandHeader from "@/components/BrandHeader";
import { apiUrl, authenticatedFetch } from "@/lib/backend";

type KycSummary = {
  new_submitted: number;
  pending_review: number;
  approaching_deadline: number;
  overdue: number;
  provisionally_cleared: number;
  approved: number;
  rejected: number;
  resubmission_required: number;
};

type PartnerKycSummary = {
  partner_kyc_pending: number;
  partner_kyc_documents_submitted: number;
  partner_kyc_under_review: number;
  partner_kyc_approaching_deadline: number;
  partner_kyc_overdue: number;
  partner_kyc_resubmission_required: number;
  partner_kyc_approved: number;
  partner_kyc_rejected: number;
  partner_kyc_suspicious_review: number;
  total_partner_applications: number;
};

export default function CompanyCrmHome() {
  const router = useRouter();
  const [paymentEnvironment, setPaymentEnvironment] = useState<any>(null);
  const [kycSummary, setKycSummary] = useState<KycSummary | null>(null);
  const [partnerKycSummary, setPartnerKycSummary] = useState<PartnerKycSummary | null>(null);
  const [loadingKyc, setLoadingKyc] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/admin/payment-environment"))
      .then((response) => response.json())
      .then((json) => {
        if (json?.success) setPaymentEnvironment(json.payment_environment);
      })
      .catch(() => setPaymentEnvironment(null));
    loadKycSummary();
    loadPartnerKycSummary();
  }, []);

  async function loadKycSummary() {
    setLoadingKyc(true);
    try {
      const response = await authenticatedFetch("/api/company/kyc/summary");
      const json = await response.json();
      if (response.ok && json.success) setKycSummary(json.summary);
    } finally {
      setLoadingKyc(false);
    }
  }

  function openQueue(filter: string) {
    router.push({ pathname: "/company/KycReviewQueue", params: { filter } } as any);
  }

  function openPartnerQueue(filter: string) {
    router.push({ pathname: "/company/PartnerApplications", params: { filter } } as any);
  }

  async function loadPartnerKycSummary() {
    try {
      const response = await authenticatedFetch("/api/partner/admin/kyc/summary");
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load Partner KYC summary.");
      setPartnerKycSummary(json.summary);
    } catch {
      setPartnerKycSummary(null);
    }
  }

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

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Partner KYC Review Monitor</Text>
        {loadingKyc ? <ActivityIndicator /> : null}
      </View>
      <View style={styles.metricGrid}>
        <TouchableOpacity style={styles.metricCard} onPress={() => openPartnerQueue("kyc_pending")}>
          <Text style={styles.metricValue}>{partnerKycSummary?.partner_kyc_pending || 0}</Text>
          <Text style={styles.metricLabel}>Partner KYC Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.metricCard, styles.warnCard]} onPress={() => openPartnerQueue("approaching_deadline")}>
          <Text style={styles.metricValue}>{partnerKycSummary?.partner_kyc_approaching_deadline || 0}</Text>
          <Text style={styles.metricLabel}>Partner Approaching 48h</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.metricCard, styles.dangerCard]} onPress={() => openPartnerQueue("overdue")}>
          <Text style={styles.metricValue}>{partnerKycSummary?.partner_kyc_overdue || 0}</Text>
          <Text style={styles.metricLabel}>Partner KYC Overdue</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.metricCard} onPress={() => openPartnerQueue("additional_information_required")}>
          <Text style={styles.metricValue}>{partnerKycSummary?.partner_kyc_resubmission_required || 0}</Text>
          <Text style={styles.metricLabel}>Partner Resubmission Required</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.metricCard} onPress={() => openPartnerQueue("verified")}>
          <Text style={styles.metricValue}>{partnerKycSummary?.partner_kyc_approved || 0}</Text>
          <Text style={styles.metricLabel}>Partner KYC Approved</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.metricCard} onPress={() => openPartnerQueue("rejected")}>
          <Text style={styles.metricValue}>{partnerKycSummary?.partner_kyc_rejected || 0}</Text>
          <Text style={styles.metricLabel}>Partner KYC Rejected</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Vendor KYC Review Monitor</Text>
        {loadingKyc ? <ActivityIndicator /> : null}
      </View>
      <View style={styles.metricGrid}>
        <TouchableOpacity style={styles.metricCard} onPress={() => openQueue("pending_review")}>
          <Text style={styles.metricValue}>{(kycSummary?.new_submitted || 0) + (kycSummary?.pending_review || 0)}</Text>
          <Text style={styles.metricLabel}>Vendor KYC Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.metricCard, styles.warnCard]} onPress={() => openQueue("pending_review")}>
          <Text style={styles.metricValue}>{kycSummary?.approaching_deadline || 0}</Text>
          <Text style={styles.metricLabel}>Vendor Approaching 48h</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.metricCard, styles.dangerCard]} onPress={() => openQueue("pending_review")}>
          <Text style={styles.metricValue}>{kycSummary?.overdue || 0}</Text>
          <Text style={styles.metricLabel}>Vendor KYC Overdue</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.metricCard} onPress={() => openQueue("provisionally_cleared")}>
          <Text style={styles.metricValue}>{kycSummary?.provisionally_cleared || 0}</Text>
          <Text style={styles.metricLabel}>Provisionally Cleared</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.metricCard} onPress={() => openQueue("approved")}>
          <Text style={styles.metricValue}>{kycSummary?.approved || 0}</Text>
          <Text style={styles.metricLabel}>Approved</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.metricCard} onPress={() => openQueue("rejected")}>
          <Text style={styles.metricValue}>{kycSummary?.rejected || 0}</Text>
          <Text style={styles.metricLabel}>Rejected</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.metricCard} onPress={() => openQueue("resubmission_required")}>
          <Text style={styles.metricValue}>{kycSummary?.resubmission_required || 0}</Text>
          <Text style={styles.metricLabel}>Resubmission Required</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/VendorDirectory" as any)}>
        <Text style={styles.buttonText}>Vendor Directory</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/AdminDirectory" as any)}>
        <Text style={styles.buttonText}>Admin Directory</Text>
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
      <TouchableOpacity style={[styles.button, styles.warnButton]} onPress={() => openPartnerQueue("kyc_pending")}>
        <Text style={styles.warnButtonText}>Partner KYC Pending Review: {partnerKycSummary?.partner_kyc_pending || 0}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/PartnerPayoutManagement" as any)}>
        <Text style={styles.buttonText}>Partner Payout Management</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/VendorBulkUpload" as any)}>
        <Text style={styles.buttonText}>Bulk Catalogue Upload</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => router.push("/company/DataRecovery" as any)}>
        <Text style={styles.buttonText}>Data Recovery</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 70, paddingBottom: 50, paddingHorizontal: 20, backgroundColor: "#fff", minHeight: "100%" },
  heading: { fontSize: 26, fontWeight: "900", color: "#111827", marginBottom: 18 },
  environmentBanner: { borderRadius: 8, padding: 12, marginBottom: 14 },
  testBanner: { backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fb923c" },
  liveBanner: { backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#10b981" },
  environmentTitle: { fontWeight: "900", color: "#111827", marginBottom: 4 },
  environmentText: { color: "#374151", lineHeight: 18 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  metricCard: { width: "48%", minHeight: 86, borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 8, padding: 12, backgroundColor: "#eff6ff" },
  warnCard: { backgroundColor: "#fff7ed", borderColor: "#fdba74" },
  dangerCard: { backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
  metricValue: { fontSize: 24, fontWeight: "900", color: "#1166ff" },
  metricLabel: { color: "#334155", fontWeight: "800", marginTop: 4 },
  button: { backgroundColor: "#1166ff", borderRadius: 8, padding: 15, marginBottom: 12 },
  buttonText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  warnButton: { backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fdba74" },
  warnButtonText: { color: "#9a3412", fontWeight: "900", textAlign: "center" },
});
