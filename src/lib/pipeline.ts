import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { adMetrics, campaignPlans, campaigns, angles, conversations, creatives, goalTemplates, objections, orders, products, rulebooks, workspaces, type CreativeCheck, type GoalKey, type OrderChannel } from "@/db/schema";
import { applyVoice } from "./voice";
import { draftAngles, draftCreative, rewriteCopy, type AngleDraft, type CreativeDraft, type PlanInput } from "./ai/creative";
import { angleCapacity, compareCells, findDuplicate, PER_ANGLE_GOAL_IDR, TEST_GOALS, type Cell, type CellResult } from "./angles/logic";
import { adScore } from "./queries";
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

type BuildOpts = { rewrite?: Rewriter; review?: VisualReviewer };
type AngleRow = typeof angles.$inferSelect;

async function planInput(ctx: Ctx, p: typeof products.$inferSelect) {
  const { db, workspaceId } = ctx;
  const [w] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const rb = await activeRules(ctx, "ads");
  const goals = await db.select().from(goalTemplates).where(eq(goalTemplates.workspaceId, workspaceId));
  const enabled = rb?.rules.filter((r) => r.enabled !== false) ?? [];
  const facts = await factsFor(ctx, p.id);
  const objs = await db.select({ text: objections.text }).from(objections).where(eq(objections.productId, p.id)).limit(20);
  const input: PlanInput = {
    name: p.name, description: p.description, priceIdr: p.priceIdr, costIdr: p.costIdr, approvedClaims: p.approvedClaims, proof: p.proof,
    rules: enabled.map((r) => r.text), tone: rb?.tone ?? "", goals: goals.map((g) => ({ key: g.key, name: g.name, briefFormat: g.briefFormat })),
    alwaysSay: p.alwaysSay, neverSay: p.neverSay, facts: facts.map((f) => `${f.question} ${f.answer}`), objections: objs.map((o) => o.text), voiceExample: w.settings.voice?.adExample ?? "",
  };
  return { w, input, goals, blocked: enabled.map((r) => r.block).filter((x): x is string => !!x), showPrice: enabled.some((r) => r.id === "show_price") };
}

async function buildCreative(ctx: Ctx, base: Awaited<ReturnType<typeof planInput>>, p: typeof products.$inferSelect, camp: typeof campaigns.$inferSelect, angle: AngleRow, format: "image" | "video", opts: BuildOpts) {
  const { db, workspaceId } = ctx;
  const { w, input, blocked, showPrice } = base;
  await assertRoom(ctx, "assets", ASSET_COST[format]);
  if (aiEnabled()) await assertRoom(ctx, "ai", REWRITE_AI_ESTIMATE);
  let d = await draftCreative(input, angle, camp.goal, format);
  if (aiEnabled()) await logUsage(ctx, "ai", REWRITE_AI_ESTIMATE, false, `Iklan ${p.name} (perkiraan)`);
  else { d.primaryText = applyVoice(d.primaryText, w.settings.voice?.key); d.hook = applyVoice(d.hook, w.settings.voice?.key); }
  const rewrite = opts.rewrite ?? (aiEnabled() ? rewriteCopy : null);
  const review = opts.review ?? (aiEnabled() ? reviewVisual : null);
  let attempts = 1;
  let copyChecks = textChecks(d, p, blocked, camp.goal);
  while (failed(copyChecks).length && rewrite && attempts < MAX_ATTEMPTS) {
    await assertRoom(ctx, "ai", REWRITE_AI_ESTIMATE);
    d = await rewrite(d, failed(copyChecks).map((x) => x.detail ?? x.label), input);
    await logUsage(ctx, "ai", REWRITE_AI_ESTIMATE, !aiEnabled(), `Perbaikan iklan ${p.name} (perkiraan)`);
    attempts++;
    copyChecks = textChecks(d, p, blocked, camp.goal);
  }
  const id = crypto.randomUUID();
  const prices = showPrice && camp.goal !== "eyeball";
  const files = await renderCreative({
    id, goal: camp.goal, hook: d.hook, line2: d.headline, cta: d.cta, productName: p.name, priceIdr: p.priceIdr, brandName: w.name, brand: w.settings.brand,
    visual: p.visual, photoPath: p.photoPath, format, showPrice: prices, aiLabel: w.settings.aiLabelAds,
  });
  const checks: CreativeCheck[] = [
    ...copyChecks,
    ...await fileChecks(path.join(ASSET_DIR, files.assetPath), format, MAX_SECONDS[camp.goal] ?? 30),
    { key: "price", label: "Harga dicetak sistem", status: "pass", detail: prices ? idr(p.priceIdr) : "Tanpa harga" },
    p.photoPath ? { key: "photo", label: "Foto produk asli", status: "pass" } : { key: "photo", label: "Foto produk asli", status: "warn", detail: "Masih ilustrasi contoh. Unggah foto asli sebelum tayang sungguhan." },
    review ? await review(files.frames, p.name, p.photoPath) : { key: "ai_visual", label: "Tinjauan visual AI", status: "not_run", detail: "Butuh Claude" },
  ];
  const bad = failed(checks);
  await db.insert(creatives).values({
    id, workspaceId, campaignId: camp.id, angleId: angle.id, concept: d.concept, format, hook: d.hook,
    primaryText: d.primaryText, headline: d.headline, cta: d.cta, whatsappOpener: d.whatsappOpener, formQuestions: d.formQuestions, script: d.script,
    refCode: newRef(), compliance: { passed: bad.length === 0, issues: bad.map((x) => x.detail ?? x.label) }, checks, attempts, stampedPriceIdr: p.priceIdr,
    tags: { hookType: hookType(d.hook), angleType: angle.type, format, seconds: files.seconds, visualSource: p.photoPath ? "foto" : "ilustrasi", hasPerson: false },
    assetPath: files.assetPath, posterPath: files.posterPath,
  });
  await logUsage(ctx, "assets", ASSET_COST[format], true, `${format} ${p.name}`);
}

async function ownedProduct(ctx: Ctx, productId: string) {
  const [p] = await ctx.db.select().from(products).where(and(eq(products.id, productId), eq(products.workspaceId, ctx.workspaceId)));
  if (!p) throw new Error("Produk tidak ditemukan");
  return p;
}

/** Adds new angle ideas, skipping anything too close to what this product already has. */
export async function draftMoreAngles(ctx: Ctx, productId: string) {
  const p = await ownedProduct(ctx, productId);
  const { input } = await planInput(ctx, p);
  const existing = await ctx.db.select().from(angles).where(and(eq(angles.productId, productId), eq(angles.workspaceId, ctx.workspaceId)));
  if (aiEnabled()) await assertRoom(ctx, "ai", PLAN_AI_ESTIMATE);
  const draft = await draftAngles(input, p.visual.shape, existing.map((a) => a.title));
  if (aiEnabled()) await logUsage(ctx, "ai", PLAN_AI_ESTIMATE, false, `Sudut pandang ${p.name} (perkiraan)`);
  const kept: AngleDraft[] = [];
  for (const a of draft.angles) if (!findDuplicate(a, [...existing, ...kept])) kept.push(a);
  if (kept.length) await ctx.db.insert(angles).values(kept.map((a) => ({ workspaceId: ctx.workspaceId, productId, ...a })));
  return { added: kept.length, rationale: draft.rationale };
}

/** Starts testing as many ideas as the budget can support, each with the same goals, format, and budget. */
export async function generatePlan(ctx: Ctx, productId: string, opts: BuildOpts = {}) {
  const { db, workspaceId } = ctx;
  const p = await ownedProduct(ctx, productId);
  const more = await draftMoreAngles(ctx, productId);
  const ideas = await db.select().from(angles).where(and(eq(angles.productId, productId), eq(angles.status, "idea"))).orderBy(asc(angles.createdAt));
  if (!ideas.length) throw new Error("Belum ada ide sudut pandang baru. Tambahkan sendiri, atau hubungkan Claude untuk ide baru.");
  const room = (await getLimit(ctx, "ads_daily")) - (await liveDailyTotal(ctx));
  const picked = ideas.slice(0, Math.max(1, angleCapacity(room)));
  const base = await planInput(ctx, p);
  const [plan] = await db.insert(campaignPlans).values({ workspaceId, productId, rationale: more.rationale || `Menguji ${picked.length} sudut pandang.` }).returning();

  const hadCampaigns = (await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.productId, productId)).limit(1)).length > 0;
  const name = (g: GoalKey) => `${p.name}: ${base.goals.find((x) => x.key === g)?.name ?? g}`;
  let count = 0;
  for (const t of TEST_GOALS) {
    const [camp] = await db.insert(campaigns).values({ workspaceId, planId: plan.id, productId, goal: t.goal, destination: t.destination, name: name(t.goal), dailyBudgetIdr: PER_ANGLE_GOAL_IDR * picked.length }).returning();
    for (const a of picked) { await buildCreative(ctx, base, p, camp, a, t.format, opts); count++; }
  }
  if (!hadCampaigns) {
    for (const [goal, destination, budget] of [["form", "form", 100000], ["retargeting", "tokopedia", 75000]] as const) {
      const [camp] = await db.insert(campaigns).values({ workspaceId, planId: plan.id, productId, goal, destination, name: name(goal), dailyBudgetIdr: budget }).returning();
      await buildCreative(ctx, base, p, camp, picked[0], "image", opts); count++;
    }
  }
  await db.update(angles).set({ status: "testing" }).where(inArray(angles.id, picked.map((a) => a.id)));
  await logActivity(ctx, "Tim kreatif", `Menyiapkan ${count} iklan untuk ${picked.length} sudut pandang ${p.name}`, plan.rationale, "/approvals");
  return plan;
}

/** Puts one more angle into the existing test campaigns. Its ads still wait for approval. */
export async function testAngle(ctx: Ctx, angleId: string, opts: BuildOpts = {}) {
  const { db, workspaceId } = ctx;
  const [angle] = await db.select().from(angles).where(and(eq(angles.id, angleId), eq(angles.workspaceId, workspaceId)));
  if (!angle) throw new Error("Sudut pandang tidak ditemukan");
  if (angle.status !== "idea") return 0;
  const p = await ownedProduct(ctx, angle.productId);
  const base = await planInput(ctx, p);
  let count = 0;
  for (const t of TEST_GOALS) {
    let [camp] = await db.select().from(campaigns).where(and(eq(campaigns.productId, p.id), eq(campaigns.goal, t.goal))).orderBy(desc(campaigns.createdAt)).limit(1);
    if (!camp) {
      const [plan] = await db.insert(campaignPlans).values({ workspaceId, productId: p.id, rationale: `Menguji "${angle.title}".` }).returning();
      [camp] = await db.insert(campaigns).values({ workspaceId, planId: plan.id, productId: p.id, goal: t.goal, destination: t.destination, name: `${p.name}: ${base.goals.find((x) => x.key === t.goal)?.name ?? t.goal}`, dailyBudgetIdr: PER_ANGLE_GOAL_IDR }).returning();
    }
    await buildCreative(ctx, base, p, camp, angle, t.format, opts); count++;
  }
  await db.update(angles).set({ status: "testing", stopReason: null }).where(eq(angles.id, angle.id));
  await logActivity(ctx, "Tim kreatif", `Menyiapkan ${count} iklan untuk "${angle.title}"`, "Menunggu persetujuanmu", "/approvals");
  return count;
}

export async function addManualAngle(ctx: Ctx, productId: string, a: { title: string; audience: string; pain: string; promise: string; proof: string; hook: string }) {
  await ownedProduct(ctx, productId);
  const existing = await ctx.db.select().from(angles).where(and(eq(angles.productId, productId), eq(angles.workspaceId, ctx.workspaceId)));
  const dup = findDuplicate(a, existing);
  await ctx.db.insert(angles).values({ workspaceId: ctx.workspaceId, productId, ...a, type: "problem", source: "manual" });
  return dup?.title ?? null;
}

/** Stopping an angle pauses its live ads and removes its waiting ads. */
export async function stopAngle(ctx: Ctx, angleId: string, reason: string) {
  const { db, workspaceId } = ctx;
  const [angle] = await db.select().from(angles).where(and(eq(angles.id, angleId), eq(angles.workspaceId, workspaceId)));
  if (!angle) throw new Error("Sudut pandang tidak ditemukan");
  const platform = adsPlatform();
  const ads = await db.select().from(creatives).where(eq(creatives.angleId, angleId));
  for (const c of ads) {
    if (c.status === "live") {
      const id = platform.simulated ? null : realId(c.externalId);
      if (id) await platform.pause(id);
      await db.update(creatives).set({ status: "paused", pauseReason: reason }).where(eq(creatives.id, c.id));
      const others = await db.select({ id: creatives.id }).from(creatives).where(and(eq(creatives.campaignId, c.campaignId), eq(creatives.status, "live")));
      if (!others.length) await db.update(campaigns).set({ status: "paused" }).where(eq(campaigns.id, c.campaignId));
    } else if (c.status === "in_review") {
      await db.update(creatives).set({ status: "rejected", rejectReason: reason }).where(eq(creatives.id, c.id));
    }
  }
  await db.update(angles).set({ status: "stopped", stopReason: reason }).where(eq(angles.id, angleId));
  await logActivity(ctx, ctx.actor, `Menghentikan "${angle.title}"`, reason, `/products/${angle.productId}`);
}

export async function restoreAngle(ctx: Ctx, angleId: string) {
  await ctx.db.update(angles).set({ status: "idea", stopReason: null }).where(and(eq(angles.id, angleId), eq(angles.workspaceId, ctx.workspaceId), eq(angles.status, "stopped")));
}

export async function angleCells(ctx: Ctx, productId?: string): Promise<CellResult[]> {
  const rows = await ctx.db.select({ id: creatives.id, angleId: creatives.angleId, goal: campaigns.goal }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id))
    .where(and(eq(creatives.workspaceId, ctx.workspaceId), productId ? eq(campaigns.productId, productId) : undefined));
  const score = await adScore(ctx, rows.map((r) => r.id));
  const map = new Map<string, Cell>();
  for (const r of rows) {
    const s = score.get(r.id)!; const k = `${r.angleId}:${r.goal}`;
    const c = map.get(k) ?? { angleId: r.angleId, goal: r.goal, spend: 0, reach: 0, qualified: 0, sales: 0 };
    c.spend += s.spend; c.reach += s.reach; c.qualified += s.qualified; c.sales += s.sales; map.set(k, c);
  }
  return compareCells([...map.values()]);
}

/** After ad rules run: angles with nothing left running stop, clear leaders win, and the next idea takes a stopped angle's place. */
async function reviewAngles(ctx: Ctx, at: Date) {
  const { db, workspaceId } = ctx;
  const list = await db.select().from(angles).where(and(eq(angles.workspaceId, workspaceId), inArray(angles.status, ["testing", "winning"])));
  const byProduct = new Map<string, AngleRow[]>();
  for (const a of list) byProduct.set(a.productId, [...(byProduct.get(a.productId) ?? []), a]);
  for (const [productId, group] of byProduct) {
    const cells = await angleCells(ctx, productId);
    for (const a of group) {
      const ads = await db.select({ status: creatives.status, reason: creatives.pauseReason }).from(creatives).where(eq(creatives.angleId, a.id));
      const active = ads.some((c) => c.status === "live" || c.status === "in_review" || c.status === "approved");
      if (!active && ads.some((c) => c.status === "paused")) {
        const reason = ads.find((c) => c.reason)?.reason ?? "Semua iklannya dijeda";
        await db.update(angles).set({ status: "stopped", stopReason: reason }).where(eq(angles.id, a.id));
        await logActivity(ctx, "Media buyer", `Menghentikan sudut pandang "${a.title}"`, reason, `/products/${productId}`, at);
        const [next] = await db.select().from(angles).where(and(eq(angles.productId, productId), eq(angles.status, "idea"))).orderBy(asc(angles.createdAt)).limit(1);
        if (next) await testAngle(ctx, next.id).catch((e) => { if (!(e instanceof BudgetError)) throw e; });
        continue;
      }
      const wins = cells.some((c) => c.angleId === a.id && c.best);
      if (wins !== (a.status === "winning")) {
        await db.update(angles).set({ status: wins ? "winning" : "testing" }).where(eq(angles.id, a.id));
        if (wins) await logActivity(ctx, "Media buyer", `"${a.title}" memimpin`, "Biaya per hasilnya jelas lebih rendah pada tujuan yang sama", `/products/${productId}`, at);
      }
    }
  }
}

export async function approveCreative(ctx: Ctx, creativeId: string) {
  const { db, workspaceId } = ctx;
  const [c] = await db.select().from(creatives).where(and(eq(creatives.id, creativeId), eq(creatives.workspaceId, workspaceId)));
  if (!c || c.status !== "in_review") throw new Error("Iklan ini sudah diproses");
  if (!c.compliance.passed) throw new Error(`Perbaiki dulu: ${c.compliance.issues.join(", ")}`);
  const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, c.campaignId));
  if (await usedThisMonth(ctx, "ads") >= await getLimit(ctx, "ads_monthly")) throw new BudgetError("Batas belanja bulanan sudah tercapai. Naikkan di Pengaturan.");
  let raisedBudget: number | null = null;
  if (camp.status !== "live") {
    const [cap, live] = [await getLimit(ctx, "ads_daily"), await liveDailyTotal(ctx)];
    if (!fitsDailyCap(live, camp.dailyBudgetIdr, cap)) throw new BudgetError("Batas belanja harian tidak cukup untuk kampanye ini. Naikkan di Pengaturan atau hentikan kampanye lain.");
  } else if (TEST_GOALS.some((t) => t.goal === camp.goal)) {
    // Each angle keeps its share when another joins a running test.
    const running = await db.select({ id: creatives.id }).from(creatives).where(and(eq(creatives.campaignId, camp.id), eq(creatives.status, "live")));
    const need = (running.length + 1) * PER_ANGLE_GOAL_IDR;
    if (need > camp.dailyBudgetIdr) {
      const [cap, live] = [await getLimit(ctx, "ads_daily"), await liveDailyTotal(ctx)];
      if (!fitsDailyCap(live, need - camp.dailyBudgetIdr, cap)) throw new BudgetError("Batas belanja harian tidak cukup untuk menambah sudut pandang ini. Naikkan di Pengaturan atau hentikan sudut pandang lain.");
      raisedBudget = need;
    }
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
  if (raisedBudget !== null && !platform.simulated) await platform.setBudget(r.adSetExternalId, raisedBudget);
  await db.update(campaigns).set({ status: "live", externalId: r.campaignExternalId, externalAdSetId: r.adSetExternalId, ...(raisedBudget !== null ? { dailyBudgetIdr: raisedBudget } : {}) }).where(eq(campaigns.id, camp.id));
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
  await reviewAngles(ctx, at);
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
