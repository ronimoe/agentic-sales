"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { newVersion, rollback } from "@/lib/rules";
import { VOICES, type VoiceKey } from "@/lib/voice";
import { adMetrics, budgetLimits, conversations, goalTemplates, knowledge, products, variants, workspaces, type GoalRules, type KnowledgeTopic, type OrderChannel, type OrderStatus } from "@/db/schema";
import { draftFacts, runAiReadiness } from "@/lib/knowledge/service";
import { KNOWLEDGE_TOPICS, POLICY_TOPICS } from "@/lib/knowledge/policies";
import { adapterStatus } from "@/lib/adapters";
import { fetchPublicText } from "@/lib/safe-fetch";
import { saveUploadedImage } from "@/lib/assets/upload";
import { PROVINCES } from "@/lib/orders/shipping";
import { runCloser } from "@/lib/ai/closer";
import { can, getCtx } from "@/lib/ctx";
import { dayKey } from "@/lib/format";
import { importCsv, setOrderStatus } from "@/lib/orders/service";
import { addManualAngle, draftMoreAngles, restoreAngle, stopAngle, testAngle, approveCreative, generatePlan, monitorAds, rejectCreative, resumeCreative, simulateDay, syncFromMeta } from "@/lib/pipeline";
import { adsPlatform, realId } from "@/lib/ads/platform";
import { logActivity } from "@/lib/log";
import { creatives, campaigns } from "@/db/schema";
import { answerAsHuman, receiveInbound } from "@/lib/whatsapp/service";

async function flash(text: string) { (await cookies()).set("flash", text.slice(0, 300), { maxAge: 30, path: "/" }); }
const done = () => revalidatePath("/", "layout");
async function guard(fn: () => Promise<void>) {
  try { await fn(); } catch (e) { await flash(e instanceof Error ? e.message : "Terjadi kesalahan"); }
  done();
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const money = (s: string) => Math.max(0, Number(s.replace(/[^\d]/g, "")) || 0);

async function needRole(action: "approve" | "settings") {
  const ctx = await getCtx();
  if (!can(ctx.member.role, action)) throw new Error("Peranmu tidak bisa melakukan ini");
  return ctx;
}

export async function approve(id: string) { await guard(async () => approveCreative(await needRole("approve"), id)); }
export async function reject(id: string, reason: string) { await guard(async () => rejectCreative(await needRole("approve"), id, reason || "Tanpa alasan")); }
export async function resume(id: string) { await guard(async () => resumeCreative(await needRole("approve"), id)); }
export async function pauseAd(id: string) {
  await guard(async () => {
    const ctx = await needRole("approve");
    const [row] = await ctx.db.select().from(creatives).where(and(eq(creatives.id, id), eq(creatives.workspaceId, ctx.workspaceId)));
    if (!row) return;
    const adId = realId(row.externalId);
    if (adId && !adsPlatform().simulated) await adsPlatform().pause(adId);
    await ctx.db.update(creatives).set({ status: "paused", pauseReason: `Dijeda oleh ${ctx.actor}` }).where(eq(creatives.id, id));
    const others = await ctx.db.select({ id: creatives.id }).from(creatives).where(and(eq(creatives.campaignId, row.campaignId), eq(creatives.status, "live")));
    if (!others.length) await ctx.db.update(campaigns).set({ status: "paused" }).where(eq(campaigns.id, row.campaignId));
    await logActivity(ctx, ctx.actor, `Menjeda iklan "${row.hook}"`, "", "/ads");
  });
}
export async function draftIdeas(productId: string) {
  await guard(async () => { const r = await draftMoreAngles(await needRole("approve"), productId); await flash(r.added ? `${r.added} ide baru ditambahkan` : "Belum ada ide baru. Tambahkan sendiri, atau hubungkan Claude untuk ide baru."); });
}
export async function testIdea(id: string) { await guard(async () => { await testAngle(await needRole("approve"), id); }); }
export async function stopIdea(id: string) { await guard(async () => { const ctx = await needRole("approve"); await stopAngle(ctx, id, `Dihentikan oleh ${ctx.actor}`); }); }
export async function restoreIdea(id: string) { await guard(async () => { await restoreAngle(await needRole("approve"), id); }); }
export async function addAngle(productId: string, f: FormData) {
  const title = str(f, "title"); if (!title) return;
  await guard(async () => {
    const dup = await addManualAngle(await needRole("approve"), productId, { title, audience: str(f, "audience"), pain: str(f, "pain"), promise: str(f, "promise"), proof: str(f, "proof"), hook: str(f, "hook") || title });
    if (dup) await flash(`Tersimpan, tapi mirip dengan "${dup}"`);
  });
}
export async function createPlan(productId: string) { await guard(async () => { await generatePlan(await needRole("approve"), productId); }); }

export async function addFact(productId: string, topic: KnowledgeTopic, question: string, f: FormData) {
  const answer = str(f, "answer"); if (!answer) return;
  await guard(async () => {
    const ctx = await needRole("approve");
    await ownProduct(ctx, productId);
    if (!KNOWLEDGE_TOPICS.includes(topic)) throw new Error("Topik tidak dikenal");
    await ctx.db.insert(knowledge).values({ workspaceId: ctx.workspaceId, productId, topic, question: question.slice(0, 300), answer, status: "confirmed", source: "manual" });
  });
}
/** Store policies affect every product, so changing one needs the settings role. */
async function factForEdit(id: string) {
  const ctx = await needRole("approve");
  const [row] = await ctx.db.select().from(knowledge).where(and(eq(knowledge.id, id), eq(knowledge.workspaceId, ctx.workspaceId)));
  if (!row) throw new Error("Jawaban tidak ditemukan");
  if (!row.productId && !can(ctx.member.role, "settings")) throw new Error("Peranmu tidak bisa mengubah kebijakan toko");
  return ctx;
}
export async function confirmFact(id: string, f: FormData) {
  await guard(async () => {
    const ctx = await factForEdit(id);
    await ctx.db.update(knowledge).set({ status: "confirmed", question: str(f, "question"), answer: str(f, "answer") }).where(and(eq(knowledge.id, id), eq(knowledge.workspaceId, ctx.workspaceId)));
  });
}
export async function deleteFact(id: string) {
  await guard(async () => {
    const ctx = await factForEdit(id);
    await ctx.db.delete(knowledge).where(and(eq(knowledge.id, id), eq(knowledge.workspaceId, ctx.workspaceId)));
  });
}
export async function draftFromSource(productId: string, f: FormData) {
  await guard(async () => {
    const ctx = await needRole("approve");
    await ownProduct(ctx, productId);
    const url = str(f, "url"); const text = str(f, "text");
    if (!url && !text) throw new Error("Isi link atau tempel teks dulu");
    const n = await draftFacts(ctx, productId, url ? await fetchPublicText(url) : text, url ? "link" : "manual");
    await flash(`${n} draf siap diperiksa`);
  });
}
export async function testReadiness(productId: string) {
  await guard(async () => { await runAiReadiness(await needRole("approve"), productId); });
}
export async function saveVariant(productId: string, f: FormData) {
  const name = str(f, "name"); if (!name) return;
  await guard(async () => {
    const ctx = await needRole("approve");
    await ownProduct(ctx, productId);
    const stock = money(str(f, "stock"));
    await ctx.db.insert(variants).values({ workspaceId: ctx.workspaceId, productId, name, stock }).onConflictDoUpdate({ target: [variants.productId, variants.name], set: { stock } });
    const [t] = await ctx.db.select({ v: sql<number>`coalesce(sum(${variants.stock}),0)::int` }).from(variants).where(eq(variants.productId, productId));
    await ctx.db.update(products).set({ stock: t.v }).where(eq(products.id, productId));
  });
}
export async function savePolicies(f: FormData) {
  await guard(async () => {
    const ctx = await needRole("settings");
    for (const [topic, question] of POLICY_TOPICS) {
      const answer = str(f, topic);
      await ctx.db.delete(knowledge).where(and(eq(knowledge.workspaceId, ctx.workspaceId), isNull(knowledge.productId), eq(knowledge.topic, topic)));
      if (answer) await ctx.db.insert(knowledge).values({ workspaceId: ctx.workspaceId, productId: null, topic, question, answer, status: "confirmed", source: "manual" });
    }
  });
}

async function ownProduct(ctx: { db: Awaited<ReturnType<typeof getCtx>>["db"]; workspaceId: string }, id: string) {
  const [p] = await ctx.db.select().from(products).where(and(eq(products.id, id), eq(products.workspaceId, ctx.workspaceId)));
  if (!p) throw new Error("Produk tidak ditemukan");
  return p;
}

function productValues(f: FormData) {
  const category = (["cosmetic", "food", "general"].includes(str(f, "category")) ? str(f, "category") : "general") as "cosmetic" | "food" | "general";
  const opt = (k: string) => (str(f, k) ? money(str(f, k)) : null);
  return {
    name: str(f, "name"), category, description: str(f, "description"), sourceUrl: str(f, "sourceUrl") || null, priceIdr: money(str(f, "price")), costIdr: money(str(f, "cost")),
    bpomNumber: str(f, "bpom") || null, halalStatus: str(f, "halal") || null, approvedClaims: lines(str(f, "claims")), proof: lines(str(f, "proof")),
    alwaysSay: lines(str(f, "alwaysSay")), neverSay: lines(str(f, "neverSay")), targetCostIdr: opt("targetCost"), stopSpendIdr: opt("stopSpend"),
  };
}
async function photoFrom(f: FormData) {
  const file = f.get("photo");
  if (!(file instanceof File) || !file.size) return {};
  return { photoPath: await saveUploadedImage(file, 8e6) };
}
export async function saveProduct(f: FormData) {
  const ctx = await needRole("approve");
  const v = productValues(f);
  if (!v.name) { await flash("Isi nama produk dulu"); done(); return; }
  let id: string | null = null;
  try {
    const [p] = await ctx.db.insert(products).values({ workspaceId: ctx.workspaceId, ...v, stock: money(str(f, "stock")), ...(await photoFrom(f)) }).returning();
    id = p.id;
  } catch (e) { await flash(e instanceof Error ? e.message : "Gagal menyimpan"); }
  done();
  if (id) redirect(`/products/${id}`);
}
export async function updateProduct(id: string, f: FormData) {
  const ctx = await needRole("approve");
  const v = productValues(f);
  try {
    await ownProduct(ctx, id);
    const stock = f.has("stock") ? { stock: money(str(f, "stock")) } : {};
    await ctx.db.update(products).set({ ...v, ...stock, ...(await photoFrom(f)) }).where(and(eq(products.id, id), eq(products.workspaceId, ctx.workspaceId)));
  } catch (e) { await flash(e instanceof Error ? e.message : "Gagal menyimpan"); }
  done();
  redirect(`/products/${id}`);
}

export async function simulate() {
  await guard(async () => {
    const ctx = await getCtx();
    if (!adsPlatform().simulated) throw new Error("Meta sudah tersambung, simulasi dimatikan");
    const [last] = await ctx.db.select({ day: adMetrics.day }).from(adMetrics).where(eq(adMetrics.workspaceId, ctx.workspaceId)).orderBy(desc(adMetrics.day)).limit(1);
    const next = last ? new Date(new Date(`${last.day}T12:00:00+07:00`).getTime() + 864e5) : new Date();
    await simulateDay(ctx, next);
    await flash(`Hari ${dayKey(next)} disimulasikan`);
  });
}
export async function syncMeta() { await guard(async () => { await flash(`${await syncFromMeta(await getCtx())} baris hasil diambil dari Meta`); }); }
export async function runMonitor() { await guard(async () => { await monitorAds(await getCtx()); }); }

export async function customerSays(f: FormData) {
  if (adapterStatus().whatsapp) { await flash("Simulator dimatikan karena WhatsApp sudah tersambung"); done(); return; }
  const phone = str(f, "phone").replace(/\D/g, ""); const text = str(f, "text");
  if (!phone || !text) return;
  const ctx = await getCtx();
  const r = await receiveInbound(ctx, { phone, name: str(f, "name"), text, simulated: true, refCode: str(f, "ref") || null });
  if (r?.runCloser) await runCloser(ctx, r.conversationId);
  done();
  if (r) redirect(`/chats?c=${r.conversationId}`);
}
export async function humanReply(conversationId: string, f: FormData) {
  const text = str(f, "text"); if (!text) return;
  await guard(async () => {
    const ctx = await getCtx();
    await answerAsHuman(ctx, conversationId, text);
  });
}
export async function setHandler(conversationId: string, handler: "ai" | "human") {
  await guard(async () => {
    const ctx = await getCtx();
    await ctx.db.update(conversations).set({ handler, handoffReason: null }).where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, ctx.workspaceId)));
  });
}

export async function updateOrder(id: string, status: OrderStatus) { await guard(async () => setOrderStatus(await getCtx(), id, status)); }
export async function importOrders(f: FormData) {
  await guard(async () => {
    const ctx = await getCtx();
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) throw new Error("Pilih file CSV dulu");
    if (file.size > 5e6) throw new Error("File lebih dari 5 MB");
    const r = await importCsv(ctx, str(f, "channel") as OrderChannel, await file.text());
    await flash(`${r.imported} pesanan masuk, ${r.unmatched} tanpa produk cocok, ${r.errors.length} baris dilewati.${r.errors[0] ? ` ${r.errors[0]}` : ""}`);
  });
}

export async function saveBudget(f: FormData) {
  await guard(async () => {
    const ctx = await needRole("settings");
    for (const kind of ["ads_daily", "ads_monthly", "assets_monthly", "ai_monthly", "whatsapp_monthly"] as const) {
      await ctx.db.update(budgetLimits).set({ amountIdr: money(str(f, kind)) }).where(and(eq(budgetLimits.workspaceId, ctx.workspaceId), eq(budgetLimits.kind, kind)));
    }
    await logActivity(ctx, ctx.actor, "Mengubah anggaran", "", "/settings");
  });
}
export async function saveSettings(f: FormData) {
  await guard(async () => {
    const ctx = await needRole("settings");
    const s = ctx.workspace.settings;
    await ctx.db.update(workspaces).set({ settings: { ...s, aiLabelAds: f.get("aiLabel") === "on", codAreas: f.getAll("codAreas").map(String).filter((p) => PROVINCES.includes(p)),
      whatsappCost: { ...s.whatsappCost, marketingIdr: money(str(f, "marketing")), serviceIdr: money(str(f, "service")) },
      quietHours: { startHour: Math.min(23, money(str(f, "quietStart"))), endHour: Math.min(23, money(str(f, "quietEnd"))) } } }).where(eq(workspaces.id, ctx.workspaceId));
  });
}
export async function toggleRule(kind: "ads" | "whatsapp", id: string) {
  await guard(async () => {
    const ctx = await needRole("settings");
    await newVersion(ctx, kind, (r) => ({ ...r, rules: r.rules.map((x) => x.id === id ? { ...x, enabled: x.enabled === false } : x) }), "");
  });
}
export async function rollbackRules(kind: "ads" | "whatsapp") { await guard(async () => rollback(await needRole("settings"), kind)); }
export async function addBlockedWord(f: FormData) {
  const word = str(f, "word"); if (!word) return;
  await guard(async () => {
    const ctx = await needRole("settings");
    await newVersion(ctx, "ads", (r) => ({ ...r, rules: [...r.rules, { id: crypto.randomUUID(), text: `Jangan pakai kata "${word}"`, source: "manual", block: word }] }), `Melarang "${word}"`);
  });
}
export async function adoptReason(reason: string) {
  await guard(async () => {
    const ctx = await needRole("settings");
    await newVersion(ctx, "ads", (r) => ({ ...r, rules: [...r.rules, { id: crypto.randomUUID(), text: `Hindari: ${reason}`, source: "decision" }] }), "Dari alasan penolakan iklan");
  });
}
export async function setVoice(key: VoiceKey) {
  await guard(async () => {
    const ctx = await needRole("settings");
    const v = VOICES[key];
    await ctx.db.update(workspaces).set({ settings: { ...ctx.workspace.settings, voice: { key, adExample: v.ad, chatExample: v.chat } } }).where(eq(workspaces.id, ctx.workspaceId));
    for (const kind of ["ads", "whatsapp"] as const) await newVersion(ctx, kind, (r) => ({ ...r, tone: v.tone }), `Gaya bicara: ${v.name}`);
  });
}
export async function saveBrand(f: FormData) {
  await guard(async () => {
    const ctx = await needRole("settings");
    const hex = (k: string, d: string) => /^#[0-9a-f]{6}$/i.test(str(f, k)) ? str(f, k) : d;
    const cur = ctx.workspace.settings.brand;
    const logo = f.get("logo");
    const logoPath = logo instanceof File && logo.size ? await saveUploadedImage(logo, 4e6) : cur?.logoPath ?? null;
    await ctx.db.update(workspaces).set({ settings: { ...ctx.workspace.settings, brand: { logoPath, primary: hex("primary", "#1B2483"), accent: hex("accent", "#F5B90F") } } }).where(eq(workspaces.id, ctx.workspaceId));
  });
}
export async function saveGoal(id: string, f: FormData) {
  await guard(async () => {
    const ctx = await needRole("settings");
    const [g] = await ctx.db.select().from(goalTemplates).where(and(eq(goalTemplates.id, id), eq(goalTemplates.workspaceId, ctx.workspaceId)));
    if (!g) return;
    const rules: GoalRules = { ...g.rules, targetIdr: money(str(f, "target")), pauseSpendWithoutResultIdr: money(str(f, "pauseAt")), maxFrequency: Number(str(f, "freq").replace(",", ".")) || g.rules.maxFrequency };
    await ctx.db.update(goalTemplates).set({ rules }).where(eq(goalTemplates.id, id));
  });
}

const year = 60 * 60 * 24 * 365;
export async function setPref(name: "lang" | "ws" | "member", value: string) {
  const jar = await cookies();
  jar.set(name, value, { maxAge: year, path: "/", httpOnly: true, sameSite: "lax" });
  if (name === "ws") jar.delete("member");
  done();
}
