export const fulfillmentTransitions = {
  received: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["served", "completed", "cancelled"],
  served: ["completed"],
  completed: [],
  cancelled: [],
} as const;

export type FulfillmentState = keyof typeof fulfillmentTransitions;

export function canTransitionFulfillment(from: FulfillmentState, to: FulfillmentState) {
  return (fulfillmentTransitions[from] as readonly string[]).includes(to);
}

export function canApplyVerifiedPayment(input: {
  orderPaid: boolean;
  attemptAlreadyApplied: boolean;
  providerEventAlreadyProcessed: boolean;
}) {
  return !input.orderPaid && !input.attemptAlreadyApplied && !input.providerEventAlreadyProcessed;
}

export function refundableMinor(paidMinor: bigint, alreadyRefundedMinor: bigint) {
  if (paidMinor < 0n || alreadyRefundedMinor < 0n || alreadyRefundedMinor > paidMinor) {
    throw new Error("INVALID_REFUND_LEDGER");
  }
  return paidMinor - alreadyRefundedMinor;
}
