import { supabase } from "../connection.js";

/**
 * Inserts a settlement ledger record
 * 
 * @param {
 *   customer_id,
 *   vendor_id,
 *   shopName,
 *   amount,
 *   paid,
 *   billRef
 * } payload
 */
export async function recordSettlementEntry({
  customer_id,
  vendor_id,
  shopName,
  amount,
  paid,
  billRef = "NO_REF"
}) {

  const balance = Number(amount) - Number(paid);

  const { error } = await supabase
    .from("vendor_wallet_ledger")
    .insert({
      customer_id,
      vendor_id,
      shop_name: shopName,
      amount,
      paid,
      balance,
      bill_reference: billRef
    });

  return error ? false : true;
}
