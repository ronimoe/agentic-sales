import type { GoalKey, GoalRules } from "@/db/schema";

export type AdStats = {
  spendIdr: number;
  impressions: number;
  reach: number;
  videoWatches: number;
  frequency: number;
  chats: number;
  qualifiedLeads: number;
  /** Orders from this ad, excluding returned and cancelled ones. */
  sales: number;
};
export type Decision = { action: "pause" | "scale" | "keep"; reason: string };

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

/** Each goal is judged by its own result. Eyeball ads are never judged on direct sales. */
export function evaluateAd(goal: GoalKey, rules: GoalRules, s: AdStats): Decision {
  if (s.frequency > rules.maxFrequency)
    return { action: "pause", reason: `Orang melihat iklan ini ${s.frequency.toFixed(1)} kali, di atas batas ${rules.maxFrequency}` };

  if (goal === "eyeball") {
    if (s.spendIdr < rules.pauseSpendWithoutResultIdr) return { action: "keep", reason: "Belum cukup data" };
    const watchRate = s.impressions ? s.videoWatches / s.impressions : 0;
    if (rules.minWatchRate !== undefined && watchRate < rules.minWatchRate)
      return { action: "pause", reason: `Hanya ${(watchRate * 100).toFixed(1)}% yang menonton, di bawah batas ${(rules.minWatchRate * 100).toFixed(0)}%` };
    const per1000 = s.reach ? (s.spendIdr / s.reach) * 1000 : Infinity;
    if (per1000 > rules.targetIdr * rules.pauseOverTargetRatio)
      return { action: "pause", reason: `Biaya per 1.000 orang ${rp(per1000)}, di atas target ${rp(rules.targetIdr)}` };
    if (per1000 < rules.targetIdr * rules.scaleUnderTargetRatio)
      return { action: "scale", reason: `Biaya per 1.000 orang ${rp(per1000)}, di bawah target ${rp(rules.targetIdr)}` };
    return { action: "keep", reason: "Sesuai target" };
  }

  const [results, unit] =
    goal === "form" ? [s.qualifiedLeads, "prospek layak"] :
    goal === "whatsapp_chat" && rules.primaryMetric === "cost_per_chat" ? [s.chats, "chat"] :
    [s.sales, "penjualan"];

  if (results === 0) {
    if (s.spendIdr >= rules.pauseSpendWithoutResultIdr)
      return { action: "pause", reason: `Sudah ${rp(s.spendIdr)} tanpa ${unit}` };
    return { action: "keep", reason: "Belum cukup data" };
  }
  const cost = s.spendIdr / results;
  if (cost > rules.targetIdr * rules.pauseOverTargetRatio && s.spendIdr >= rules.pauseSpendWithoutResultIdr)
    return { action: "pause", reason: `Biaya per ${unit} ${rp(cost)}, di atas target ${rp(rules.targetIdr)}` };
  if (results >= 2 && cost < rules.targetIdr * rules.scaleUnderTargetRatio)
    return { action: "scale", reason: `Biaya per ${unit} ${rp(cost)}, di bawah target ${rp(rules.targetIdr)}` };
  return { action: "keep", reason: "Sesuai target" };
}

/** Hard cap: a raise can never take live daily spend past the limit. Returns the allowed new budget. */
export function scaledBudget(current: number, stepPct: number, liveDailyTotal: number, dailyCap: number): number {
  const wanted = Math.round(current * (1 + stepPct / 100));
  const room = dailyCap - liveDailyTotal;
  if (room <= 0) return current;
  return Math.min(wanted, current + room);
}

/** Launch check: can this daily budget go live under the cap? */
export const fitsDailyCap = (liveDailyTotal: number, added: number, dailyCap: number) => liveDailyTotal + added <= dailyCap;

/** How many campaigns a budget can test properly, given a minimum daily spend per campaign. */
export const testableCampaigns = (dailyBudget: number, minPerCampaign: number) =>
  minPerCampaign > 0 ? Math.floor(dailyBudget / minPerCampaign) : 0;
