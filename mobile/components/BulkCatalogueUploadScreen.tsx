import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import BrandHeader from "@/components/BrandHeader";
import { apiUrl } from "@/lib/backend";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

type BulkRow = {
  row_number: number;
  status: "valid" | "duplicate" | "error";
  product_name: string;
  brand_name?: string | null;
  category?: string;
  pack_size?: number | null;
  pack_unit?: string | null;
  pack_text?: string | null;
  price?: number | null;
  mrp?: number | null;
  available_today?: boolean;
  image_url?: string | null;
  errors?: string[];
  duplicate_reason?: string;
  confidence?: number;
  review_required?: boolean;
  review_reason?: string | null;
};

type Preview = {
  file_name?: string;
  file_names?: string[];
  source?: string;
  notes?: string | null;
  summary: {
    total_rows: number;
    valid_count: number;
    duplicate_count: number;
    error_count: number;
    review_required_count?: number;
    clear_count?: number;
  };
  rows: BulkRow[];
};

function appendPickedFile(formData: FormData, asset: DocumentPicker.DocumentPickerAsset) {
  const webFile = (asset as any).file;
  if (webFile) {
    formData.append("file", webFile);
    return;
  }
  formData.append("file", {
    uri: asset.uri,
    name: asset.name || "catalogue.csv",
    type: asset.mimeType || "text/csv",
  } as any);
}

function appendListFile(formData: FormData, asset: any, fallbackName: string) {
  const webFile = asset.file;
  if (webFile) {
    formData.append("files", webFile);
    return;
  }
  formData.append("files", {
    uri: asset.uri,
    name: asset.fileName || asset.name || fallbackName,
    type: asset.mimeType || asset.type || "image/jpeg",
  } as any);
}

function money(value?: number | null) {
  return value == null || value === undefined ? "Not set" : `Rs ${Number(value).toFixed(2)}`;
}

function normalizeEditableNumber(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  return cleaned ? Number(cleaned) : null;
}

export default function BulkCatalogueUploadScreen({ assisted = false }: { assisted?: boolean }) {
  const router = useRouter();
  const params: any = useLocalSearchParams();
  const { user } = useAuth();
  const [vendorId, setVendorId] = useState<string>((params.vendor as string) || "");
  const [terminalId, setTerminalId] = useState<string>((params.terminal as string) || "");
  const [terminals, setTerminals] = useState<any[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<"excel" | "scan">("excel");

  useEffect(() => {
    resolveVendor();
  }, [user?.id]);

  const validRows = useMemo(() => (preview?.rows || []).filter((row) => row.status === "valid" && row.product_name.trim()), [preview]);

  async function resolveVendor() {
    let nextVendorId = vendorId;
    if (!assisted && !nextVendorId && user?.id) {
      const { data } = await supabase.from("vendors").select("id").eq("owner_user_id", user.id).single();
      nextVendorId = data?.id || "";
      setVendorId(nextVendorId);
    }
    if (nextVendorId) {
      const { data } = await supabase
        .from("vendor_terminals")
        .select("id, terminal_name, public_terminal_id")
        .eq("vendor_id", nextVendorId)
        .order("created_at");
      setTerminals(data || []);
      if (!terminalId && data?.[0]?.id) setTerminalId(data[0].id);
    }
  }

  async function downloadTemplate() {
    await Linking.openURL(apiUrl("/api/catalog/setup/bulk-template.csv"));
  }

  async function pickAndPreviewExcel() {
    if (!vendorId) {
      Alert.alert("Vendor profile required", assisted ? "Search the vendor by mobile number, owner/shop name or locality in Company CRM, then open this tool with the correct internal vendor reference." : "Please login with the registered vendor account. Your vendor profile will be linked automatically.");
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "text/csv",
        "application/csv",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const formData = new FormData();
    formData.append("vendor_id", vendorId);
    if (terminalId) formData.append("terminal_id", terminalId);
    appendPickedFile(formData, result.assets[0]);

    setMode("excel");
    await submitPreview("/api/catalog/setup/bulk-preview", formData);
  }

  async function scanWithCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera permission", "Camera permission is needed to scan a printed product list.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const formData = baseScanFormData();
    appendListFile(formData, result.assets[0], "product-list-photo.jpg");
    setMode("scan");
    await submitPreview("/api/catalog/setup/list-scan-preview", formData);
  }

  async function scanFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 8,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return;
    const formData = baseScanFormData();
    result.assets.slice(0, 8).forEach((asset, index) => appendListFile(formData, asset, `product-list-page-${index + 1}.jpg`));
    setMode("scan");
    await submitPreview("/api/catalog/setup/list-scan-preview", formData);
  }

  async function scanFromFiles() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const formData = baseScanFormData();
    result.assets.slice(0, 8).forEach((asset, index) => appendListFile(formData, asset, `product-list-page-${index + 1}`));
    setMode("scan");
    await submitPreview("/api/catalog/setup/list-scan-preview", formData);
  }

  function baseScanFormData() {
    if (!vendorId) {
      throw new Error(assisted ? "Search the vendor by mobile number, owner/shop name or locality in Company CRM, then open this tool with the correct internal vendor reference." : "Vendor profile is required. Please login with the registered vendor account.");
    }
    const formData = new FormData();
    formData.append("vendor_id", vendorId);
    if (terminalId) formData.append("terminal_id", terminalId);
    if (user?.id) formData.append("actor_user_id", user.id);
    return formData;
  }

  async function submitPreview(path: string, formData: FormData) {
    setLoading(true);
    setPreview(null);
    try {
      const response = await fetch(apiUrl(path), { method: "POST", body: formData });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to preview file.");
      setPreview(json);
    } catch (error) {
      Alert.alert("Bulk catalogue", error instanceof Error ? error.message : "Unable to preview file.");
    } finally {
      setLoading(false);
    }
  }

  function updateRow(index: number, patch: Partial<BulkRow>) {
    if (!preview) return;
    const rows = preview.rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, ...patch };
      next.status = next.product_name.trim() ? "valid" : "error";
      next.errors = next.product_name.trim() ? [] : ["Product/Medicine Name is mandatory."];
      next.review_required = false;
      return next;
    });
    setPreview({ ...preview, rows, summary: summarizeClientRows(rows) });
  }

  function deleteRow(index: number) {
    if (!preview) return;
    const rows = preview.rows.filter((_row, rowIndex) => rowIndex !== index);
    setPreview({ ...preview, rows, summary: summarizeClientRows(rows) });
  }

  function addManualRow() {
    const rows = [
      ...(preview?.rows || []),
      {
        row_number: (preview?.rows?.length || 0) + 2,
        status: "error" as const,
        product_name: "",
        category: "other",
        errors: ["Product/Medicine Name is mandatory."],
        review_required: true,
      },
    ];
    setPreview({
      file_name: preview?.file_name || "Manual correction",
      source: preview?.source || mode,
      summary: summarizeClientRows(rows),
      rows,
    });
  }

  function summarizeClientRows(rows: BulkRow[]) {
    return {
      total_rows: rows.length,
      valid_count: rows.filter((row) => row.status === "valid" && row.product_name.trim()).length,
      duplicate_count: rows.filter((row) => row.status === "duplicate").length,
      error_count: rows.filter((row) => row.status === "error" || !row.product_name.trim()).length,
      review_required_count: rows.filter((row) => row.review_required && row.status === "valid").length,
      clear_count: rows.filter((row) => !row.review_required && row.status === "valid").length,
    };
  }

  async function importRows() {
    if (!preview || validRows.length === 0) {
      Alert.alert("No valid rows", "There are no valid rows to import.");
      return;
    }
    setImporting(true);
    try {
      const response = await fetch(apiUrl("/api/catalog/setup/bulk-import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_id: vendorId,
          terminal_id: terminalId || null,
          actor_user_id: user?.id || null,
          rows: validRows,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to import products.");
      Alert.alert("Bulk import complete", `${json.imported_count || 0} products imported. ${json.skipped_count || 0} skipped.`);
      if (assisted) setPreview(null);
      else router.replace(`/vendor/CatalogueSetup?vendor=${vendorId}${terminalId ? `&terminal=${terminalId}` : ""}` as any);
    } catch (error) {
      Alert.alert("Bulk import failed", error instanceof Error ? error.message : "Unable to import products.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle={assisted ? "Company Master CRM" : "Vendor catalogue setup"} />
      <Text style={styles.heading}>{assisted ? "Admin / Partner Assisted Bulk Upload" : "Bulk Upload Products"}</Text>
      <Text style={styles.note}>
        Product photographs are optional. Rows without images use the catalogue placeholder flow and can be edited later.
      </Text>

      <View style={styles.panel}>
        <Text style={styles.section}>Vendor and branch</Text>
        {assisted ? (
          <TextInput style={styles.input} placeholder="Internal vendor reference (Admin only)" value={vendorId} onChangeText={setVendorId} onBlur={resolveVendor} />
        ) : (
          <Text style={styles.note}>Vendor profile is linked automatically from your logged-in account. SabSewa uses the internal vendor reference only for secure backend records.</Text>
        )}
        {terminals.length > 0 ? (
          <View style={styles.wrap}>
            {terminals.map((terminal) => (
              <TouchableOpacity key={terminal.id} style={[styles.chip, terminalId === terminal.id && styles.chipActive]} onPress={() => setTerminalId(terminal.id)}>
                <Text style={[styles.chipText, terminalId === terminal.id && styles.chipTextActive]}>{terminal.terminal_name || terminal.public_terminal_id || "Branch"}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <TextInput style={styles.input} placeholder="Terminal ID, optional" value={terminalId} onChangeText={setTerminalId} />
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>Option 2 - Bulk Upload through Excel/CSV</Text>
        <Text style={styles.note}>Best for structured digital lists. Minimum required column: Product/Medicine Name.</Text>
        <TouchableOpacity style={styles.secondaryBtn} onPress={downloadTemplate}>
          <Text style={styles.secondaryText}>Download Sample Excel/CSV Template</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryBtn} onPress={pickAndPreviewExcel} disabled={loading}>
          <Text style={styles.primaryText}>{loading && mode === "excel" ? "Reading file..." : "Upload Excel/CSV and Preview"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>Option 3 - Scan / Upload Existing Product List</Text>
        <Text style={styles.note}>
          Take photos of a printed, handwritten or scanned product list, or upload an existing PDF/document. AI extracts only visible information and marks unclear rows for review.
        </Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.secondaryBtn, styles.flex]} onPress={scanWithCamera} disabled={loading}>
            <Text style={styles.secondaryText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, styles.flex]} onPress={scanFromGallery} disabled={loading}>
            <Text style={styles.secondaryText}>Gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryBtn, styles.flex]} onPress={scanFromFiles} disabled={loading}>
            <Text style={styles.secondaryText}>PDF / Document</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator />
          <Text style={styles.note}>{mode === "scan" ? "Extracting product list. Please wait..." : "Preparing preview..."}</Text>
        </View>
      ) : null}

      {preview ? (
        <View style={styles.panel}>
          <Text style={styles.section}>Review Before Import</Text>
          <Text style={styles.note}>{preview.file_name || preview.file_names?.join(", ") || "Uploaded list"} {preview.notes ? `- ${preview.notes}` : ""}</Text>
          <View style={styles.metricRow}>
            <Text style={styles.metric}>{preview.summary.total_rows} detected</Text>
            <Text style={styles.metric}>{preview.summary.clear_count ?? preview.summary.valid_count} clear</Text>
            <Text style={styles.metric}>{preview.summary.review_required_count || 0} require review</Text>
            <Text style={styles.metric}>Duplicates: {preview.summary.duplicate_count}</Text>
            <Text style={styles.metric}>Errors: {preview.summary.error_count}</Text>
          </View>
          <TouchableOpacity style={styles.secondaryBtn} onPress={addManualRow}>
            <Text style={styles.secondaryText}>Add Missing Item Manually</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryBtn, (validRows.length === 0 || importing) && styles.disabled]} onPress={importRows} disabled={validRows.length === 0 || importing}>
            <Text style={styles.primaryText}>{importing ? "Importing..." : `Add ${validRows.length} reviewed products to catalogue`}</Text>
          </TouchableOpacity>

          {preview.rows.slice(0, 160).map((row, index) => (
            <View key={`${row.row_number}-${index}`} style={[styles.rowCard, row.status === "valid" ? styles.validRow : row.status === "duplicate" ? styles.duplicateRow : styles.errorRow]}>
              <View style={styles.rowHeader}>
                <Text style={styles.productTitle}>Row {row.row_number}</Text>
                <TouchableOpacity onPress={() => deleteRow(index)}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
              <TextInput style={styles.input} placeholder="Product/Medicine Name" value={row.product_name} onChangeText={(value) => updateRow(index, { product_name: value })} />
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.flex]} placeholder="Brand" value={row.brand_name || ""} onChangeText={(value) => updateRow(index, { brand_name: value })} />
                <TextInput style={[styles.input, styles.flex]} placeholder="Category" value={row.category || ""} onChangeText={(value) => updateRow(index, { category: value })} />
              </View>
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.flex]} placeholder="Pack / Unit" value={row.pack_text || row.pack_unit || ""} onChangeText={(value) => updateRow(index, { pack_text: value, pack_unit: value })} />
                <TextInput style={[styles.input, styles.flex]} placeholder="Selling Price" keyboardType="numeric" value={row.price == null ? "" : String(row.price)} onChangeText={(value) => updateRow(index, { price: normalizeEditableNumber(value) })} />
                <TextInput style={[styles.input, styles.flex]} placeholder="MRP" keyboardType="numeric" value={row.mrp == null ? "" : String(row.mrp)} onChangeText={(value) => updateRow(index, { mrp: normalizeEditableNumber(value) })} />
              </View>
              <Text style={row.status === "error" ? styles.errorText : row.status === "duplicate" ? styles.warningText : row.review_required ? styles.warningText : styles.successText}>
                {row.status === "valid" && !row.review_required ? "Ready to import" : row.status === "valid" ? row.review_reason || "Please review this extracted row." : row.status === "duplicate" ? row.duplicate_reason || "Duplicate" : row.errors?.join(" ")}
              </Text>
              {row.confidence != null ? <Text style={styles.muted}>Extraction confidence: {Math.round(Number(row.confidence) * 100)}%</Text> : null}
            </View>
          ))}
          {preview.rows.length > 160 ? <Text style={styles.muted}>Showing first 160 rows only. Split very large scans into smaller sessions for easier review.</Text> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 70, paddingBottom: 50, paddingHorizontal: 20, backgroundColor: "#fff", minHeight: "100%" },
  heading: { fontSize: 28, fontWeight: "900", color: "#111827", marginBottom: 8 },
  note: { color: "#475569", lineHeight: 20, marginBottom: 12 },
  panel: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginBottom: 14, backgroundColor: "#fff" },
  section: { fontSize: 18, fontWeight: "900", color: "#111827", marginBottom: 10 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, padding: 12, marginBottom: 10, color: "#111827", minHeight: 44 },
  row: { flexDirection: "row", gap: 10, alignItems: "stretch" },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  flex: { flex: 1 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "#fff" },
  chipActive: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  chipText: { fontWeight: "800", color: "#334155" },
  chipTextActive: { color: "#fff" },
  primaryBtn: { backgroundColor: "#1166ff", borderRadius: 8, padding: 15, marginTop: 8 },
  primaryText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  secondaryBtn: { borderWidth: 1, borderColor: "#1166ff", borderRadius: 8, padding: 14, marginBottom: 8 },
  secondaryText: { color: "#1166ff", fontWeight: "900", textAlign: "center" },
  disabled: { opacity: 0.55 },
  loadingBox: { alignItems: "center", padding: 16 },
  metricRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  metric: { fontWeight: "900", color: "#0f766e", backgroundColor: "#ecfdf5", padding: 8, borderRadius: 8 },
  rowCard: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8 },
  validRow: { borderColor: "#86efac", backgroundColor: "#f0fdf4" },
  duplicateRow: { borderColor: "#fdba74", backgroundColor: "#fff7ed" },
  errorRow: { borderColor: "#fca5a5", backgroundColor: "#fef2f2" },
  productTitle: { fontWeight: "900", color: "#111827", marginBottom: 4 },
  muted: { color: "#64748b", lineHeight: 18 },
  successText: { color: "#15803d", fontWeight: "900", marginTop: 4 },
  warningText: { color: "#9a3412", fontWeight: "900", marginTop: 4 },
  errorText: { color: "#991b1b", fontWeight: "900", marginTop: 4 },
  deleteText: { color: "#b91c1c", fontWeight: "900" },
});