import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import BrandHeader from "@/components/BrandHeader";
import { authenticatedFetch } from "@/lib/backend";

const statuses = ["pending", "kyc_pending", "under_review", "approved", "rejected", "active", "suspended", "revoked"] as const;

function fmtMoney(value: any) {
  const n = Number(value || 0);
  return `Rs ${n.toFixed(2)}`;
}

function latestKycDoc(application: any, section: string) {
  const docs = application.kyc_documents || application.raw?.partner_kyc_documents || [];
  return docs
    .filter((doc: any) => doc.document_section === section && doc.status !== "deleted")
    .sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0] || null;
}

function latestAnyKycDoc(application: any) {
  const docs = application.kyc_documents || application.raw?.partner_kyc_documents || [];
  return docs
    .filter((doc: any) => doc.status !== "deleted")
    .sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0] || null;
}

function kycStatusText(doc: any) {
  if (!doc) return "Missing";
  return `${String(doc.status || "uploaded").replace(/_/g, " ")}${doc.document_label ? ` - ${doc.document_label}` : ""}`;
}

function timePendingText(value: any) {
  if (!value) return "-";
  const started = new Date(value).getTime();
  if (!Number.isFinite(started)) return "-";
  const hours = Math.max(0, Math.floor((Date.now() - started) / 36e5));
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ${hours % 24}h`;
}

function askAdminText(message: string, required = false) {
  const promptFn = Platform.OS === "web" && typeof window !== "undefined" ? window.prompt : undefined;
  const answer = promptFn ? promptFn(message) : "";
  const clean = String(answer || "").trim();
  if (required && !clean) {
    Alert.alert("Reason required", "Please enter a clear reason before completing this review action.");
    return null;
  }
  return clean;
}

function confirmAdminAction(message: string) {
  const confirmFn = Platform.OS === "web" && typeof window !== "undefined" ? window.confirm : undefined;
  return confirmFn ? confirmFn(message) : true;
}

function latestReviewHistory(application: any) {
  const history = application.review_history || application.raw?.partner_admin_audit_logs || [];
  return Array.isArray(history) ? history.slice(0, 3) : [];
}


export default function PartnerApplicationsScreen() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const initialFilter = typeof params.filter === "string" ? params.filter : "all";
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState(initialFilter || "all");

  async function loadApplications() {
    setLoading(true);
    try {
      const response = await authenticatedFetch("/api/partner/admin/applications");
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load applications.");
      setApplications(json.applications || []);
    } catch (error: any) {
      Alert.alert("Partner applications", error?.message || "Unable to load applications.");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    const actionMap: Record<string, string> = {
      approved: "activate_partner",
      active: "activate_partner",
      suspended: "suspend_partner",
      revoked: "terminate_partner",
      rejected: "reject_kyc",
      under_review: "request_kyc_correction",
      pending: "request_kyc_correction",
    };
    const action = actionMap[status] || "request_kyc_correction";
    const reason = action.includes("suspend") || action.includes("terminate") || action.includes("reject")
      ? prompt("Enter reason for this Partner action") || ""
      : "";
    const response = await authenticatedFetch(`/api/partner/admin/applications/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Update failed", json.error || "Unable to update Partner record.");
      return;
    }
    loadApplications();
  }

  async function reviewPartner(id: string, action: string, options: any = {}) {
    let reason = "";
    let admin_remarks = "";
    let required_information = "";
    let follow_up_date = "";

    if (options.reasonRequired) {
      reason = askAdminText(options.reasonPrompt || "Enter reason for this Partner decision", true) || "";
      if (!reason) return;
    }
    if (options.requestInfo) {
      required_information = askAdminText("What additional information or document correction should the Partner provide?", true) || "";
      if (!required_information) return;
    }
    if (options.remarks) admin_remarks = askAdminText("Admin remarks, if any") || "";
    if (options.followUp) follow_up_date = askAdminText("Optional follow-up date (YYYY-MM-DD)") || "";
    if (!confirmAdminAction(options.confirm || "Are you sure you want to complete this Partner review action?")) return;

    const response = await authenticatedFetch(`/api/partner/admin/applications/${id}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason, admin_remarks, required_information, follow_up_date }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) return Alert.alert("Partner review", json.error || "Unable to update Partner.");
    loadApplications();
  }

  async function previewKycDocument(documentId: string) {
    const response = await authenticatedFetch(`/api/partner/admin/kyc-documents/${documentId}/view`);
    const json = await response.json();
    if (!response.ok || !json.success || !json.url) {
      Alert.alert("Partner KYC document", json.error || "Unable to open secure KYC preview.");
      return;
    }
    const openWindow = (globalThis as any).open;
    if (openWindow) openWindow(json.url, "_blank", "noopener,noreferrer");
    else Alert.alert("Secure KYC preview", json.url);
  }



  useEffect(() => {
    loadApplications();
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return applications.filter((application) => {
      const kycStatus = String(application.kyc_status || "not_submitted");
      const appStatus = String(application.status || "pending");
      const submittedAt = application.raw?.kyc_submitted_at || application.submitted_at || application.raw?.created_at;
      const submittedMs = submittedAt ? new Date(submittedAt).getTime() : NaN;
      const deadlineMs = Number.isFinite(submittedMs) ? submittedMs + 48 * 60 * 60 * 1000 : NaN;
      const pendingKyc = ["documents_submitted", "under_review"].includes(kycStatus);
      const filterMatches =
        activeFilter === "all" ||
        (activeFilter === "kyc_pending" && pendingKyc) ||
        (activeFilter === "approaching_deadline" && pendingKyc && Number.isFinite(deadlineMs) && deadlineMs > Date.now() && deadlineMs - Date.now() <= 12 * 60 * 60 * 1000) ||
        (activeFilter === "overdue" && pendingKyc && Number.isFinite(deadlineMs) && deadlineMs <= Date.now()) ||
        kycStatus === activeFilter ||
        appStatus === activeFilter;
      if (!filterMatches) return false;
      if (!needle) return true;
      const haystack = [
        application.applicant_name,
        application.partner_id,
        application.referral_code,
        application.phone,
        application.email,
        application.city,
        application.district,
        application.state,
        application.status,
        application.kyc_status,
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [activeFilter, applications, search]);

  const counts = useMemo(() => {
    return statuses.reduce((acc: Record<string, number>, status) => {
      acc[status] = applications.filter((item) => {
        const appStatus = String(item.status || "pending");
        const kycStatus = String(item.kyc_status || "not_submitted");
        if (status === "kyc_pending") return ["documents_submitted", "under_review"].includes(kycStatus);
        if (status === "under_review") return appStatus === "under_review" || ["documents_submitted", "under_review"].includes(kycStatus);
        return appStatus === status;
      }).length;
      return acc;
    }, {});
  }, [applications]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Partner Management" />
      <Text style={styles.heading}>Partner Management</Text>
      <Text style={styles.alertTitle}>Pending Partner Applications: {(counts.pending || 0) + (counts.kyc_pending || 0)}</Text>
      <Text style={styles.subheading}>
        Review partner applications, activate approved partners, track referral codes, referred vendors, eligible revenue, payable benefits and partner status.
      </Text>

      <View style={styles.counterGrid}>
        <TouchableOpacity style={[styles.counterCard, activeFilter === "all" && styles.counterActive]} onPress={() => setActiveFilter("all")}>
          <Text style={styles.counterValue}>{applications.length}</Text>
          <Text style={styles.counterLabel}>all</Text>
        </TouchableOpacity>
        {statuses.map((status) => (
          <TouchableOpacity key={status} style={[styles.counterCard, activeFilter === status && styles.counterActive]} onPress={() => setActiveFilter(status)}>
            <Text style={styles.counterValue}>{counts[status] || 0}</Text>
            <Text style={styles.counterLabel}>{status.replace(/_/g, " ")}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeFilter !== "all" ? (
        <TouchableOpacity style={styles.clearFilterButton} onPress={() => setActiveFilter("all")}>
          <Text style={styles.clearFilterText}>Showing: {activeFilter.replace(/_/g, " ")} - Tap to clear filter</Text>
        </TouchableOpacity>
      ) : null}

      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name, Partner ID, referral code, phone, city, state or status"
      />

      <TouchableOpacity style={styles.refreshButton} onPress={loadApplications}>
        <Text style={styles.refreshText}>{loading ? "Loading..." : "Refresh Partner Dashboard"}</Text>
      </TouchableOpacity>

      {filtered.map((application) => {
        const referrals = application.referrals || application.raw?.partner_referred_vendors || [];
        const commissions = application.commission_events || application.raw?.partner_commission_events || [];
        const activated = referrals.filter((item: any) => ["approved", "commission_eligible"].includes(item.referral_status)).length;
        const eligibleRevenue = referrals.reduce((sum: number, item: any) => sum + Number(item.eligible_revenue_amount || 0), 0);
        const earned = referrals.reduce((sum: number, item: any) => sum + Number(item.benefit_earned_amount || 0), 0)
          + commissions.reduce((sum: number, item: any) => sum + Number(item.commission_amount || 0), 0);
        const paid = commissions.filter((item: any) => item.status === "paid").reduce((sum: number, item: any) => sum + Number(item.commission_amount || 0), 0);
        const identityDoc = latestKycDoc(application, "identity_proof");
        const addressDoc = latestKycDoc(application, "address_proof");
        const photoDoc = latestKycDoc(application, "partner_photo");
        const organizationDoc = latestKycDoc(application, "organization_document");
        const latestDoc = latestAnyKycDoc(application);

        return (
          <View key={application.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.name}>{application.applicant_name}</Text>
                <Text style={styles.meta}>{application.partner_type} | {application.city}, {application.district || "-"}, {application.state}</Text>
                <Text style={styles.meta}>{application.phone}{application.email ? ` | ${application.email}` : ""}</Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>{String(application.status || "pending").replace(/_/g, " ")}</Text>
              </View>
            </View>

            <View style={styles.identityBox}>
              <Text style={styles.identityText}>Application ID: {application.application_id || application.partner_id || "Generated after SQL update"}</Text>
              <Text style={styles.identityText}>Partner ID: {application.partner_id || "Generated after SQL update"}</Text>
              <Text style={styles.identityText}>Referral Code: {application.referral_code || "Generated after SQL update"}</Text>
              <Text style={styles.identityText}>Referral Link: {application.referral_link || "Generated after SQL update"}</Text>
              <Text style={styles.identityText}>Benefit %: {Number(application.raw?.revenue_share_percent || 10).toFixed(2)}%</Text>
              <Text style={styles.identityText}>Partner KYC: {String(application.kyc_status || "not_submitted").replace(/_/g, " ")}</Text>
              <Text style={styles.identityText}>Application Date: {application.submitted_at || application.raw?.created_at || "-"}</Text>
              <Text style={styles.identityText}>Identity Document Type: {identityDoc?.document_label || identityDoc?.document_type || "-"}</Text>
              <Text style={styles.identityText}>Identity Proof Status: {kycStatusText(identityDoc)}</Text>
              <Text style={styles.identityText}>Address Proof Status: {kycStatusText(addressDoc)}</Text>
              <Text style={styles.identityText}>Photograph Status: {kycStatusText(photoDoc)}</Text>
              {organizationDoc ? <Text style={styles.identityText}>Organization Document Status: {kycStatusText(organizationDoc)}</Text> : null}
              <Text style={styles.identityText}>KYC Submission Date: {application.raw?.kyc_submitted_at || "-"}</Text>
              <Text style={styles.identityText}>Time Pending: {timePendingText(application.raw?.kyc_submitted_at)}</Text>
              <Text style={styles.identityText}>Payment Details: {String(application.payment_details_status || "pending_verification").replace(/_/g, " ")}</Text>
              <Text style={styles.identityText}>Payment Method: {application.payment_detail?.payment_method || "-"}</Text>
              {application.kyc_review_notes ? <Text style={styles.reviewNoteText}>KYC Review Notes: {application.kyc_review_notes}</Text> : null}
              {application.payment_details_review_notes ? <Text style={styles.reviewNoteText}>Payment Review Notes: {application.payment_details_review_notes}</Text> : null}
              {latestReviewHistory(application).map((item: any) => (
                <Text key={item.id || item.created_at} style={styles.reviewHistoryText}>
                  {String(item.action || "review").replace(/_/g, " ")} - {item.actor_admin_name || item.actor_admin_id || "Admin"} - {item.reason || item.created_at || ""}
                </Text>
              ))}
            </View>

            <Text style={styles.body}>Area: {application.proposed_area_of_operation || application.coverage_area}</Text>
            <Text style={styles.body}>Vendor onboarding plan: {application.vendor_onboarding_plan || application.experience_summary}</Text>
            <Text style={styles.body}>Customer awareness plan: {application.customer_awareness_plan || "Not captured in older application."}</Text>

            <View style={styles.metricGrid}>
              <Metric label="Referred Vendors" value={String(referrals.length)} />
              <Metric label="Activated Vendors" value={String(activated)} />
              <Metric label="Eligible Revenue" value={fmtMoney(eligibleRevenue)} />
              <Metric label="Benefit Earned" value={fmtMoney(earned)} />
              <Metric label="Paid" value={fmtMoney(paid)} />
              <Metric label="Pending" value={fmtMoney(Math.max(0, earned - paid))} />
            </View>

            <View style={styles.reviewPanel}>
              <Text style={styles.reviewPanelTitle}>KYC Review Decisions</Text>
              <View style={styles.actions}>
                {latestDoc?.id ? (
                  <TouchableOpacity style={styles.actionButton} onPress={() => previewKycDocument(latestDoc.id)}>
                    <Text style={styles.actionText}>Open Latest KYC Document</Text>
                  </TouchableOpacity>
                ) : null}
                {identityDoc?.id ? <TouchableOpacity style={styles.actionButton} onPress={() => previewKycDocument(identityDoc.id)}><Text style={styles.actionText}>Review Identity Proof</Text></TouchableOpacity> : null}
                {addressDoc?.id ? <TouchableOpacity style={styles.actionButton} onPress={() => previewKycDocument(addressDoc.id)}><Text style={styles.actionText}>Review Address Proof</Text></TouchableOpacity> : null}
                {photoDoc?.id ? <TouchableOpacity style={styles.actionButton} onPress={() => previewKycDocument(photoDoc.id)}><Text style={styles.actionText}>Review Photograph</Text></TouchableOpacity> : null}
                {organizationDoc?.id ? <TouchableOpacity style={styles.actionButton} onPress={() => previewKycDocument(organizationDoc.id)}><Text style={styles.actionText}>Review Organization Document</Text></TouchableOpacity> : null}
                <TouchableOpacity style={[styles.actionButton, styles.approveButton]} onPress={() => reviewPartner(application.id, "approve_kyc", { remarks: true, confirm: "Approve this Partner KYC?" })}><Text style={styles.approveText}>Verify / Approve KYC</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.holdButton]} onPress={() => reviewPartner(application.id, "request_further_information", { reasonRequired: true, requestInfo: true, followUp: true, confirm: "Request additional KYC information from this Partner?" })}><Text style={styles.holdText}>Further Enquiry Required</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.rejectButton]} onPress={() => reviewPartner(application.id, "reject_kyc", { reasonRequired: true, remarks: true, confirm: "Reject this Partner KYC?" })}><Text style={styles.rejectText}>Reject KYC</Text></TouchableOpacity>
              </View>

              <Text style={styles.reviewPanelTitle}>Payment Detail Review</Text>
              <View style={styles.actions}>
                <TouchableOpacity style={[styles.actionButton, styles.approveButton]} onPress={() => reviewPartner(application.id, "verify_payment_details", { remarks: true, confirm: "Verify this Partner payment detail?" })}><Text style={styles.approveText}>Verify Payment Details</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.rejectButton]} onPress={() => reviewPartner(application.id, "reject_payment_details", { reasonRequired: true, remarks: true, confirm: "Reject Partner payment details and request correction?" })}><Text style={styles.rejectText}>Reject Payment Details</Text></TouchableOpacity>
              </View>

              <Text style={styles.reviewPanelTitle}>Partner Lifecycle Controls</Text>
              <View style={styles.actions}>
                <TouchableOpacity style={[styles.actionButton, styles.approveButton]} onPress={() => reviewPartner(application.id, "activate_partner", { confirm: "Activate this Partner only if KYC and payment details are verified?" })}><Text style={styles.approveText}>Activate Partner</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.holdButton]} onPress={() => reviewPartner(application.id, "suspend_partner", { reasonRequired: true, remarks: true, confirm: "Suspend this active Partner pending investigation?" })}><Text style={styles.holdText}>Suspend Active Partner</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.approveButton]} onPress={() => reviewPartner(application.id, "reactivate_partner", { remarks: true, confirm: "Reactivate this Partner?" })}><Text style={styles.approveText}>Reactivate Partner</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.actionButton, styles.rejectButton]} onPress={() => reviewPartner(application.id, "revoke_partner", { reasonRequired: true, remarks: true, confirm: "Revoke or terminate this Partner account?" })}><Text style={styles.rejectText}>Revoke / Terminate</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        );
      })}

      {!filtered.length && !loading ? <Text style={styles.empty}>No partner applications found.</Text> : null}
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 70, paddingBottom: 50, paddingHorizontal: 20, backgroundColor: "#fff", minHeight: "100%" },
  heading: { fontSize: 26, fontWeight: "900", color: "#111827", marginBottom: 8 },
  subheading: { color: "#475569", lineHeight: 20, marginBottom: 14 },
  alertTitle: { color: "#9a3412", backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fdba74", borderRadius: 8, padding: 10, fontWeight: "900", marginBottom: 12 },
  counterGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  counterCard: { minWidth: 120, flexGrow: 1, borderWidth: 1, borderColor: "#dbeafe", borderRadius: 8, padding: 10, backgroundColor: "#f8fbff" },
  counterActive: { borderColor: "#1166ff", backgroundColor: "#eff6ff" },
  counterValue: { color: "#1166ff", fontSize: 22, fontWeight: "900" },
  counterLabel: { color: "#334155", fontWeight: "800", textTransform: "capitalize" },
  clearFilterButton: { borderWidth: 1, borderColor: "#fdba74", backgroundColor: "#fff7ed", borderRadius: 8, padding: 10, marginBottom: 12 },
  clearFilterText: { color: "#9a3412", fontWeight: "900", textAlign: "center", textTransform: "capitalize" },
  searchInput: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginBottom: 12, backgroundColor: "#fff" },
  refreshButton: { backgroundColor: "#1166ff", borderRadius: 8, padding: 12, alignItems: "center", marginBottom: 12 },
  refreshText: { color: "#fff", fontWeight: "900" },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 12, backgroundColor: "#fff" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "flex-start" },
  name: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  meta: { color: "#475569", marginTop: 4 },
  statusPill: { backgroundColor: "#ecfeff", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { color: "#0f766e", fontWeight: "900", textTransform: "capitalize" },
  identityBox: { borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", borderRadius: 8, padding: 10, marginTop: 10 },
  identityText: { color: "#7c2d12", fontWeight: "800", marginBottom: 3 },
  body: { color: "#374151", marginTop: 8, lineHeight: 19 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  metricCard: { minWidth: 130, flexGrow: 1, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, backgroundColor: "#f8fafc" },
  metricValue: { color: "#111827", fontWeight: "900", fontSize: 16 },
  metricLabel: { color: "#64748b", marginTop: 4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  reviewPanel: { borderWidth: 1, borderColor: "#dbeafe", backgroundColor: "#f8fbff", borderRadius: 8, padding: 10, marginTop: 12 },
  reviewPanelTitle: { color: "#0f172a", fontWeight: "900", marginTop: 6 },
  approveButton: { borderColor: "#16a34a", backgroundColor: "#f0fdf4" },
  approveText: { color: "#166534", fontWeight: "900" },
  holdButton: { borderColor: "#f59e0b", backgroundColor: "#fffbeb" },
  holdText: { color: "#92400e", fontWeight: "900" },
  rejectButton: { borderColor: "#dc2626", backgroundColor: "#fef2f2" },
  rejectText: { color: "#991b1b", fontWeight: "900" },
  reviewNoteText: { color: "#7c2d12", fontWeight: "900", marginTop: 4 },
  reviewHistoryText: { color: "#475569", fontWeight: "700", marginTop: 3 },
  actionButton: { borderWidth: 1, borderColor: "#1166ff", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  actionText: { color: "#1166ff", fontWeight: "800", textTransform: "capitalize" },
  empty: { color: "#64748b", marginTop: 20 },
});
