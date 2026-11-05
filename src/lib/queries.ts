import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { adMetrics, angles, creatives, orders, products } from "@/db/schema";
import { profitOf } from "./orders/csv";
import type { Ctx } from "./types";

export async function recentDays(ctx: Ctx, n = 7) {
  const rows = await ctx.db.selectDistinct({ day: adMetrics.day }).from(adMetrics).where(eq(adMetrics.workspaceId, ctx.workspaceId)).orderBy(desc(adMetrics.day)).limit(n);
  return rows.map((r) => r.day).reverse();
}

export async function moneySummary(ctx: Ctx) {
  const days = await recentDays(ctx);
  const m = days.length ? await ctx.db.select({ v: sql<string>`coalesce(sum(${adMetrics.spendIdr}),0)` }).from(adMetrics).where(and(eq(adMetrics.workspaceId, ctx.workspaceId), inArray(adMetrics.day, days))) : [{ v: "0" }];
  const all = await ctx.db.select().from(orders).where(eq(orders.workspaceId, ctx.workspaceId));
  const delivered = all.filter((o) => o.status === "delivered");
  const sum = (f: (o: (typeof all)[0]) => boolean) => delivered.filter(f).reduce((s, o) => s + profitOf(o), 0);
  return {
    spend: Number(m[0].v), profit: delivered.reduce((s, o) => s + profitOf(o), 0),
    confirmedProfit: sum((o) => o.attribution === "confirmed"), estimatedProfit: sum((o) => o.attribution !== "confirmed"),
    delivered: delivered.length, transit: all.filter((o) => ["ordered", "confirmed", "paid", "shipped"].includes(o.status)).length,
    returned: all.filter((o) => o.status === "returned").length, orders: all,
  };
}

export async function bestAngles(ctx: Ctx, productId?: string) {
  const rows = await ctx.db.select({ o: orders, angle: angles.title, angleId: angles.id, product: products.name }).from(orders)
    .innerJoin(creatives, eq(orders.creativeId, creatives.id)).innerJoin(angles, eq(creatives.angleId, angles.id)).innerJoin(products, eq(angles.productId, products.id))
    .where(and(eq(orders.workspaceId, ctx.workspaceId), eq(orders.status, "delivered"), productId ? eq(angles.productId, productId) : undefined));
  const map = new Map<string, { id: string; title: string; product: string; sales: number; profit: number }>();
  for (const r of rows) {
    const e = map.get(r.angleId) ?? { id: r.angleId, title: r.angle, product: r.product, sales: 0, profit: 0 };
    e.sales += 1; e.profit += profitOf(r.o); map.set(r.angleId, e);
  }
  return [...map.values()].sort((a, b) => b.profit - a.profit);
}

export async function adScore(ctx: Ctx, creativeIds: string[]) {
  const out = new Map<string, { spend: number; reach: number; impressions: number; watches: number; chats: number; qualified: number; sales: number }>();
  if (!creativeIds.length) return out;
  for (const id of creativeIds) out.set(id, { spend: 0, reach: 0, impressions: 0, watches: 0, chats: 0, qualified: 0, sales: 0 });
  for (const m of await ctx.db.select().from(adMetrics).where(and(eq(adMetrics.workspaceId, ctx.workspaceId), inArray(adMetrics.creativeId, creativeIds)))) {
    const e = out.get(m.creativeId)!; e.spend += m.spendIdr; e.reach += m.reach; e.impressions += m.impressions; e.watches += m.videoWatches; e.chats += m.chats; e.qualified += m.qualifiedLeads;
  }
  for (const o of await ctx.db.select().from(orders).where(and(eq(orders.workspaceId, ctx.workspaceId), inArray(orders.creativeId, creativeIds), inArray(orders.status, ["ordered", "confirmed", "paid", "shipped", "delivered"])))) out.get(o.creativeId!)!.sales += 1;
  return out;
}

export function scorecard(goal: string, s: { spend: number; reach: number; impressions: number; watches: number; chats: number; qualified: number; sales: number }, t: { metric: Record<string, string> }, idr: (n: number) => string, num: (n: number) => string, pct: (n: number) => string) {
  const safe = (a: number, b: number) => (b ? a / b : 0);
  if (goal === "eyeball") return [[t.metric.reach, num(s.reach)], [t.metric.per1000, idr(safe(s.spend, s.reach) * 1000)], [t.metric.watch, pct(safe(s.watches, s.impressions))]];
  if (goal === "form") return [[t.metric.leads, num(s.qualified)], [t.metric.perLead, s.qualified ? idr(s.spend / s.qualified) : "-"]];
  if (goal === "whatsapp_chat") return [[t.metric.chats, num(s.chats)], [t.metric.perChat, s.chats ? idr(s.spend / s.chats) : "-"], [t.metric.sales, num(s.sales)], [t.metric.perSale, s.sales ? idr(s.spend / s.sales) : "-"]];
  return [[t.metric.sales, num(s.sales)], [t.metric.perSale, s.sales ? idr(s.spend / s.sales) : "-"]];
}
