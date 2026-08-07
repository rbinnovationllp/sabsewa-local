import { supabase } from "../connection.js";

/**
 * Calculates GST breakdown in integer paise
 */
export function calculateGstBreakdown({ baseAmountPaise, taxRatePercent, vendorStateCode, companyStateCode = "29" }) {
  const gstAmountPaise = Math.round((baseAmountPaise * taxRatePercent) / 100);
  const totalAmountPaise = baseAmountPaise + gstAmountPaise;

  const isIntraState = String(vendorStateCode).trim() === String(companyStateCode).trim();
  
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  if (isIntraState) {
    cgstPaise = Math.round(gstAmountPaise / 2);
    sgstPaise = gstAmountPaise - cgstPaise; // Prevent rounding off-by-one errors
  } else {
    igstPaise = gstAmountPaise;
  }

  return {
    baseAmountPaise,
    taxRatePercent,
    gstAmountPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalAmountPaise,
    isIntraState
  };
}

/**
 * Charges a single completed order into the platform fee ledger
 */
export async function recordOrderPlatformFee({ orderId, vendorId, categoryId, baseFeeRupees }) {
  // Fetch active GST rate configuration
  const { data: taxConfig } = await supabase
    .from("tax_configurations")
    .select("*")
    .eq("is_active", true)
    .single();

  const taxRate = taxConfig?.tax_rate_percent ?? 18.00;
  const companyStateCode = taxConfig?.company_state_code ?? "29";

  // Fetch Vendor Tax State Code
  const { data: taxProfile } = await supabase
    .from("vendor_tax_profiles")
    .select("state_code")
    .eq("vendor_id", vendorId)
    .maybeSingle();

  const vendorStateCode = taxProfile?.state_code ?? "29";
  const baseFeePaise = Math.round(baseFeeRupees * 100);

  const calc = calculateGstBreakdown({
    baseAmountPaise: baseFeePaise,
    taxRatePercent: taxRate,
    vendorStateCode,
    companyStateCode
  });

  const { data, error } = await supabase
    .from("vendor_platform_fee_ledger")
    .insert({
      order_id: orderId,
      vendor_id: vendorId,
      category_id: categoryId,
      base_fee_paise: calc.baseAmountPaise,
      gst_rate_snapshot: calc.taxRatePercent,
      gst_amount_paise: calc.gstAmountPaise,
      cgst_paise: calc.cgstPaise,
      sgst_paise: calc.sgstPaise,
      igst_paise: calc.igstPaise,
      total_charge_paise: calc.totalAmountPaise,
      place_of_supply_state_code: vendorStateCode,
      settlement_status: "unbilled"
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}