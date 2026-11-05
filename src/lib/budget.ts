import { and, eq, gte, sql, sum } from "drizzle-orm";
import { budgetLimits, campaigns, usageEvents } from "@/db/schema";
import type { Ctx } from "./types";

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };

export async function getLimit(ctx: Ctx, kind: "ads_monthly" | "ads_daily" | "assets_monthly" | "ai_monthly" | "whatsapp_monthly") {
  const [l] = await ctx.db.select().from(budgetLimits).where(and(eq(budgetLimits.workspaceId, ctx.workspaceId), eq(budgetLimits.kind, kind)));
  return l?.amountIdr ?? 0;
}

export async function usedThisMonth(ctx: Ctx, kind: "ads" | "assets" | "ai" | "whatsapp") {
  const [r] = await ctx.db.select({ v: sum(usageEvents.costIdr) }).from(usageEvents)
    .where(and(eq(usageEvents.workspaceId, ctx.workspaceId), eq(usageEvents.kind, kind), gte(usageEvents.createdAt, monthStart())));
  return Number(r?.v ?? 0);
}

export async function liveDailyTotal(ctx: Ctx) {
  const [r] = await ctx.db.select({ v: sql<string>`coalesce(sum(${campaigns.dailyBudgetIdr}),0)` }).from(campaigns)
    .where(and(eq(campaigns.workspaceId, ctx.workspaceId), eq(campaigns.status, "live")));
  return Number(r?.v ?? 0);
}

export class BudgetError extends Error {}
export async function assertRoom(ctx: Ctx, kind: "assets" | "ai" | "whatsapp", cost: number) {
  const limit = await getLimit(ctx, `${kind}_monthly`);
  if ((await usedThisMonth(ctx, kind)) + cost > limit) throw new BudgetError(`Batas bulanan ${kind} sudah tercapai. Naikkan di Pengaturan.`);
}
