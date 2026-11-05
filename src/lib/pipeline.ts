import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { adMetrics, campaignPlans, campaigns, angles, conversations, creatives, goalTemplates, objections, orders, products, rulebooks, workspaces, type CreativeCheck, type GoalKey, type OrderChannel } from "@/db/schema";
import { applyVoice } from "./voice";
import { draftPlan, rewriteCopy, type CreativeDraft, type PlanInput } from "./ai/creative";
import { reviewVisual } from "./ai/visual";
import { factsFor } from "./knowledge/service";
import { fileChecks, failed, textChecks } from "./ads/checks";
import { limitsFor } from "./ads/limits";
import { renderCreative, ASSET_DIR } from "./assets/render";
import { adsPlatform, realId, withRef, type AdsPlatform } from "./ads/platform";
import { aiEnabled } from "./ai/client";
import { evaluateAd, fitsDailyCap, scaledBudget } from "./ads/rules";
import { assertRoom, BudgetError, getLimit, liveDailyTotal, usedThisMonth } from "./budget";
import { dayKey, idr } from "./format";
import { logActivity, logUsage } from "./log";
import type { Ctx } from "./types";
import path from "node:path";

const ASSET_COST = { image: 400, video: 8000 };
const PLAN_AI_ESTIMATE = 3000;
const REWRITE_AI_ESTIMATE = 800;
const MAX_SECONDS: Partial<Record<GoalKey, number>> = { eyeball: 15, cold_sell: 30, whatsapp_chat: 30, form: 30, retargeting: 30 };
const newRef = () => `LRS-${crypto.randomUUID().replace(/-/g, "").slice(0, 5).toUpperCase()}`;

export async function activeRules(ctx: Ctx, kind: "ads" | "whatsapp") {
  const [r] = await ctx.db.select().from(rulebooks).where(and(eq(rulebooks.workspaceId, ctx.workspaceId), eq(rulebooks.kind, kind), eq(rulebooks.active, true))).orderBy(desc(rulebooks.version));
  return r;
}

export type Rewriter = (d: CreativeDraft, issues: string[], p: PlanInput) => Promise<CreativeDraft>;
export type VisualReviewer = (frames: string[], productName: string, photoPath: string | null) => Promise<CreativeCheck>;
const MAX_ATTEMPTS = 3;

const hookType = (h: string) => h.includes("?") ? "pertanyaan" : /\b(stop|jangan|telat|ragu|takut|pegal|kusam)\b/i.test(h) ? "masalah" : "manfaat";

export async function generatePlan(ctx: Ctx, productId: string, opts: { rewrite?: Rewriter; review?: VisualReviewer } = {}) {
  const { db, workspaceId } = ctx;
  const [p] = await db.select().from(products).where(and(eq(products.id, productId), eq(products.workspaceId, workspaceId)));
  if (!p) throw new Error("Produk tidak ditemukan");
  const [w] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const rb = await activeRules(ctx, "ads");
  const goals = await db.select().from(goalTemplates).where(eq(goalTemplates.workspaceId, workspaceId));
  const enabled = rb?.rules.filter((r) => r.enabled !== false) ?? [];
  const blocked = enabled.map((r) => r.block).filter((x): x is string => !!x);
  const showPrice = enabled.some((r) => r.id === "show_price");
  const facts = await factsFor(ctx, productId);
  const objs = await db.select({ text: objections.text }).from(objections).where(eq(objections.productId, productId)).limit(20);

  const input: PlanInput = {
    name: p.name, description: p.description, priceIdr: p.priceIdr, costIdr: p.costIdr, approvedClaims: p.approvedClaims, proof: p.proof,
    rules: enabled.map((r) => r.text), tone: rb?.tone ?? "", goals: goals.map((g) => ({ key: g.key, name: g.name, briefFormat: g.briefFormat })),
    alwaysSay: p.alwaysSay, neverSay: p.neverSay, facts: facts.map((f) => `${f.question} ${f.answer}`), objections: objs.map((o) => o.text), voiceExample: w.settings.voice?.adExample ?? "",
  };
  if (aiEnabled()) await assertRoom(ctx, "ai", PLAN_AI_ESTIMATE);
  const draft = await draftPlan(input, p.visual.shape);
  if (!aiEnabled()) for (const c of draft.campaigns) for (const d of c.creatives) { d.primaryText = applyVoice(d.primaryText, w.settings.voice?.key); d.hook = applyVoice(d.hook, w.settings.voice?.key); }
  if (aiEnabled()) await logUsage(ctx, "ai", PLAN_AI_ESTIMATE, false, `Rencana ${p.name} (perkiraan)`);
  const total = draft.campaigns.flatMap((c) => c.creatives).reduce((s, c) => s + ASSET_COST[c.format], 0);
  await assertRoom(ctx, "assets", total);

  const rewrite = opts.rewrite ?? (aiEnabled() ? rewriteCopy : null);
  const review = opts.review ?? (aiEnabled() ? reviewVisual : null);
  const [plan] = await db.insert(campaignPlans).values({ workspaceId, productId, rationale: draft.rationale }).returning();
  const savedAngles = await db.insert(angles).values(draft.angles.map((a) => ({ workspaceId, productId, ...a }))).returning();

  let count = 0;
  for (const c of draft.campaigns) {
    const goal = goals.find((g) => g.key === c.goal);
    const [camp] = await db.insert(campaigns).values({
      workspaceId, planId: plan.id, productId, goal: c.goal as GoalKey, destination: c.destination,
      name: `${p.name}: ${goal?.name ?? c.goal}`, dailyBudgetIdr: c.dailyBudgetIdr,
    }).returning();
    for (const original of c.creatives) {
      const id = crypto.randomUUID();
      const angle = savedAngles[original.angleIndex] ?? savedAngles[0];
      let d = original; let attempts = 1;
      let copyChecks = textChecks(d, p, blocked, c.goal as GoalKey);
      while (failed(copyChecks).length && rewrite && attempts < MAX_ATTEMPTS) {
        await assertRoom(ctx, "ai", REWRITE_AI_ESTIMATE);
        d = await rewrite(d, failed(copyChecks).map((x) => x.detail ?? x.label), input);
        await logUsage(ctx, "ai", REWRITE_AI_ESTIMATE, !aiEnabled(), `Perbaikan iklan ${p.name} (perkiraan)`);
        attempts++;
        copyChecks = textChecks(d, p, blocked, c.goal as GoalKey);
      }
      const prices = showPrice && c.goal !== "eyeball";
      const files = await renderCreative({
        id, goal: c.goal as GoalKey, hook: d.hook, line2: d.headline, cta: d.cta, productName: p.name, priceIdr: p.priceIdr, brandName: w.name, brand: w.settings.brand,
        visual: p.visual, photoPath: p.photoPath, format: d.format, showPrice: prices, aiLabel: w.settings.aiLabelAds,
      });
      const checks: CreativeCheck[] = [
        ...copyChecks,
        ...await fileChecks(path.join(ASSET_DIR, files.assetPath), d.format, MAX_SECONDS[c.goal] ?? 30),
        { key: "price", label: "Harga dicetak sistem", status: "pass", detail: prices ? idr(p.priceIdr) : "Tanpa harga" },
        p.photoPath ? { key: "photo", label: "Foto produk asli", status: "pass" } : { key: "photo", label: "Foto produk asli", status: "warn", detail: "Masih ilustrasi contoh. Unggah foto asli sebelum tayang sungguhan." },
        review ? await review(files.frames, p.name, p.photoPath) : { key: "ai_visual", label: "Tinjauan visual AI", status: "not_run", detail: "Butuh Claude" },
      ];
      const bad = failed(checks);
      await db.insert(creatives).values({
        id, workspaceId, campaignId: camp.id, angleId: angle.id, concept: d.concept, format: d.format, hook: d.hook,
        primaryText: d.primaryText, headline: d.headline, cta: d.cta, whatsappOpener: d.whatsappOpener, formQuestions: d.formQuestions, script: d.script,
        refCode: newRef(), compliance: { passed: bad.length === 0, issues: bad.map((x) => x.detail ?? x.label) }, checks, attempts, stampedPriceIdr: p.priceIdr,
        tags: { hookType: hookType(d.hook), format: d.format, seconds: files.seconds, visualSource: p.photoPath ? "foto" : "ilustrasi", hasPerson: false },
        assetPath: files.assetPath, posterPath: files.posterPath,
      });
      await logUsage(ctx, "assets", ASSET_COST[d.format], true, `${d.format} ${p.name}`);
      count++;
    }
  }
  await logActivity(ctx, "Tim kreatif", `Menyiapkan ${count} iklan untuk ${p.name}`, draft.rationale, "/approvals");
  return plan;
}

export async function approveCreative(ctx: Ctx, creativeId: string) {
  const { db, workspaceId } = ctx;
  const [c] = await db.select().from(creatives).where(and(eq(creatives.id, creativeId), eq(creatives.workspaceId, workspaceId)));
  if (!c || c.status !== "in_review") throw new Error("Iklan ini sudah diproses");
  if (!c.compliance.passed) throw new Error(`Perbaiki dulu: ${c.compliance.issues.join(", ")}`);
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, c.campaignId));
  if (await usedThisMonth(ctx, "ads") >= await getLimit(ctx, "ads_monthly")) throw new BudgetError("Batas belanja bulanan sudah tercapai. Naikkan di Pengaturan.");
  if (camp.status !== "live") {
    const [cap, live] = [await getLimit(ctx, "ads_daily"), await liveDailyTotal(ctx)];
    if (!fitsDailyCap(live, camp.dailyBudgetIdr, cap)) throw new BudgetError("Batas belanja harian tidak cukup untuk kampanye ini. Naikkan di Pengaturan atau hentikan kampanye lain.");
  }
  const platform = adsPlatform();
  const [p] = await db.select().from(products).where(eq(products.id, camp.productId));
  if (c.stampedPriceIdr !== null && c.stampedPriceIdr !== p.priceIdr) throw new Error(`Harga ${p.name} sudah berubah sejak iklan ini dibuat. Buat ulang iklannya.`);
  if (p.stock <= 0) throw new Error(`Stok ${p.name} habis. Iklan tidak bisa ditayangkan.`);
  if (!platform.simulated) {
    if (camp.goal === "form") throw new Error("Formulir Meta belum bisa dibuat otomatis. Tolak iklan ini atau buat formulirnya dulu di Meta.");
    if (camp.destination !== "whatsapp" && !p.sourceUrl) throw new Error(`Isi link produk ${p.name} dulu, iklan ini butuh link tujuan.`);
  }
  const r = await platform.launch({
    campaignName: camp.name, goal: camp.goal, destination: camp.destination, dailyBudgetIdr: camp.dailyBudgetIdr, existingCampaignId: camp.externalId, existingAdSetId: camp.externalAdSetId, adultOnly: p.category !== "general",
    headline: c.headline, primaryText: c.primaryText, cta: c.cta, whatsappOpener: c.whatsappOpener, refCode: c.refCode,
    assetFile: path.join(ASSET_DIR, c.posterPath ?? ""), format: c.format, landingUrl: p.sourceUrl ? withRef(p.sourceUrl, c.refCode) : null,
  });
  await db.update(creatives).set({ status: "live", externalId: r.adExternalId }).where(eq(creatives.id, c.id));
  await db.update(campaigns).set({ status: "live", externalId: r.campaignExternalId, externalAdSetId: r.adSetExternalId }).where(eq(campaigns.id, camp.id));
  await db.update(campaignPlans).set({ status: "approved" }).where(eq(campaignPlans.id, camp.planId));
  await logActivity(ctx, ctx.actor, `Menyetujui iklan "${c.hook}"`, r.activated ? `Tayang di ${camp.name}` : `Dibuat dalam kondisi dijeda di Meta`, "/ads");
}

export async function rejectCreative(ctx: Ctx, creativeId: string, reason: string) {
  const res = await ctx.db.update(creatives).set({ status: "rejected", rejectReason: reason })
    .where(and(eq(creatives.id, creativeId), eq(creatives.workspaceId, ctx.workspaceId), eq(creatives.status, "in_review"))).returning();
  if (res[0]) await logActivity(ctx, ctx.actor, `Menolak iklan "${res[0].hook}"`, reason, "/approvals");
}

const seeded = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000; }; };

const SIM_FEES: Partial<Record<OrderChannel, number>> = { tokopedia: 0.08, shopee: 0.09, tiktok_shop: 0.08 };
const ATTR: Record<string, "confirmed" | "partial" | "estimated"> = { whatsapp: "confirmed", website: "confirmed", shopify: "partial", tokopedia: "estimated", shopee: "estimated", tiktok_shop: "estimated" };

/** Simulated ad day. Only runs while Meta isn't connected. Clearly flagged as simulated in metrics. */
export async function simulateDay(ctx: Ctx, day: Date) {
  const { db, workspaceId } = ctx;
  const key = dayKey(day);
  const live = await db.select({ c: creatives, camp: campaigns, p: products }).from(creatives)
    .innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).innerJoin(products, eq(campaigns.productId, products.id))
    .where(and(eq(creatives.workspaceId, workspaceId), eq(creatives.status, "live")));
  const perCampaign = new Map<string, number>();
  for (const l of live) perCampaign.set(l.camp.id, (perCampaign.get(l.camp.id) ?? 0) + 1);

  for (const { c, camp, p } of live) {
    const r = seeded(c.refCode + key); const quality = seeded(c.refCode)() * 1.4 + 0.3;
    const spendIdr = Math.round((camp.dailyBudgetIdr / perCampaign.get(camp.id)!) * (0.85 + r() * 0.15));
    const impressions = Math.round((spendIdr / 18) * (0.8 + r() * 0.4));
    const reach = Math.round(impressions * 0.8);
    const clicks = Math.round(impressions * 0.012 * quality);
    const chats = camp.goal === "whatsapp_chat" ? Math.round(clicks * 0.35) : 0;
    const leads = camp.goal === "form" ? Math.round(clicks * 0.3) : 0;
    const qualifiedLeads = Math.round(leads * 0.6);
    await db.insert(adMetrics).values({
      workspaceId, creativeId: c.id, day: key, simulated: true, spendIdr, impressions, reach, clicks, chats, leads, qualifiedLeads,
      videoWatches: c.format === "video" ? Math.round(impressions * 0.22 * quality) : 0, frequency: 1.1 + r() * 0.9,
    }).onConflictDoNothing();
    await logUsage(ctx, "ads", spendIdr, true, c.refCode, day);

    const channel: OrderChannel | null =
      camp.destination === "whatsapp" ? "whatsapp" : camp.destination === "website" ? "website" : camp.destination === "shopify" ? "shopify"
      : camp.destination === "tokopedia" || camp.destination === "shopee" || camp.destination === "tiktok_shop" ? camp.destination : null;
    if (!channel) continue;
    const n = Math.round((camp.goal === "whatsapp_chat" ? chats * 0.28 : clicks * 0.05) * (0.7 + r() * 0.6));
    for (let i = 0; i < n; i++) {
      const cod = channel === "whatsapp" && r() < 0.6;
      await db.insert(orders).values({
        workspaceId, channel, productId: p.id, creativeId: c.id, customerName: "Pelanggan simulasi", quantity: 1,
        amountIdr: p.priceIdr, costIdr: p.costIdr, feesIdr: Math.round(p.priceIdr * (SIM_FEES[channel] ?? 0)),
        paymentMethod: cod ? "cod" : channel === "whatsapp" ? "transfer" : "platform", status: "shipped", attribution: ATTR[channel], orderedAt: day,
        externalId: `sim-${c.refCode}-${key}-${i}`,
      }).onConflictDoNothing();
    }
  }
  // Older shipped simulated orders resolve: most are delivered, COD returns more often.
  const shipped = await db.select().from(orders).where(and(eq(orders.workspaceId, workspaceId), eq(orders.status, "shipped")));
  for (const o of shipped) {
    if (day.getTime() - o.orderedAt.getTime() < 2 * 864e5 || !o.externalId?.startsWith("sim-")) continue;
    const r = seeded(o.id);
    const returned = r() < (o.paymentMethod === "cod" ? 0.22 : 0.04);
    await db.update(orders).set({ status: returned ? "returned" : "delivered", deliveredAt: returned ? null : day }).where(eq(orders.id, o.id));
  }
  await monitorAds(ctx, day);
}

/** Code-based pause and scale rules. Agents can't override budget caps. */
export async function monitorAds(ctx: Ctx, at = new Date(), platform: AdsPlatform = adsPlatform()) {
  const { db, workspaceId } = ctx;
  const goals = await db.select().from(goalTemplates).where(eq(goalTemplates.workspaceId, workspaceId));
  const live = await db.select({ c: creatives, camp: campaigns, p: products }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).innerJoin(products, eq(campaigns.productId, products.id))
    .where(and(eq(creatives.workspaceId, workspaceId), eq(creatives.status, "live")));
  const rb = await activeRules(ctx, "ads");
  const stopNoStock = rb?.rules.some((r) => r.id === "stop_no_stock" && r.enabled !== false) ?? true;
  const decisions: { hook: string; action: string }[] = [];
  for (const { c, camp, p } of live) {
    const base = goals.find((g) => g.key === camp.goal)?.rules;
    if (!base) continue;
    const rules = limitsFor(camp.goal, base, p, camp.destination);
    const m = await db.select().from(adMetrics).where(eq(adMetrics.creativeId, c.id));
    const sales = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.creativeId, c.id), inArray(orders.status, ["ordered", "confirmed", "paid", "shipped", "delivered"])));
    const stats = {
      spendIdr: m.reduce((s, x) => s + x.spendIdr, 0), impressions: m.reduce((s, x) => s + x.impressions, 0), reach: m.reduce((s, x) => s + x.reach, 0),
      videoWatches: m.reduce((s, x) => s + x.videoWatches, 0), frequency: m.at(-1)?.frequency ?? 1,
      chats: m.reduce((s, x) => s + x.chats, 0), qualifiedLeads: m.reduce((s, x) => s + x.qualifiedLeads, 0), sales: sales.length,
    };
    const d = stopNoStock && p.stock <= 0 ? { action: "pause" as const, reason: `Stok ${p.name} habis` } : evaluateAd(camp.goal, rules, stats);
    if (d.action === "pause") {
      const adId = platform.simulated ? null : realId(c.externalId);
      if (adId) await platform.pause(adId);
      await db.update(creatives).set({ status: "paused", pauseReason: d.reason }).where(eq(creatives.id, c.id));
      const others = await db.select({ id: creatives.id }).from(creatives).where(and(eq(creatives.campaignId, camp.id), eq(creatives.status, "live"), ne(creatives.id, c.id)));
      if (!others.length) await db.update(campaigns).set({ status: "paused" }).where(eq(campaigns.id, camp.id));
      await logActivity(ctx, "Media buyer", `Menjeda iklan "${c.hook}"`, d.reason, "/ads", at);
    } else if (d.action === "scale") {
      if (await usedThisMonth(ctx, "ads") >= await getLimit(ctx, "ads_monthly")) continue;
      const [cap, total] = [await getLimit(ctx, "ads_daily"), await liveDailyTotal(ctx)];
      const next = scaledBudget(camp.dailyBudgetIdr, rules.scaleStepPct, total, cap);
      if (next > camp.dailyBudgetIdr) {
        const adSet = platform.simulated ? null : realId(camp.externalAdSetId);
        if (adSet) await platform.setBudget(adSet, next);
        await db.update(campaigns).set({ dailyBudgetIdr: next }).where(eq(campaigns.id, camp.id));
        await logActivity(ctx, "Media buyer", `Menaikkan anggaran ${camp.name}`, d.reason, "/ads", at);
      }
    }
    decisions.push({ hook: c.hook, action: d.action });
  }
  return decisions;
}

export async function resumeCreative(ctx: Ctx, id: string) {
  const { db, workspaceId } = ctx;
  const [row] = await db.select({ c: creatives, camp: campaigns }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id))
    .where(and(eq(creatives.id, id), eq(creatives.workspaceId, workspaceId)));
  if (!row || row.c.status !== "paused") return;
  if (row.camp.status !== "live") {
    const [cap, live] = [await getLimit(ctx, "ads_daily"), await liveDailyTotal(ctx)];
    if (!fitsDailyCap(live, row.camp.dailyBudgetIdr, cap)) throw new BudgetError("Batas belanja harian tidak cukup untuk menayangkan kembali.");
  }
  await db.update(creatives).set({ status: "live", pauseReason: null }).where(eq(creatives.id, id));
  await db.update(campaigns).set({ status: "live" }).where(eq(campaigns.id, row.camp.id));
  await logActivity(ctx, ctx.actor, `Menayangkan lagi "${row.c.hook}"`, "", "/ads");
}

/** Pulls real results from Meta, counts chats from linked conversations, then applies the pause and scale rules. */
export async function syncFromMeta(ctx: Ctx, platform: AdsPlatform = adsPlatform()) {
  const { db, workspaceId } = ctx;
  if (platform.simulated) return 0;
  const since = dayKey(new Date(Date.now() - 30 * 864e5));
  const ads = await db.select().from(creatives).where(and(eq(creatives.workspaceId, workspaceId), inArray(creatives.status, ["live", "paused"])));
  let days = 0;
  for (const c of ads) {
    const id = realId(c.externalId);
    if (!id) continue;
    const chats = await db.select({ at: conversations.createdAt }).from(conversations).where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.creativeId, c.id)));
    for (const m of await platform.insights(id, since)) {
      const values = { spendIdr: m.spendIdr, impressions: m.impressions, reach: m.reach, clicks: m.clicks, videoWatches: m.videoWatches, frequency: m.frequency, simulated: false, chats: chats.filter((x) => dayKey(x.at) === m.day).length };
      await db.insert(adMetrics).values({ workspaceId, creativeId: c.id, day: m.day, ...values }).onConflictDoUpdate({ target: [adMetrics.creativeId, adMetrics.day], set: values });
      days++;
    }
  }
  await monitorAds(ctx, new Date(), platform);
  await logActivity(ctx, "Media buyer", "Mengambil hasil dari Meta", `${days} baris hasil harian`, "/ads");
  return days;
}
