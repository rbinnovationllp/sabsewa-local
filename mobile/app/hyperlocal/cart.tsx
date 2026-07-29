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
  product_variant_id?: string;
  price_display_mode?: "show_price" | "hide_price" | "market_price";
  price_unit_label?: string;
};

type CartLine = VendorItem & {
  qty: number;
  total: number;
  price_quote_required?: boolean;
  price_label?: string;
};

export default function SabSewaLocalCartScreen() {
  const params: any = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const vendorId = String(params.vendor || "");
  const terminalId = String(params.terminal || "");
  const rawCartData = String(params.cartData || "{}");

  const [lines, setLines] = useState<CartLine[]>([]);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [notice, setNotice] = useState("");

  const total = useMemo(
    () => lines.reduce((sum, line) => sum + (line.price_quote_required ? 0 : line.total), 0),
    [lines]
  );
  const hasQuoteItems = lines.some((line) => line.price_quote_required);

  useEffect(() => {
    loadCartItems();
  }, [rawCartData]);

  async function loadCartItems() {
    setLoading(true);

    let cart: Record<string, number> = {};
    try {
      cart = JSON.parse(rawCartData);
    } catch {
      cart = {};
    }

    const itemIds = Object.keys(cart).filter((id) => cart[id] > 0);
    if (itemIds.length === 0) {
      setLines([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("vendor_items")
      .select("id, item_name, price, item_pic, is_available, available_today, stock_status, daily_availability_status, expected_restock_at, generic_product_name, brand_name, variant_name, pack_size, pack_unit, product_variant_id, price_display_mode, price_unit_label")
      .in("id", itemIds)
      .eq("is_available", true)
      .eq("available_today", true)
      .neq("stock_status", "out_of_stock")
      .not("daily_availability_status", "in", "(temporarily_unavailable,out_of_stock)");

    if (error) {
      Alert.alert("Cart error", error.message);
      setLines([]);
      setLoading(false);
      return;
    }

    const availableIds = new Set((data || []).map((item: VendorItem) => item.id));
    const removedCount = itemIds.filter((id) => !availableIds.has(id)).length;
    if (removedCount > 0) {
      Alert.alert("Cart updated", "Some items are not available from this vendor today and were removed.");
    }

    setLines(
      (data || []).map((item: VendorItem) => {
        const qty = Number(cart[item.id] || 0);
        const quoteRequired = item.price_display_mode === "hide_price" || item.price_display_mode === "market_price" || item.daily_availability_status === "available_on_request";
        const price = quoteRequired ? 0 : Number(item.price);
        const priceLabel = quoteRequired
          ? item.price_display_mode === "market_price"
            ? "Market Price"
            : "Price on Request"
          : `Rs ${price.toFixed(2)}${item.price_unit_label ? `/${item.price_unit_label}` : ""}`;
        return { ...item, price, qty, total: price * qty, price_quote_required: quoteRequired, price_label: priceLabel };
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
      setNotice("Please login before placing an order. This protects order history, delivery details and credit records.");
      Alert.alert("Login required", "Please login before placing an order.");
      return;
    }

    if (!vendorId || !terminalId) {
      setNotice("Please select a nearby vendor first. The cart must be linked to one verified shop and terminal.");
      Alert.alert("Missing shop", "Please select a vendor and terminal again.");
      return;
    }

    if (lines.length === 0) {
      setNotice("Your cart is empty. Find a nearby vendor or place an order to add items first.");
      Alert.alert("Empty cart", "Please add at least one item.");
      return;
    }

    if (!address.trim() || !phone.trim()) {
      setNotice("Enter delivery address and phone number before placing the order.");
      Alert.alert("Delivery details required", "Please enter address and phone.");
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
        })),
        customer_address: address.trim(),
        customer_phone: phone.trim(),
        payment_method: paymentMethod,
      };

      const response = await fetch(apiUrl("/api/order/place"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (!response.ok || !json.success) {
        throw new Error(json.error || json.message || "Order failed");
      }

      Alert.alert(
        "Order placed",
        paymentMethod === "credit"
          ? "Your vendor-credit order has been sent to the vendor."
          : hasQuoteItems
            ? "Your request has been sent to the vendor. The vendor must quote the hidden/market price before final acceptance."
            : "Your order has been sent to the vendor. Pay the vendor directly using the payment method accepted by that vendor."
      );
      router.replace({
        pathname: "/customer/track",
        params: { order_id: json.order?.id || json.order_id },
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Order failed. Please try again.");
      Alert.alert("Order failed", error instanceof Error ? error.message : "Unknown error");
    } finally {
      setPlacing(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading cart...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>SabSewa Local Cart</Text>

      {lines.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptyText}>
            Select a nearby vendor and available-today products before placing an order. Customer payment remains directly between you and the vendor.
          </Text>
          <TouchableOpacity style={styles.findBtn} onPress={() => router.push("/customer/discover" as any)}>
            <Text style={styles.placeText}>Find Nearby Vendors</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.aiBtn} onPress={() => router.push("/customer/GeminiOrder" as any)}>
            <Text style={styles.placeText}>Place Your Order</Text>
          </TouchableOpacity>
        </View>
      ) : (
        lines.map((line) => (
          <View key={line.id} style={styles.line}>
            <View style={styles.lineHeader}>
              <Text style={styles.itemName}>{line.item_name}</Text>
              <Text style={styles.price}>{line.price_quote_required ? "Ask Vendor" : `Rs ${line.total.toFixed(2)}`}</Text>
            </View>
            <Text style={styles.muted}>
              {[line.brand_name, line.variant_name, line.pack_size && line.pack_unit ? `${line.pack_size} ${line.pack_unit}` : ""].filter(Boolean).join(" - ") || line.generic_product_name || "Vendor listing"}
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
          </View>
        ))
      )}

      <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Order Total</Text>
        <Text style={styles.summaryTotal}>{hasQuoteItems ? `Known: Rs ${total.toFixed(2)}` : `Rs ${total.toFixed(2)}`}</Text>
      </View>
      {hasQuoteItems ? (
        <Text style={styles.quoteNote}>
          Some items need vendor quotation. The vendor will enter the proposed price, and you must approve it before the order becomes final.
        </Text>
      ) : null}

      {notice ? (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>Delivery Address</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        multiline
        value={address}
        onChangeText={setAddress}
        placeholder="House number, street, landmark"
      />

      <Text style={styles.label}>Phone Number</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="Customer phone number"
      />

      <TouchableOpacity
        style={[styles.placeBtn, placing && styles.disabled]}
        onPress={() => placeOrder("prepaid")}
        disabled={placing}
      >
        <Text style={styles.placeText}>{placing ? "Placing..." : "Place Direct-Payment Order"}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.creditBtn, placing && styles.disabled]}
        onPress={() => placeOrder("credit")}
        disabled={placing}
      >
        <Text style={styles.placeText}>Use Vendor-Approved Credit</Text>
      </TouchableOpacity>
      <Text style={styles.creditNote}>
        Order payment is a direct transaction between you and the selected vendor. SabSewa Local does not collect, settle, refund, or recover the order amount. Credit is offered only by the selected vendor; the app records the ledger only.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  heading: { fontSize: 26, fontWeight: "900", marginBottom: 18 },
  muted: { color: "#666" },
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
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  textArea: { minHeight: 88, textAlignVertical: "top" },
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
  disabled: { opacity: 0.55 },
  placeText: { color: "#fff", fontWeight: "900", fontSize: 16 },
});
