export function useWalletWithdrawal() {
  return {
    loading: false,
    eligible: false,
    reason: "Withdrawal is not enabled for SabSewa Local MVP.",
    requestWithdrawal: async (_amount?: unknown, _method?: unknown) => ({
      success: false,
      error: "Withdrawal is not enabled for SabSewa Local MVP."
    })
  };
}
