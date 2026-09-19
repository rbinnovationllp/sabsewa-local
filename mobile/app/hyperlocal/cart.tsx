import { useEffect, useMemo, useState } from "react";
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { apiUrl } from "@/lib/backend";
import { useLanguage } from "@/providers/LanguageProvider";

type VendorItem = {
  id: string;
  item_name: string;
  price: number;
  item_pic?: string;
  available_today?: boolean;
  is_available?: boolean;
  stock_status?: string;
  daily_availability_status?: string;
  expected_restock_at?: string;
  generic_product_name?: string;
  brand_name?: string;
  variant_name?: string;
  pack_size?: number;
  pack_unit?: string;
  master_product_id?: string;
  product_variant_id?: string;
  price_display_mode?: "show_price" | "hide_price" | "market_price";
  price_unit_label?: string;
};

type CartLine = VendorItem & {
  qty: number;
  total: number;
  price_quote_required?: boolean;
  price_label?: string;
  order_input_source?: string;
  selected_variant?: string | null;
  customer_selected_language?: string | null;
  customer_note?: string;
  selection_snapshot?: any;
};

export default function SabSewaLocalCartScreen() {
  const params: any = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();

  const vendorId = String(params.vendor || "");
  const terminalId = String(params.terminal || "");
  const rawCartData = String(params.cartData || "{}");

  const [lines, setLines] = useState<CartLine[]>([]);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [notice, setNotice] = useState("");
  const [deliverySettings, setDeliverySettings] = useState<any>(null);

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + (line.price_quote_required ? 0 : line.total), 0),
    [lines]
  );
  const hasQuoteItems = lines.some((line) => line.price_quote_required);
  const freeDeliveryMin = Number(deliverySettings?.free_delivery_min_order ?? 0);
  const minimumDeliveryOrderValue = Number(deliverySettings?.minimum_delivery_order_value ?? 0);
  const deliveryFee = deliverySettings?.delivery_available === false
    ? 0
    : total >= freeDeliveryMin
      ? 0
      : Number(deliverySettings?.delivery_fee_below_min ?? 0);
  const amountForFreeDelivery = Math.max(0, freeDeliveryMin - total);
  const amountForMinimumDelivery = Math.max(0, minimumDeliveryOrderValue - total);
  const totalPayable = total + deliveryFee;
  const deliveryWindow = deliverySettings
    ? `${deliverySettings.estimated_delivery_min_minutes ?? 30}-${deliverySettings.estimated_delivery_max_minutes ?? 60} minutes`
    : t("cart.vendorEstimatePending");

  useEffect(() => {
    loadCartItems();
    loadDeliverySettings();
  }, [rawCartData]);

  useEffect(() => {
    loadSavedCustomerDetails();
  }, [user?.id]);

  async function loadSavedCustomerDetails() {
    if (!user?.id) return;

    const [{ data: profile }, { data: savedAddress }] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("full_name, phone")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("customer_addresses")
        .select("full_address")
        .eq("customer_id", user.id)
        .eq("is_primary", true)
        .maybeSingle(),
    ]);

    if (profile?.full_name) setCustomerName(profile.full_name);
    if (profile?.phone) setPhone(profile.phone);
    if (savedAddress?.full_address) setAddress(savedAddress.full_address);
  }

  async function loadDeliverySettings() {
    if (!terminalId) return;
    const { data } = await supabase
      .from("vendor_terminals")
      .select("free_delivery_min_order, delivery_fee_below_min, minimum_delivery_order_value, estimated_delivery_min_minutes, estimated_delivery_max_minutes, delivery_available, pickup_available, delivery_provider_type")
      .eq("id", terminalId)
      .maybeSingle();
    setDeliverySettings(data || null);
  }

  async function loadCartItems() {
    setLoading(true);

    let cart: Record<string, any> = {};
    try {
      cart = JSON.parse(rawCartData);
    } catch {
      cart = {};
    }

    const itemIds = Object.keys(cart).filter((id) => {
      const value = cart[id];
      const qty = typeof value === "object" && value !== null ? Number(value.qty || value.quantity || 0) : Number(value || 0);
      return qty > 0;
    });
    if (itemIds.length === 0) {
      setLines([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("vendor_items")
      .select("id, item_name, price, item_pic, is_available, available_today, stock_status, daily_availability_status, expected_restock_at, generic_product_name, brand_name, variant_name, pack_size, pack_unit, master_product_id, product_variant_id, price_display_mode, price_unit_label")
      .in("id", itemIds)
      .eq("is_available", true)
      .eq("available_today", true)
      .neq("stock_status", "out_of_stock")
      .not("daily_availability_status", "in", "(temporarily_unavailable,out_of_stock)");

    if (error) {
      Alert.alert(t("cart.errorTitle"), error.message);
      setLines([]);
      setLoading(false);
      return;
    }

    const availableIds = new Set((data || []).map((item: VendorItem) => item.id));
    const removedCount = itemIds.filter((id) => !availableIds.has(id)).length;
    if (removedCount > 0) {
      Alert.alert(t("cart.updatedTitle"), t("cart.itemsRemoved"));
    }

    setLines(
      (data || []).map((item: VendorItem) => {
        const selection = cart[item.id];
        const qty = typeof selection === "object" && selection !== null
          ? Number(selection.qty || selection.quantity || 0)
          : Number(selection || 0);
        const quoteRequired = item.price_display_mode === "hide_price" || item.price_display_mode === "market_price" || item.daily_availability_status === "available_on_request";
        const price = quoteRequired ? 0 : Number(item.price);
        const priceLabel = quoteRequired
          ? t("cart.pricePendingVendor")
          : `Rs ${price.toFixed(2)}${item.price_unit_label ? `/${item.price_unit_label}` : ""}`;
        return {
          ...item,
          price,
          qty,
          total: price * qty,
          price_quote_required: quoteRequired,
          price_label: priceLabel,
          order_input_source: typeof selection === "object" && selection !== null ? selection.order_input_source || "catalogue_image" : "typed_or_catalogue",
          selected_variant: typeof selection === "object" && selection !== null ? selection.selected_variant || null : null,
          customer_selected_language: typeof selection === "object" && selection !== null ? selection.customer_selected_language || null : null,
          selection_snapshot: typeof selection === "object" && selection !== null ? selection : null,
          customer_note: "",
        };
      })
    );
    setLoading(false);
  }

  function updateQty(itemId: string, nextQty: number) {
    if (nextQty <= 0) {
      setLines((current) => current.filter((line) => line.id !== itemId));
      return;
    }

    setLines((current) =>
      current.map((line) =>
        line.id === itemId
          ? { ...line, qty: nextQty, total: line.price * nextQty }
          : line
      )
    );
  }

  async function placeOrder(paymentMethod: "prepaid" | "credit") {
    setNotice("");

    if (!user?.id) {
      setNotice(t("cart.loginRequiredNotice"));
      Alert.alert(t("cart.loginRequiredTitle"), t("cart.loginRequiredAlert"));
      return;
    }

    if (!vendorId || !terminalId) {
      setNotice(t("cart.missingShopNotice"));
      Alert.alert(t("cart.missingShopTitle"), t("cart.missingShopAlert"));
      return;
    }

    if (lines.length === 0) {
      setNotice(t("cart.emptyNotice"));
      Alert.alert(t("cart.emptyTitle"), t("cart.emptyAlert"));
      return;
    }

    if (minimumDeliveryOrderValue > 0 && total < minimumDeliveryOrderValue) {
      setNotice(t("cart.minimumDeliveryNotice", { minimum: `Rs ${minimumDeliveryOrderValue.toFixed(2)}`, amount: `Rs ${amountForMinimumDelivery.toFixed(2)}` }));
      Alert.alert(t("cart.minimumDeliveryTitle"), t("cart.minimumDeliveryAlert", { amount: `Rs ${amountForMinimumDelivery.toFixed(2)}` }));
      return;
    }

    if (!address.trim() || !phone.trim()) {
      setNotice(t("cart.deliveryDetailsNotice"));
      Alert.alert(t("cart.deliveryDetailsTitle"), t("cart.deliveryDetailsAlert"));
      return;
    }

    if (!addressConfirmed) {
      setNotice(t("cart.confirmAddressNotice"));
      Alert.alert(t("cart.confirmAddressTitle"), t("cart.confirmAddressAlert"));
      return;
    }

    setPlacing(true);

    try {
      const payload = {
        customer_id: user.id,
        terminal_id: terminalId,
        vendor_id: vendorId,
        items: lines.map((line) => ({
          item_id: line.id,
          item_name: line.item_name,
          qty: line.qty,
          price: line.price,
          price_quote_required: line.price_quote_required,
          product_variant_id: line.product_variant_id || null,
          master_product_id: line.master_product_id || null,
          selected_variant: line.selected_variant || null,
          unit: line.pack_unit || line.price_unit_label || null,
          order_input_source: line.order_input_source || "typed_or_catalogue",
          customer_selected_language: line.customer_selected_language || null,
          customer_note: line.customer_note?.trim() || null,
          selection_snapshot: line.selection_snapshot || null,
        })),
        customer_address: address.trim(),
        customer_name: customerName.trim(),
        customer_phone: phone.trim(),
        payment_method: paymentMethod,
        delivery_charge: deliveryFee,
        free_delivery_min_order: freeDeliveryMin,
        minimum_delivery_order_value: minimumDeliveryOrderValue,
        estimated_delivery_window: deliveryWindow,
        delivery_provider_type: deliverySettings?.delivery_provider_type || "vendor",
      };

      const response = await fetch(apiUrl("/api/order/place"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || json.message || t("cart.orderFailed"));
      }

      Alert.alert(
        t("cart.orderPlacedTitle"),
        paymentMethod === "credit"
          ? t("cart.creditOrderSent")
          : hasQuoteItems
            ? t("cart.quoteOrderSent")
            : t("cart.directOrderSent")
      );
      router.replace({
        pathname: "/customer/track",
        params: { order_id: json.order?.id || json.order_id },
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("cart.orderFailedRetry"));
      Alert.alert(t("cart.orderFailed"), error instanceof Error ? error.message : t("discovery.unknownError"));
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>{t("cart.loading")}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>{t("cart.title")}</Text>

      {lines.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t("cart.emptyTitle")}</Text>
          <Text style={styles.emptyText}>
            {t("cart.emptyText")}
          </Text>
          <TouchableOpacity style={styles.findBtn} onPress={() => router.push("/customer/discover" as any)}>
            <Text style={styles.placeText}>{t("cart.searchNearbyProducts")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.aiBtn} onPress={() => router.push("/customer/GeminiOrder" as any)}>
            <Text style={styles.placeText}>{t("cart.speakShoppingList")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        lines.map((line) => (
          <View key={line.id} style={styles.line}>
            <View style={styles.lineHeader}>
              <Text style={styles.itemName}>{line.item_name}</Text>
              <Text style={styles.price}>{line.price_quote_required ? t("cart.pricePending") : `Rs ${line.total.toFixed(2)}`}</Text>
            </View>
            <Text style={styles.muted}>
              {[line.brand_name, line.variant_name, line.pack_size && line.pack_unit ? `${line.pack_size} ${line.pack_unit}` : ""].filter(Boolean).join(" - ") || line.generic_product_name || t("cart.vendorListing")}
            </Text>
            <Text style={styles.sourceText}>
              {t("cart.source")}: {line.order_input_source === "catalogue_image" ? t("cart.selectedFromProductImage") : t("cart.cartItem")}{line.selected_variant ? ` | ${t("cart.variant")}: ${line.selected_variant}` : ""}
            </Text>
            <Text style={styles.muted}>{line.price_label || `Rs ${line.price.toFixed(2)} each`}</Text>

            <View style={styles.qtyRow}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => updateQty(line.id, line.qty - 1)}
              >
                <Text style={styles.qtyText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.qtyValue}>{line.qty}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => updateQty(line.id, line.qty + 1)}
              >
                <Text style={styles.qtyText}>+</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.itemInstructionInput}
              value={line.customer_note || ""}
              onChangeText={(value) =>
                setLines((current) =>
                  current.map((entry) => entry.id === line.id ? { ...entry, customer_note: value } : entry)
                )
              }
              placeholder={t("cart.itemInstructionPlaceholder")}
            />
          </View>
        ))
      )}

      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>{t("cart.orderTotal")}</Text>
        <Text style={styles.summaryTotal}>{hasQuoteItems ? `${t("cart.knownTotal")}: Rs ${total.toFixed(2)}` : `Rs ${total.toFixed(2)}`}</Text>
      </View>
      <View style={styles.deliveryBox}>
        <View style={styles.deliveryRow}>
          <Text style={styles.deliveryLabel}>{t("delivery.itemSubtotal")}</Text>
          <Text style={styles.deliveryValue}>Rs {total.toFixed(2)}</Text>
        </View>
        <View style={styles.deliveryRow}>
          <Text style={styles.deliveryLabel}>{t("delivery.charge")}</Text>
          <Text style={styles.deliveryValue}>Rs {deliveryFee.toFixed(2)}</Text>
        </View>
        <View style={styles.deliveryRow}>
          <Text style={styles.deliveryLabel}>{t("delivery.freeThreshold")}</Text>
          <Text style={styles.deliveryValue}>Rs {freeDeliveryMin.toFixed(2)}</Text>
        </View>
        {minimumDeliveryOrderValue > 0 && amountForMinimumDelivery > 0 ? (
          <Text style={styles.minimumHint}>
            {t("cart.minimumHint", { total: `Rs ${total.toFixed(2)}`, minimum: `Rs ${minimumDeliveryOrderValue.toFixed(2)}`, amount: `Rs ${amountForMinimumDelivery.toFixed(2)}` })}
          </Text>
        ) : null}
        {amountForFreeDelivery > 0 ? (
          <Text style={styles.freeHint}>
            {t("cart.freeDeliveryHint", { total: `Rs ${total.toFixed(2)}`, threshold: `Rs ${freeDeliveryMin.toFixed(2)}`, fee: `Rs ${deliveryFee.toFixed(2)}` })} {t("delivery.amountForFree", { amount: `Rs ${amountForFreeDelivery.toFixed(2)}` })}
          </Text>
        ) : null}
        <View style={styles.deliveryRow}>
          <Text style={styles.deliveryLabel}>{t("delivery.estimatedWindow")}</Text>
          <Text style={styles.deliveryValue}>{deliveryWindow}</Text>
        </View>
        <View style={styles.deliveryRow}>
          <Text style={styles.deliveryLabel}>{t("delivery.provider")}</Text>
          <Text style={styles.deliveryValue}>{deliverySettings?.delivery_provider_type === "authorised_provider" ? t("delivery.authorisedProvider") : t("delivery.vendorProvider")}</Text>
        </View>
        <View style={styles.deliveryRow}>
          <Text style={styles.deliveryLabel}>{t("delivery.totalPayable")}</Text>
          <Text style={styles.deliveryTotal}>Rs {totalPayable.toFixed(2)}</Text>
        </View>
        <Text style={styles.safetyText}>{t("delivery.safetyStatement")}</Text>
      </View>
      {hasQuoteItems ? (
        <Text style={styles.quoteNote}>
          {t("cart.quoteNote")}
        </Text>
      ) : null}

      {notice ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>{t("cart.deliveryAddress")}</Text>
      <View style={styles.confirmBox}>
        <Text style={styles.confirmTitle}>{t("cart.deliverTo")}</Text>
        <Text style={styles.confirmText}>{address.trim() || t("cart.noSavedAddress")}</Text>
        <Text style={styles.confirmHelp}>{t("cart.changeAddressHelp")}</Text>
      </View>
      <TextInput
        style={[styles.input, styles.textArea]}
        multiline
        value={address}
        onChangeText={setAddress}
        placeholder={t("cart.addressPlaceholder")}
      />

      <Text style={styles.label}>{t("auth.phoneNumber")}</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder={t("cart.customerPhonePlaceholder")}
      />

      <TouchableOpacity style={styles.confirmRow} onPress={() => setAddressConfirmed((value) => !value)}>
        <View style={[styles.checkbox, addressConfirmed && styles.checkboxChecked]}>
          {addressConfirmed ? <Text style={styles.checkboxText}>OK</Text> : null}
        </View>
        <Text style={styles.confirmRowText}>{t("cart.confirmDeliveryContact")}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.placeBtn, placing && styles.disabled]}
        onPress={() => placeOrder("prepaid")}
        disabled={placing}
      >
        <Text style={styles.placeText}>{placing ? t("cart.placing") : t("cart.placeDirectPaymentOrder")}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.creditBtn, placing && styles.disabled]}
        onPress={() => placeOrder("credit")}
        disabled={placing}
      >
        <Text style={styles.placeText}>{t("cart.useVendorCredit")}</Text>
      </TouchableOpacity>
      <Text style={styles.creditNote}>
        {t("cart.directPaymentDisclaimer")}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  heading: { fontSize: 26, fontWeight: "900", marginBottom: 18 },
  muted: { color: "#666" },
  sourceText: { color: "#0f766e", fontSize: 12, fontWeight: "800", marginTop: 4 },
  emptyCard: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  emptyTitle: { color: "#1e3a8a", fontWeight: "900", fontSize: 18 },
  emptyText: { color: "#1e40af", lineHeight: 20, marginTop: 6, marginBottom: 12 },
  findBtn: {
    backgroundColor: "#1166ff",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  aiBtn: {
    backgroundColor: "#0f766e",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  noticeBox: {
    borderWidth: 1,
    borderColor: "#fed7aa",
    backgroundColor: "#fff7ed",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  noticeText: { color: "#9a3412", fontWeight: "700", lineHeight: 20 },
  line: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  lineHeader: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  itemName: { flex: 1, fontSize: 16, fontWeight: "800" },
  price: { fontSize: 16, fontWeight: "900" },
  qtyRow: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  qtyBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: "#eee",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: { fontSize: 20, fontWeight: "900" },
  qtyValue: { minWidth: 44, textAlign: "center", fontSize: 16, fontWeight: "800" },
  itemInstructionInput: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, padding: 10, marginTop: 10 },
  summary: {
    marginTop: 8,
    marginBottom: 20,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#f5f7fb",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryLabel: { fontSize: 16, fontWeight: "800" },
  summaryTotal: { fontSize: 18, fontWeight: "900" },
  label: { fontWeight: "800", marginBottom: 8 },
  confirmBox: { borderWidth: 1, borderColor: "#99f6e4", backgroundColor: "#ecfeff", borderRadius: 10, padding: 12, marginBottom: 12 },
  confirmTitle: { color: "#0f766e", fontWeight: "900" },
  confirmText: { color: "#111827", marginTop: 4, lineHeight: 19 },
  confirmHelp: { color: "#64748b", marginTop: 4, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  textArea: { minHeight: 88, textAlignVertical: "top" },
  confirmRow: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 14 },
  checkbox: { width: 28, height: 28, borderWidth: 1, borderColor: "#777", borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  checkboxText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  confirmRowText: { flex: 1, color: "#374151", lineHeight: 18 },
  placeBtn: {
    backgroundColor: "#16a34a",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
  },
  creditBtn: {
    backgroundColor: "#7c3aed",
    padding: 15,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  creditNote: { color: "#555", fontSize: 12, marginTop: 10, lineHeight: 18 },
  quoteNote: { color: "#9a3412", fontSize: 12, marginBottom: 16, lineHeight: 18 },
  deliveryBox: { borderWidth: 1, borderColor: "#bfdbfe", backgroundColor: "#eff6ff", borderRadius: 10, padding: 12, marginBottom: 16 },
  deliveryRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 7 },
  deliveryLabel: { color: "#1e3a8a", fontWeight: "800", flex: 1 },
  deliveryValue: { color: "#111827", fontWeight: "700", textAlign: "right" },
  deliveryTotal: { color: "#0f766e", fontWeight: "900", textAlign: "right" },
  minimumHint: { color: "#b45309", fontWeight: "800", marginBottom: 7 },
  freeHint: { color: "#1d4ed8", fontWeight: "800", marginBottom: 7 },
  safetyText: { color: "#7c2d12", backgroundColor: "#fff7ed", borderRadius: 8, padding: 10, lineHeight: 18, fontSize: 12, marginTop: 6 },
  disabled: { opacity: 0.55 },
  placeText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
