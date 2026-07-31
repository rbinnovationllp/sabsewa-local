import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import BrandHeader from "@/components/BrandHeader";
import { apiUrl } from "@/lib/backend";
import { optimizeProductImage, validatePickedProductImage } from "@/lib/imageUploadPolicy";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

const CATEGORIES = [
  ["", "All"],
  ["vegetables", "Vegetables"],
  ["fruits", "Fruits"],
  ["kirana", "Kirana"],
  ["dairy", "Dairy"],
  ["bakery", "Bakery"],
  ["beverages", "Beverages"],
  ["household", "Household"],
  ["personal-care", "Personal care"],
  ["packaged-food", "Packaged food"],
  ["other", "Other"],
];

const PRICE_MODES = [
  ["show_price", "Show price"],
  ["hide_price", "Ask vendor"],
  ["market_price", "Market price"],
];

const RIGHTS_TEXT =
  "I own this image or have permission to use it, and I authorise SabSewa Local to make it available to other registered vendors for use in their digital shops.";

function productName(product: any) {
  return [product.standard_title, product.brand_name, product.pack_size].filter(Boolean).join(" - ");
}

function localNames(product: any) {
  const names = product.local_names || {};
  return [names.hi?.join?.(", "), names.kn?.join?.(", "), names.en?.join?.(", ")].filter(Boolean).join(" | ");
}

export default function CatalogueSetupScreen() {
  const router = useRouter();
  const params: any = useLocalSearchParams();
  const { user } = useAuth();

  const [vendorId, setVendorId] = useState<string | null>((params.vendor as string) || null);
  const [terminalId, setTerminalId] = useState<string | null>((params.terminal as string) || null);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [vendorItems, setVendorItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [availableToday, setAvailableToday] = useState(true);
  const [defaultPriceMode, setDefaultPriceMode] = useState<"show_price" | "hide_price" | "market_price">("hide_price");
  const [defaultPrice, setDefaultPrice] = useState("");
  const [defaultUnit, setDefaultUnit] = useState("");
  const [defaultStock, setDefaultStock] = useState("");
  const [defaultMaxQty, setDefaultMaxQty] = useState("");

  const [missingOpen, setMissingOpen] = useState(false);
  const [missing, setMissing] = useState<any>({
    product_name: "",
    local_name: "",
    category: "kirana",
    brand_name: "",
    variant_name: "",
    pack_size: "",
    pack_unit: "",
    description: "",
    price: "",
    price_display_mode: "hide_price",
    available_today: true,
    stock_quantity: "",
    max_order_quantity: "",
    barcode: "",
  });
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [photo, setPhoto] = useState<any>(null);
  const [shareImage, setShareImage] = useState(false);

  useEffect(() => {
    resolveVendor();
  }, [user?.id]);

  useEffect(() => {
    loadMasterProducts();
  }, [search, category, brandFilter]);

  useEffect(() => {
    if (vendorId) loadVendorItems(vendorId);
  }, [vendorId, terminalId]);

  const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);

  async function resolveVendor() {
    let nextVendorId = vendorId;
    if (!nextVendorId && user?.id) {
      const { data } = await supabase.from("vendors").select("id").eq("owner_user_id", user.id).single();
      nextVendorId = data?.id || null;
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
    setLoading(false);
  }

  async function loadMasterProducts() {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (category) query.set("category", category);
    if (brandFilter.trim()) query.set("brand", brandFilter.trim());

    try {
      const response = await fetch(apiUrl(`/api/catalog/setup/master-products?${query.toString()}`));
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to load master products.");
      setProducts(json.products || []);
    } catch (error) {
      Alert.alert("Catalogue", error instanceof Error ? error.message : "Unable to load master products.");
    }
  }

  async function loadVendorItems(nextVendorId = vendorId) {
    if (!nextVendorId) return;
    const query = new URLSearchParams({ vendor_id: nextVendorId });
    if (terminalId) query.set("terminal_id", terminalId);
    const response = await fetch(apiUrl(`/api/catalog/setup/vendor-items?${query.toString()}`));
    const json = await response.json();
    if (response.ok && json.success) setVendorItems(json.items || []);
  }

  function toggleProduct(productId: string) {
    setSelected((current) => ({ ...current, [productId]: !current[productId] }));
  }

  async function addSelectedProducts() {
    if (!vendorId) {
      Alert.alert("Vendor setup needed", "Please complete vendor registration and login first.");
      return;
    }
    const productIds = Object.keys(selected).filter((id) => selected[id]);
    if (productIds.length === 0) {
      Alert.alert("Select products", "Choose one or more catalogue products before adding them to your store.");
      return;
    }
    if (defaultPriceMode === "show_price" && !defaultPrice.trim()) {
      Alert.alert("Price needed", "Enter a selling price or choose Ask vendor / Market price.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(apiUrl("/api/catalog/setup/add-master-products"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_id: vendorId,
          terminal_id: terminalId,
          actor_user_id: user?.id || null,
          product_ids: productIds,
          defaults: {
            available_today: availableToday,
            price_display_mode: defaultPriceMode,
            price: defaultPrice,
            pack_unit: defaultUnit,
            price_unit_label: defaultUnit,
            stock_quantity: defaultStock,
            max_order_quantity: defaultMaxQty,
          },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to add selected products.");
      Alert.alert("Catalogue updated", `${json.added_count || 0} item(s) added. ${json.skipped_count || 0} duplicate(s) skipped.`);
      setSelected({});
      await loadVendorItems(vendorId);
    } catch (error) {
      Alert.alert("Not saved", error instanceof Error ? error.message : "Unable to add selected products.");
    } finally {
      setSaving(false);
    }
  }

  async function checkDuplicates() {
    const query = new URLSearchParams({
      product_name: missing.product_name || "",
      brand_name: missing.brand_name || "",
      variant_name: missing.variant_name || "",
      pack_size: missing.pack_size || "",
      barcode: missing.barcode || "",
    });
    const response = await fetch(apiUrl(`/api/catalog/setup/duplicate-check?${query.toString()}`));
    const json = await response.json();
    if (response.ok && json.success) setDuplicates(json.matches || []);
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.45,
    });
    if (result.canceled) return;
    const validationError = validatePickedProductImage(result.assets[0]);
    if (validationError) {
      Alert.alert("Image not accepted", validationError);
      return;
    }
    setPhoto(result.assets[0]);
  }

  async function uploadMissingPhoto() {
    if (!photo || !vendorId) return null;
    const optimized = await optimizeProductImage(photo);
    const fileName = photo.fileName || photo.uri.split("/").pop() || `vendor-product-${Date.now()}.jpg`;
    const endpoint = shareImage ? "/api/storage/s3/presign-shared-product-image" : "/api/storage/s3/presign-product-image";
    const response = await fetch(apiUrl(endpoint), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vendorId,
        fileName,
        contentType: optimized.contentType || photo.mimeType || "image/jpeg",
        fileSize: optimized.optimizedSize,
        originalFileSize: optimized.originalSize,
        imageWidth: optimized.width,
        imageHeight: optimized.height,
        optimized: true,
        productName: missing.product_name,
        rightsConfirmed: shareImage,
        declaredOwnership: shareImage,
        allowSharedCatalogueUse: shareImage,
        rightsConfirmationText: shareImage ? RIGHTS_TEXT : undefined,
      }),
    });
    const json = await response.json();
    if (!response.ok || !json.success) throw new Error(json.error || "Image upload could not be prepared.");
    const upload = await fetch(json.upload_url, {
      method: "PUT",
      headers: { "Content-Type": optimized.contentType || photo.mimeType || "image/jpeg" },
      body: optimized.blob,
    });
    if (!upload.ok) throw new Error("Image upload failed.");
    if (!shareImage) {
      await fetch(apiUrl("/api/storage/s3/confirm-product-image"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, storageFileId: json.storage_file_id, objectKey: json.object_key }),
      });
    }
    return json.public_url || null;
  }

  async function submitMissingProduct() {
    if (!vendorId) return Alert.alert("Vendor setup needed", "Please complete vendor registration and login first.");
    if (!missing.product_name.trim()) return Alert.alert("Product name needed", "Enter the missing product name.");
    if (missing.price_display_mode === "show_price" && !missing.price.trim()) {
      return Alert.alert("Price needed", "Enter a selling price or choose Ask vendor / Market price.");
    }

    setSaving(true);
    try {
      const imageUrl = await uploadMissingPhoto();
      const response = await fetch(apiUrl("/api/catalog/setup/submit-new-product"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...missing,
          vendor_id: vendorId,
          terminal_id: terminalId,
          actor_user_id: user?.id || null,
          image_url: imageUrl,
          vendor_image_reuse_consent: shareImage,
          consent_terms_version: "vendor-image-catalogue-2026-07-31",
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to submit product.");
      Alert.alert("Product added", "The product is now in your shop as pending master-catalogue review.");
      setMissingOpen(false);
      setMissing({ ...missing, product_name: "", local_name: "", brand_name: "", variant_name: "", pack_size: "", description: "", price: "", barcode: "" });
      setPhoto(null);
      setShareImage(false);
      setDuplicates([]);
      await loadVendorItems(vendorId);
    } catch (error) {
      Alert.alert("Not saved", error instanceof Error ? error.message : "Unable to submit product.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.muted}>Preparing catalogue setup...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <BrandHeader compact subtitle="Vendor catalogue setup" />
      <Text style={styles.heading}>Set Up Your Shop Catalogue</Text>
      <Text style={styles.note}>
        Search the master catalogue, select many items, then add them to your store. Your price, stock and daily availability remain separate from the master product record.
      </Text>

      {terminals.length > 0 ? (
        <View style={styles.panel}>
          <Text style={styles.label}>Select branch / terminal</Text>
          <View style={styles.wrap}>
            {terminals.map((terminal) => (
              <TouchableOpacity key={terminal.id} style={[styles.chip, terminalId === terminal.id && styles.chipActive]} onPress={() => setTerminalId(terminal.id)}>
                <Text style={[styles.chipText, terminalId === terminal.id && styles.chipTextActive]}>{terminal.terminal_name || terminal.public_terminal_id || "Branch"}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.panel}>
        <Text style={styles.section}>Select products from Master Product Catalogue</Text>
        <TextInput style={styles.input} placeholder="Search by product, Hindi/Kannada name, synonym or spelling" value={search} onChangeText={setSearch} />
        <TextInput style={styles.input} placeholder="Brand filter, where applicable" value={brandFilter} onChangeText={setBrandFilter} />
        <View style={styles.wrap}>
          {CATEGORIES.map(([value, label]) => (
            <TouchableOpacity key={value} style={[styles.chip, category === value && styles.chipActive]} onPress={() => setCategory(value)}>
              <Text style={[styles.chipText, category === value && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Default details for selected products</Text>
        <View style={styles.wrap}>
          <TouchableOpacity style={[styles.chip, availableToday && styles.greenChip]} onPress={() => setAvailableToday(true)}>
            <Text style={[styles.chipText, availableToday && styles.chipTextActive]}>Available today</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, !availableToday && styles.redChip]} onPress={() => setAvailableToday(false)}>
            <Text style={[styles.chipText, !availableToday && styles.chipTextActive]}>Temporarily unavailable</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.wrap}>
          {PRICE_MODES.map(([value, label]) => (
            <TouchableOpacity key={value} style={[styles.chip, defaultPriceMode === value && styles.chipActive]} onPress={() => setDefaultPriceMode(value as any)}>
              <Text style={[styles.chipText, defaultPriceMode === value && styles.chipTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Price, optional" keyboardType="numeric" value={defaultPrice} onChangeText={setDefaultPrice} />
          <TextInput style={[styles.input, styles.flex]} placeholder="Unit, e.g. kg/pack" value={defaultUnit} onChangeText={setDefaultUnit} />
        </View>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.flex]} placeholder="Stock quantity" keyboardType="numeric" value={defaultStock} onChangeText={setDefaultStock} />
          <TextInput style={[styles.input, styles.flex]} placeholder="Max order quantity" keyboardType="numeric" value={defaultMaxQty} onChangeText={setDefaultMaxQty} />
        </View>

        <TouchableOpacity style={[styles.primaryBtn, saving && styles.disabled]} onPress={addSelectedProducts} disabled={saving}>
          <Text style={styles.primaryText}>{saving ? "Saving..." : `Add selected items to my store (${selectedCount})`}</Text>
        </TouchableOpacity>

        {products.map((product) => {
          const isSelected = Boolean(selected[product.id]);
          return (
            <TouchableOpacity key={product.id} style={[styles.productCard, isSelected && styles.selectedCard]} onPress={() => toggleProduct(product.id)}>
              <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                {isSelected ? <Text style={styles.checkText}>✓</Text> : null}
              </View>
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>{product.image_status === "approved_shared_image" ? "Image" : "Image pending"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.productTitle}>{productName(product)}</Text>
                <Text style={styles.muted}>{product.category} / {product.subcategory}</Text>
                <Text style={styles.muted}>{localNames(product) || "English/Hindi/Kannada names can be added during moderation."}</Text>
                <Text style={styles.muted}>Units: {(product.common_units || []).join(", ") || "piece"}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.panel}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMissingOpen((value) => !value)}>
          <Text style={styles.secondaryText}>Can't find an item? Add a new product</Text>
        </TouchableOpacity>

        {missingOpen ? (
          <View>
            <Text style={styles.note}>New products are added to your shop immediately as pending master-catalogue review. They are not shared with other vendors until company moderation approves them.</Text>
            <TextInput style={styles.input} placeholder="Product name" value={missing.product_name} onChangeText={(value) => setMissing({ ...missing, product_name: value })} onBlur={checkDuplicates} />
            <TextInput style={styles.input} placeholder="Local/common name, Hindi or Kannada" value={missing.local_name} onChangeText={(value) => setMissing({ ...missing, local_name: value })} />
            <View style={styles.wrap}>
              {CATEGORIES.filter(([value]) => value).map(([value, label]) => (
                <TouchableOpacity key={value} style={[styles.chip, missing.category === value && styles.chipActive]} onPress={() => setMissing({ ...missing, category: value })}>
                  <Text style={[styles.chipText, missing.category === value && styles.chipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              <TextInput style={[styles.input, styles.flex]} placeholder="Brand" value={missing.brand_name} onChangeText={(value) => setMissing({ ...missing, brand_name: value })} onBlur={checkDuplicates} />
              <TextInput style={[styles.input, styles.flex]} placeholder="Variant / variety" value={missing.variant_name} onChangeText={(value) => setMissing({ ...missing, variant_name: value })} onBlur={checkDuplicates} />
            </View>
            <View style={styles.row}>
              <TextInput style={[styles.input, styles.flex]} placeholder="Pack size" value={missing.pack_size} onChangeText={(value) => setMissing({ ...missing, pack_size: value })} onBlur={checkDuplicates} />
              <TextInput style={[styles.input, styles.flex]} placeholder="Unit" value={missing.pack_unit} onChangeText={(value) => setMissing({ ...missing, pack_unit: value })} />
            </View>
            <TextInput style={styles.input} placeholder="Barcode / SKU / EAN, if available" value={missing.barcode} onChangeText={(value) => setMissing({ ...missing, barcode: value })} onBlur={checkDuplicates} />
            <TextInput style={styles.input} placeholder="Description, optional" value={missing.description} onChangeText={(value) => setMissing({ ...missing, description: value })} />
            <View style={styles.wrap}>
              {PRICE_MODES.map(([value, label]) => (
                <TouchableOpacity key={value} style={[styles.chip, missing.price_display_mode === value && styles.chipActive]} onPress={() => setMissing({ ...missing, price_display_mode: value })}>
                  <Text style={[styles.chipText, missing.price_display_mode === value && styles.chipTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              <TextInput style={[styles.input, styles.flex]} placeholder="Selling price, optional" keyboardType="numeric" value={missing.price} onChangeText={(value) => setMissing({ ...missing, price: value })} />
              <TextInput style={[styles.input, styles.flex]} placeholder="Stock quantity" keyboardType="numeric" value={missing.stock_quantity} onChangeText={(value) => setMissing({ ...missing, stock_quantity: value })} />
            </View>
            <TextInput style={styles.input} placeholder="Max order quantity" keyboardType="numeric" value={missing.max_order_quantity} onChangeText={(value) => setMissing({ ...missing, max_order_quantity: value })} />

            {duplicates.length > 0 ? (
              <View style={styles.duplicateBox}>
                <Text style={styles.duplicateTitle}>Possible existing matches</Text>
                {duplicates.map((match) => (
                  <TouchableOpacity key={match.id} style={styles.duplicateRow} onPress={() => { setSelected({ [match.id]: true }); setMissingOpen(false); }}>
                    <Text style={styles.productTitle}>{productName(match)}</Text>
                    <Text style={styles.muted}>Select this master product instead of creating a duplicate.</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <TouchableOpacity style={styles.uploadBtn} onPress={pickImage}>
              <Text style={styles.uploadText}>{photo ? "Change product image" : "Optional product image"}</Text>
            </TouchableOpacity>
            <Text style={styles.muted}>Allowed: JPEG, PNG, WebP. Original max 5 MB. Images are compressed before permanent storage.</Text>
            {photo ? <Image source={{ uri: photo.uri }} style={styles.preview} /> : null}
            <TouchableOpacity style={styles.consentRow} onPress={() => setShareImage((value) => !value)}>
              <View style={[styles.checkbox, shareImage && styles.checkboxActive]}>{shareImage ? <Text style={styles.checkText}>✓</Text> : null}</View>
              <Text style={styles.consentText}>{RIGHTS_TEXT}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.primaryBtn, saving && styles.disabled]} onPress={submitMissingProduct} disabled={saving}>
              <Text style={styles.primaryText}>{saving ? "Submitting..." : "Submit and add to my store"}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={styles.panel}>
        <Text style={styles.section}>My store catalogue</Text>
        {vendorItems.length === 0 ? <Text style={styles.muted}>No products added yet.</Text> : null}
        {vendorItems.slice(0, 80).map((item) => (
          <TouchableOpacity key={item.id} style={styles.myItem} onPress={() => router.push(`/vendor/EditItem?id=${item.id}&vendor=${vendorId}` as any)}>
            <Text style={styles.productTitle}>{[item.generic_product_name || item.item_name, item.brand_name, item.variant_name].filter(Boolean).join(" - ")}</Text>
            <Text style={styles.muted}>
              {item.available_today === false ? "Not available today" : "Available today"} | {item.price_display_mode === "show_price" ? `Rs ${item.price}` : "Price hidden/quote required"} | {item.listing_review_status || "approved"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 70, paddingHorizontal: 18, paddingBottom: 60, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  heading: { fontSize: 28, fontWeight: "900", color: "#111827", marginTop: 12 },
  note: { color: "#4b5563", lineHeight: 20, marginVertical: 10 },
  panel: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 14, marginTop: 14, backgroundColor: "#fff" },
  section: { fontSize: 18, fontWeight: "900", marginBottom: 10 },
  label: { fontWeight: "900", marginBottom: 8, color: "#111827" },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, padding: 12, marginBottom: 10, backgroundColor: "#fff" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  flex: { flex: 1, minWidth: 130 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: "#fff" },
  chipActive: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  greenChip: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  redChip: { backgroundColor: "#b91c1c", borderColor: "#b91c1c" },
  chipText: { color: "#334155", fontWeight: "900" },
  chipTextActive: { color: "#fff" },
  primaryBtn: { backgroundColor: "#1166ff", borderRadius: 10, padding: 14, marginTop: 8 },
  primaryText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  secondaryBtn: { borderWidth: 1, borderColor: "#1166ff", borderRadius: 10, padding: 13 },
  secondaryText: { color: "#1166ff", textAlign: "center", fontWeight: "900" },
  productCard: { flexDirection: "row", gap: 10, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, marginTop: 10 },
  selectedCard: { borderColor: "#1166ff", backgroundColor: "#eff6ff" },
  checkbox: { width: 26, height: 26, borderRadius: 7, borderWidth: 1, borderColor: "#94a3b8", alignItems: "center", justifyContent: "center" },
  checkboxActive: { backgroundColor: "#1166ff", borderColor: "#1166ff" },
  checkText: { color: "#fff", fontWeight: "900" },
  placeholder: { width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: "#d1d5db", backgroundColor: "#f8fafc", alignItems: "center", justifyContent: "center" },
  placeholderText: { color: "#64748b", fontSize: 10, textAlign: "center", fontWeight: "800" },
  productTitle: { fontSize: 15, fontWeight: "900", color: "#111827" },
  muted: { color: "#6b7280", fontSize: 12, lineHeight: 18 },
  duplicateBox: { borderWidth: 1, borderColor: "#fed7aa", backgroundColor: "#fff7ed", borderRadius: 8, padding: 10, marginBottom: 10 },
  duplicateTitle: { color: "#9a3412", fontWeight: "900", marginBottom: 6 },
  duplicateRow: { borderTopWidth: 1, borderTopColor: "#fed7aa", paddingTop: 8, marginTop: 8 },
  uploadBtn: { backgroundColor: "#0f766e", borderRadius: 10, padding: 13, marginBottom: 8 },
  uploadText: { color: "#fff", textAlign: "center", fontWeight: "900" },
  preview: { width: "100%", height: 180, borderRadius: 10, marginVertical: 10 },
  consentRow: { flexDirection: "row", gap: 10, alignItems: "center", marginVertical: 10 },
  consentText: { flex: 1, color: "#374151", fontSize: 12, lineHeight: 18 },
  myItem: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 8, padding: 10, marginTop: 8 },
  disabled: { opacity: 0.6 },
});
