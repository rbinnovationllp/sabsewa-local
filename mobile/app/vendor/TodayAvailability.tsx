import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/lib/supabase";
import { apiUrl } from "@/lib/backend";

const STATUS_OPTIONS = [
  { key: "available", label: "Available" },
  { key: "limited_stock", label: "Limited" },
  { key: "temporarily_unavailable", label: "Not Available" },
  { key: "out_of_stock", label: "Out of Stock" },
  { key: "available_on_request", label: "On Request" },
];

const POLICIES = [
  ["keep_last_confirmed", "Keep last confirmed status"],
  ["confirm_every_day", "Ask me every day"],
  ["auto_unavailable_fresh", "Fresh items unavailable each morning"],
];

function productLabel(item: any) {
  const parts = [item.generic_product_name || item.item_name, item.brand_name, item.variant_name, item.pack_size && item.pack_unit ? `${item.pack_size} ${item.pack_unit}` : ""].filter(Boolean);
  return parts.join(" - ");
}

export default function TodayAvailabilityScreen() {
  const params: any = useLocalSearchParams();
  const { user } = useAuth();
  const terminalId = params.terminal as string | undefined;
  const vendorParam = params.vendor as string | undefined;

  const [vendorId, setVendorId] = useState<string | null>(vendorParam || null);
  const [items, setItems] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [search, setSearch] = useState("");
  const [bulkStatus, setBulkStatus] = useState("available");
  const [bulkSelected, setBulkSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    resolveVendorAndLoad();
  }, []);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => productLabel(item).toLowerCase().includes(term) || String(item.category || "").toLowerCase().includes(term));
  }, [items, search]);

  async function resolveVendorAndLoad() {
    let resolvedVendorId = vendorParam || null;
    if (!resolvedVendorId && user?.id) {
      const { data } = await supabase.from("vendors").select("id").eq("owner_user_id", user.id).single();
      resolvedVendorId = data?.id || null;
    }
    setVendorId(resolvedVendorId);
    if (resolvedVendorId) await loadItems(resolvedVendorId);
    setLoading(false);
  }

  async function loadItems(nextVendorId = vendorId) {
    if (!nextVendorId) return;
    const query = new URLSearchParams({ vendor_id: nextVendorId });
    if (terminalId) query.set("terminal_id", terminalId);
    const response = await fetch(apiUrl(`/api/vendor/availability/items?${query.toString()}`));
    const json = await response.json();
    if (!response.ok || !json.success) {
      Alert.alert("Availability", json.error || "Unable to load catalogue.");
      return;
    }
    setItems(json.items || []);
    setDrafts(
      Object.fromEntries(
        (json.items || []).map((item: any) => [
          item.id,
          {
            status: item.daily_availability_status || (item.available_today === false ? "temporarily_unavailable" : "available"),
            quantity: item.daily_stock_quantity == null ? "" : String(item.daily_stock_quantity),
            price: item.price == null ? "" : String(item.price),
            reason: item.daily_availability_reason || "",
            expected_restock_at: item.expected_restock_at || "",
            availability_review_policy: item.availability_review_policy || "keep_last_confirmed",
          },
        ])
      )
    );
  }

  function updateDraft(itemId: string, patch: any) {
    setDrafts((current) => ({ ...current, [itemId]: { ...(current[itemId] || {}), ...patch } }));
  }

  function toggleSelected(itemId: string) {
    setBulkSelected((current) => ({ ...current, [itemId]: !current[itemId] }));
  }

  function applyBulkStatus() {
    const selectedIds = Object.keys(bulkSelected).filter((id) => bulkSelected[id]);
    if (selectedIds.length === 0) {
      Alert.alert("Select items", "Select at least one product before applying a bulk status.");
      return;
    }
    selectedIds.forEach((id) => updateDraft(id, { status: bulkStatus }));
  }

  function restoreYesterday() {
    setDrafts(
      Object.fromEntries(
        items.map((item) => [
          item.id,
          {
            status: item.daily_availability_status || (item.available_today === false ? "temporarily_unavailable" : "available"),
            quantity: item.daily_stock_quantity == null ? "" : String(item.daily_stock_quantity),
            price: item.price == null ? "" : String(item.price),
            reason: "Restored last confirmed availability",
            expected_restock_at: item.expected_restock_at || "",
            availability_review_policy: item.availability_review_policy || "keep_last_confirmed",
          },
        ])
      )
    );
  }

  async function saveAll() {
    if (!vendorId) {
      Alert.alert("Vendor profile needed", "Please login with a vendor account.");
      return;
    }
    setSaving(true);
    try {
      const updates = items.map((item) => ({
        item_id: item.id,
        ...drafts[item.id],
      }));
      const response = await fetch(apiUrl("/api/vendor/availability/bulk-update"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor_id: vendorId, terminal_id: terminalId || null, actor_user_id: user?.id || null, updates }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to save availability.");
      Alert.alert("Saved", "Today's catalogue availability has been updated.");
      await loadItems(vendorId);
    } catch (error) {
      Alert.alert("Not saved", error instanceof Error ? error.message : "Unable to save availability.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Loading today's catalogue...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Today's Availability</Text>
      <Text style={styles.note}>Review what customers can order today. Do not delete products just because stock is temporarily unavailable.</Text>

      <View style={styles.reminderBox}>
        <Text style={styles.reminderTitle}>Daily reminder choices</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={restoreYesterday}><Text style={styles.secondaryText}>Use yesterday's availability</Text></TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => Alert.alert("Update today's catalogue", "Change products below and press Save all daily changes.")}><Text style={styles.secondaryText}>Update today</Text></TouchableOpacity>
          <TouchableOpacity style={styles.pauseBtn} onPress={() => { setBulkSelected(Object.fromEntries(items.map((item) => [item.id, true]))); setBulkStatus("temporarily_unavailable"); }}><Text style={styles.pauseText}>Pause order acceptance</Text></TouchableOpacity>
        </View>
      </View>

      <TextInput style={styles.input} placeholder="Search by product, brand or category" value={search} onChangeText={setSearch} />

      <Text style={styles.label}>Bulk update selected items</Text>
      <View style={styles.optionRow}>
        {STATUS_OPTIONS.map((option) => (
          <TouchableOpacity key={option.key} style={[styles.statusChip, bulkStatus === option.key && styles.statusSelected]} onPress={() => setBulkStatus(option.key)}>
            <Text style={[styles.statusText, bulkStatus === option.key && styles.statusSelectedText]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.bulkBtn} onPress={applyBulkStatus}><Text style={styles.bulkText}>Apply to selected products</Text></TouchableOpacity>

      {filteredItems.map((item) => {
        const draft = drafts[item.id] || {};
        return (
          <View key={item.id} style={styles.card}>
            <View style={styles.cardTop}>
              <TouchableOpacity style={[styles.checkbox, bulkSelected[item.id] && styles.checked]} onPress={() => toggleSelected(item.id)}>
                {bulkSelected[item.id] ? <Text style={styles.checkText}>✓</Text> : null}
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{productLabel(item)}</Text>
                <Text style={styles.muted}>Last reviewed: {item.availability_reviewed_at ? new Date(item.availability_reviewed_at).toLocaleString() : "Not reviewed today"}</Text>
              </View>
            </View>

            <View style={styles.optionRow}>
              {STATUS_OPTIONS.map((option) => (
                <TouchableOpacity key={option.key} style={[styles.statusChip, draft.status === option.key && styles.statusSelected]} onPress={() => updateDraft(item.id, { status: option.key })}>
                  <Text style={[styles.statusText, draft.status === option.key && styles.statusSelectedText]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.row}>
              <TextInput style={[styles.input, styles.flex]} placeholder="Quantity" keyboardType="numeric" value={draft.quantity} onChangeText={(value) => updateDraft(item.id, { quantity: value })} />
              <TextInput style={[styles.input, styles.flex]} placeholder="Daily price" keyboardType="numeric" value={draft.price} onChangeText={(value) => updateDraft(item.id, { price: value })} />
            </View>

            <TextInput style={styles.input} placeholder="Reason, e.g. stock sold / seasonal / brand unavailable" value={draft.reason} onChangeText={(value) => updateDraft(item.id, { reason: value })} />
            <TextInput style={styles.input} placeholder="Expected restock, e.g. 2026-07-30 10:00" value={draft.expected_restock_at} onChangeText={(value) => updateDraft(item.id, { expected_restock_at: value })} />

            <Text style={styles.label}>Daily review policy</Text>
            <View style={styles.optionRow}>
              {POLICIES.map(([value, label]) => (
                <TouchableOpacity key={value} style={[styles.policyChip, draft.availability_review_policy === value && styles.policySelected]} onPress={() => updateDraft(item.id, { availability_review_policy: value })}>
                  <Text style={[styles.policyText, draft.availability_review_policy === value && styles.policySelectedText]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}

      <TouchableOpacity style={[styles.saveBtn, saving && styles.disabled]} onPress={saveAll} disabled={saving}>
        <Text style={styles.saveText}>{saving ? "Saving..." : "Save all daily changes"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 50 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  heading: { fontSize: 28, fontWeight: "900", marginBottom: 8 },
  note: { color: "#4b5563", lineHeight: 20, marginBottom: 14 },
  reminderBox: { borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", borderRadius: 10, padding: 12, marginBottom: 14 },
  reminderTitle: { color: "#9a3412", fontWeight: "900", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, padding: 12, marginBottom: 10 },
  label: { fontWeight: "900", marginBottom: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  flex: { flex: 1, minWidth: 130 },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  statusChip: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: "#fff" },
  statusSelected: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  statusText: { color: "#334155", fontWeight: "900" },
  statusSelectedText: { color: "#fff" },
  policyChip: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, padding: 9 },
  policySelected: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  policyText: { color: "#374151", fontWeight: "800" },
  policySelectedText: { color: "#fff" },
  bulkBtn: { backgroundColor: "#1166ff", borderRadius: 10, padding: 13, marginBottom: 14 },
  bulkText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  card: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, padding: 14, marginBottom: 12, backgroundColor: "#fff" },
  cardTop: { flexDirection: "row", gap: 10, marginBottom: 10 },
  checkbox: { width: 26, height: 26, borderRadius: 7, borderWidth: 1, borderColor: "#94a3b8", alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  checkText: { color: "#fff", fontWeight: "900" },
  itemTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  muted: { color: "#6b7280", fontSize: 12 },
  secondaryBtn: { borderWidth: 1, borderColor: "#9a3412", borderRadius: 8, padding: 9 },
  secondaryText: { color: "#9a3412", fontWeight: "900" },
  pauseBtn: { backgroundColor: "#b91c1c", borderRadius: 8, padding: 9 },
  pauseText: { color: "#fff", fontWeight: "900" },
  saveBtn: { backgroundColor: "#16a34a", borderRadius: 12, padding: 15, marginTop: 8 },
  saveText: { color: "#fff", textAlign: "center", fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.6 },
});
