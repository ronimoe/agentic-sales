import type { Destination, GoalKey, GoalRules } from "@/db/schema";

export const MARKETPLACE_FEE: Partial<Record<Destination, number>> = { tokopedia: 0.08, shopee: 0.09, tiktok_shop: 0.08 };
/** Estimate: about 15% of chat orders are returned, losing about Rp15.000 in shipping each time. */
export const RETURN_LOSS_IDR = 2250;
const round = (n: number) => Math.max(1000, Math.round(n / 1000) * 1000);

export function suggestLimits(p: { priceIdr: number; costIdr: number }, destination: Destination = "whatsapp") {
  const fee = Math.round(p.priceIdr * (MARKETPLACE_FEE[destination] ?? 0));
  const returnLoss = destination === "whatsapp" ? RETURN_LOSS_IDR : 0;
  const net = p.priceIdr - p.costIdr - fee - returnLoss;
  return { net, fee, returnLoss, targetIdr: round(net * 0.5), stopSpendIdr: round(net * 2) };
}

/** Margins differ by product, so sales goals use product limits. Eyeball and form keep the workspace defaults. */
export function limitsFor(goal: GoalKey, base: GoalRules, p: { priceIdr: number; costIdr: number; targetCostIdr: number | null; stopSpendIdr: number | null }, destination: Destination): GoalRules {
  if (goal === "eyeball" || goal === "form") return base;
  const s = suggestLimits(p, destination);
  return { ...base, targetIdr: p.targetCostIdr ?? s.targetIdr, pauseSpendWithoutResultIdr: p.stopSpendIdr ?? s.stopSpendIdr };
}
