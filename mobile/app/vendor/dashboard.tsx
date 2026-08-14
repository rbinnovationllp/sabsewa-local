import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useUser } from "@/contexts/UserContext";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import BrandHeader from "@/components/BrandHeader";

export default function VendorDashboard() {
  const legacyUser = useUser().user;
  const { user } = useAuth();
  const router = useRouter();

  const [vendor, setVendor] = useState<any>(null);
  const [terminals, setTerminals] = useState<any[]>([]);

  useEffect(() => {
    loadVendor();
  }, [user?.id, legacyUser?.id]);

  async function loadVendor() {
    const userId = user?.id || legacyUser?.id;
    if (!userId) return;

    const { data: vendorData } = await supabase
      .from("vendors")
      .select("*")
      .eq("owner_user_id", userId)
      .single();

    if (!vendorData) return;
    setVendor(vendorData);

    const { data: terminalData } = await supabase
      .from("vendor_terminals")
      .select("*")
      .eq("vendor_id", vendorData.id)
      .order("created_at");

    setTerminals(terminalData || []);
  }

  const vendorLoaded = Boolean(vendor?.id);
  const onboardingComplete =
    vendor?.status === "active" &&
    vendor?.kyc_status === "kyc_verified" &&
    vendor?.onboarding_payment_status === "payment_completed";
  const actionCards = [
    {
      title: "Onboarding",
      description: "View KYC, fee summary, payment status and activation readiness.",
      color: "#9333ea",
      route: vendorLoaded ? "/vendor/Onboarding" : "",
    },
    {
      title: "Billing & Subscription",
      description: "Pay platform charges, manage subscriptions, view invoices and purchase promotions.",
      color: "#0f766e",
      route: vendorLoaded ? `/vendor/Billing?vendor=${vendor.id}` : "",
    },
    {
      title: "Catalogue Setup",
      description: "Search the master catalogue, multi-select products and add them to your store.",
      color: "#007bff",
      route: vendorLoaded ? `/vendor/CatalogueSetup?vendor=${vendor.id}${terminals[0]?.id ? `&terminal=${terminals[0].id}` : ""}` : "",
    },
    {
      title: "Add One Item",
      description: "Create one custom catalogue item with image, brand, stock details and daily availability.",
      color: "#0ea5e9",
      route: vendorLoaded ? `/vendor/AddItem?vendor=${vendor.id}${terminals[0]?.id ? `&terminal=${terminals[0].id}` : ""}` : "",
    },
    {
      title: "Gemini Inventory Capture",
      description: "Use AI to read shelf photos, invoices or handwritten lists into inventory drafts.",
      color: "#0f766e",
      route: vendorLoaded ? `/vendor/GeminiInventory?vendor=${vendor.id}` : "",
    },
    {
      title: "Storage Usage",
      description: "View product-image quota, warnings and optimized image-storage usage.",
      color: "#475569",
      route: vendorLoaded ? `/vendor/StorageUsage?vendor=${vendor.id}` : "",
    },    {
      title: "Payment Information",
      description: "Upload vendor QR codes, UPI ID and preferred payment methods for direct customer collection.",
      color: "#166534",
      route: vendorLoaded ? `/vendor/PaymentInfo?vendor=${vendor.id}` : "",
    },
    {
      title: "Manage Items & Prices",
      description: "Update stock, daily availability, show-price, ask-price and market-price items.",
      color: "#28a745",
      route: vendorLoaded ? `/vendor/EditItem?vendor=${vendor.id}` : "",
    },
    {
      title: "Today's Availability",
      description: "Review today's orderable products, limited stock, restock time and daily price changes.",
      color: "#0f766e",
      route: vendorLoaded ? `/vendor/TodayAvailability?vendor=${vendor.id}` : "",
    },
    {
      title: "Customer Credits",
      description: "Maintain vendor-approved credit limits, payments, dues and reminders.",
      color: "#ff8800",
      route: vendorLoaded ? `/vendor/CreditList?vendor=${vendor.id}` : "",
    },
    {
      title: "Vendor Advance Balance",
      description: "Review Rs 5,500 activation split, Rs 5,000 wallet, top-ups and Rs 15 fees.",
      color: "#1166ff",
      route: vendorLoaded ? `/vendor/SecurityWallet?vendor=${vendor.id}` : "",
    },
    {
      title: "Orders",
      description: "Accept, partially fulfil or reject orders while protecting customer details.",
      color: "#6f42c1",
      route: vendorLoaded ? `/vendor/Orders?vendor=${vendor.id}` : "",
    },
    {
      title: "Delivery Settings",
      description: "Set free-delivery threshold, delivery fee, service radius, pickup and estimated delivery window.",
      color: "#0ea5e9",
      route: vendorLoaded && terminals[0]?.id ? `/vendor/DeliverySettings?vendor=${vendor.id}&terminal=${terminals[0].id}` : "",
    },
    {
      title: "Exit & Refund",
      description: "Preview voluntary closure, refundable balance and final statement.",
      color: "#b91c1c",
      route: vendorLoaded ? `/vendor/ExitAndRefund?vendor=${vendor.id}` : "",
    },
  ];

  function openVendorRoute(route: string) {
    if (!route) return;
    router.push(route as any);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Vendor CRM and shop operations" />
      <Text style={styles.heading}>Vendor Dashboard</Text>

      {vendor ? (
        <View style={styles.vendorPanel}>
          <Text style={styles.vendorName}>{vendor.shop_name || vendor.vendor_name || "Vendor"}</Text>
          <Text style={styles.vendorCode}>{vendor.owner_name || vendor.vendor_name || "Registered owner"}{vendor.phone_number || vendor.phone ? ` | ${vendor.phone_number || vendor.phone}` : ""}</Text>
          <Text style={styles.terminalDetails}>
            {[vendor.locality_code || vendor.locality || "Locality", vendor.city_code || vendor.city || "City"].filter(Boolean).join(" | ")}
          </Text>
        </View>
      ) : (
        <View style={styles.noticePanel}>
          <Text style={styles.noticeTitle}>Vendor profile not loaded</Text>
          <Text style={styles.noticeText}>
            Sign in with a vendor account that has completed business verification and activation. Once your vendor profile is linked, terminals, catalogue, wallet and order actions will unlock here.
          </Text>
        </View>
      )}

      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{onboardingComplete ? "Active" : "Locked"}</Text>
          <Text style={styles.summaryLabel}>Order receiving</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{terminals.length}</Text>
          <Text style={styles.summaryLabel}>Terminals</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{vendorLoaded ? "Rs 515" : "Pending"}</Text>
          <Text style={styles.summaryLabel}>Minimum balance</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Available Terminals</Text>

      {terminals.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No terminal available yet</Text>
          <Text style={styles.emptyText}>
            Terminals will appear after the vendor profile, branch details and service location are configured in SabSewa Local.
          </Text>
        </View>
      ) : null}

      {terminals.map((terminal) => (
        <TouchableOpacity
          key={terminal.id}
          style={styles.terminalBox}
          onPress={() => router.push(`/vendor/TerminalSelector?terminal=${terminal.id}`)}
        >
          <Text style={styles.terminalName}>{terminal.terminal_name}</Text>
          <Text style={styles.vendorCode}>{terminal.public_terminal_id || "Terminal ID pending"}</Text>
          <Text style={styles.terminalDetails}>
            City: {terminal.city} | Phone: {terminal.phone}
          </Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.sectionTitle}>Vendor Operations</Text>

      <View style={styles.actionGrid}>
        {actionCards.map((action) => (
          <TouchableOpacity
            key={action.title}
            style={[
              styles.actionCard,
              { borderTopColor: action.color },
              !vendorLoaded && styles.actionDisabled,
            ]}
            onPress={() => openVendorRoute(action.route)}
            disabled={!vendorLoaded}
          >
            <Text style={styles.actionTitle}>{action.title}</Text>
            <Text style={styles.actionText}>{action.description}</Text>
          <Text style={[styles.actionStatus, { color: vendorLoaded ? action.color : "#6b7280" }]}>
              {vendorLoaded ? (action.title === "Onboarding" || onboardingComplete ? "Open" : "Requires onboarding") : "Unlocks after vendor login"}
          </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 70,
    paddingBottom: 50,
    paddingHorizontal: 20,
    backgroundColor: "#fff",
  },
  heading: {
    fontSize: 28,
    fontWeight: "900",
    marginBottom: 15,
  },
  vendorPanel: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    marginBottom: 25,
    backgroundColor: "#f8fafc",
  },
  noticePanel: {
    borderWidth: 1,
    borderColor: "#fed7aa",
    borderRadius: 8,
    padding: 14,
    marginBottom: 18,
    backgroundColor: "#fff7ed",
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#9a3412",
  },
  noticeText: {
    color: "#7c2d12",
    marginTop: 6,
    lineHeight: 20,
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 22,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#f9fafb",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },
  summaryLabel: {
    color: "#6b7280",
    marginTop: 4,
    fontSize: 12,
  },
  vendorName: {
    fontSize: 20,
    fontWeight: "700",
  },
  vendorCode: {
    marginTop: 4,
    fontWeight: "900",
    color: "#1166ff",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 10,
  },
  terminalBox: {
    padding: 15,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 15,
    backgroundColor: "#f5f5f5",
  },
  emptyBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 14,
    marginBottom: 18,
    backgroundColor: "#f9fafb",
  },
  emptyTitle: {
    fontWeight: "900",
    color: "#111827",
  },
  emptyText: {
    color: "#6b7280",
    marginTop: 5,
    lineHeight: 19,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  actionCard: {
    width: "48%",
    minWidth: 260,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderTopWidth: 4,
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#fff",
  },
  actionDisabled: {
    backgroundColor: "#f9fafb",
    opacity: 0.9,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },
  actionText: {
    color: "#4b5563",
    marginTop: 6,
    lineHeight: 19,
  },
  actionStatus: {
    marginTop: 10,
    fontWeight: "900",
  },
  terminalName: {
    fontSize: 16,
    fontWeight: "800",
  },
  terminalDetails: {
    opacity: 0.7,
  },
  btn: {
    padding: 15,
    marginTop: 15,
    borderRadius: 10,
  },
  btnText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "800",
    fontSize: 16,
  },
});

