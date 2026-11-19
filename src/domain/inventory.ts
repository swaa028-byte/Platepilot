export type StockMovement = {
  eventId: string;
  ingredientId: string;
  quantityMilliUnits: bigint;
  kind: "receipt" | "depletion" | "waste" | "count_adjustment" | "reversal";
};

export function applyMovements(movements: readonly StockMovement[]) {
  const seen = new Set<string>();
  const balances = new Map<string, bigint>();
  for (const movement of movements) {
    if (seen.has(movement.eventId)) continue;
    seen.add(movement.eventId);
    const current = balances.get(movement.ingredientId) ?? 0n;
    const next = current + movement.quantityMilliUnits;
    if (next < 0n) throw new Error("INSUFFICIENT_STOCK");
    balances.set(movement.ingredientId, next);
  }
  return balances;
}
