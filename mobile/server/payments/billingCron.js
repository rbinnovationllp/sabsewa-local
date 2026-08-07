import { supabase } from "../connection.js";

export async function processPeriodicBillingCycle(vendorId) {
  // Fetch unbilled ledger items
  const { data: ledgerItems } = await supabase
    .from("vendor_platform_fee_ledger")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("settlement_status", "unbilled");

  if (!ledgerItems || ledgerItems.length === 0) return null;

  let totalTaxablePaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalIgstPaise = 0;
  let totalGstPaise = 0;
  let totalInvoicePaise = 0;

  ledgerItems.forEach((item) => {
    totalTaxablePaise += item.base_fee_paise;
    totalCgstPaise += item.cgst_paise;
    totalSgstPaise += item.sgst_paise;
    totalIgstPaise += item.igst_paise;
    totalGstPaise += item.gst_amount_paise;
    totalInvoicePaise += item.total_charge_paise;
  });

  const invoiceNumber = `SL/INV/2026-27/${Date.now().toString().slice(-6)}`;

  // Insert Finalized Invoice
  const { data: invoice, error: invError } = await supabase
    .from("vendor_invoices")
    .insert({
      invoice_number: invoiceNumber,
      vendor_id: vendorId,
      billing_period_start: new Date(new Date().setDate(1)).toISOString(),
      billing_period_end: new Date().toISOString(),
      total_orders_charged: ledgerItems.length,
      taxable_value_paise: totalTaxablePaise,
      gst_rate_snapshot: ledgerItems[0].gst_rate_snapshot,
      cgst_paise: totalCgstPaise,
      sgst_paise: totalSgstPaise,
      igst_paise: totalIgstPaise,
      total_gst_paise: totalGstPaise,
      total_invoice_amount_paise: totalInvoicePaise,
      payment_status: "unpaid",
      is_finalized: true
    })
    .select()
    .single();

  if (invError) throw invError;

  // Link ledger items to invoice
  const ledgerIds = ledgerItems.map((i) => i.id);
  await supabase
    .from("vendor_platform_fee_ledger")
    .update({ invoice_id: invoice.id })
    .in("id", ledgerIds);

  return invoice;
}