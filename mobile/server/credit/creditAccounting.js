export function calculateCreditPayment({ outstanding, advance = 0, payment }) {
  const due = Math.max(0, Number(outstanding || 0));
  const currentAdvance = Math.max(0, Number(advance || 0));
  const received = Number(payment || 0);
  if (!Number.isFinite(received) || received <= 0) throw new Error("Payment amount must be greater than zero.");

  const appliedToOutstanding = Math.min(due, received);
  const advanceAdded = Math.max(received - appliedToOutstanding, 0);
  return {
    outstanding_before: due,
    payment_received: received,
    applied_to_outstanding: appliedToOutstanding,
    outstanding_after: Math.max(due - appliedToOutstanding, 0),
    advance_before: currentAdvance,
    advance_added: advanceAdded,
    advance_after: currentAdvance + advanceAdded,
  };
}

export function calculateAdvanceApplication({ outstanding = 0, advance = 0, orderAmount, creditLimit = 0 }) {
  const due = Math.max(0, Number(outstanding || 0));
  const currentAdvance = Math.max(0, Number(advance || 0));
  const order = Number(orderAmount || 0);
  const limit = Math.max(0, Number(creditLimit || 0));
  if (!Number.isFinite(order) || order <= 0) throw new Error("Order amount must be greater than zero.");

  const advanceApplied = Math.min(currentAdvance, order);
  const creditRequired = Math.max(order - advanceApplied, 0);
  const outstandingAfter = due + creditRequired;
  return {
    order_amount: order,
    advance_before: currentAdvance,
    advance_applied: advanceApplied,
    advance_after: Math.max(currentAdvance - advanceApplied, 0),
    credit_required: creditRequired,
    outstanding_before: due,
    outstanding_after: outstandingAfter,
    available_credit_after: Math.max(limit - outstandingAfter, 0),
    allowed: outstandingAfter <= limit,
  };
}
