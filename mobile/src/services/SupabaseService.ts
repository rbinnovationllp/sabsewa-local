import { supabase } from "@/lib/supabase";

async function ok<T = unknown>(data?: T) {
  return { success: true, data };
}

export const SupabaseService = {
  supabase,
  getWalletBalance: async () => 0,
  rechargeWallet: async () => ok(),
  payAdvance: async () => ok(),
  getTransactions: async () => [],
  getBookings: async () => [],
  getJobs: async () => [],
  getProfile: async () => null,
  updateProfile: async () => ok(),
  createOrder: async () => ok(),
  updateOrder: async () => ok(),
  hyperWalletDebit: async () => ok(),
  hyperWalletCredit: async () => ok()
};
