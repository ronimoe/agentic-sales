import { eq } from "drizzle-orm";
import { budgetLimits, campaigns, creatives, goalTemplates, members, products, rulebooks, workspaces, type GoalKey, type GoalRules, type WorkspaceSettings } from "@/db/schema";
import { getDb } from "@/db/client";
import { adapterStatus } from "./adapters";
import { approveCreative, generatePlan, simulateDay } from "./pipeline";
import { receiveInbound } from "./whatsapp/service";
import { runCloser } from "./ai/closer";
import type { Ctx } from "./types";

const SETTINGS: WorkspaceSettings = { whatsappCost: { marketingIdr: 667, utilityIdr: 300, serviceIdr: 357, freeServicePerMonth: 1000 }, quietHours: { startHour: 21, endHour: 8 }, aiLabelAds: false };

const GOALS: { key: GoalKey; name: string; briefFormat: string; rules: GoalRules }[] = [
  { key: "eyeball", name: "Dikenal orang", briefFormat: "Video pendek, 3 detik pertama menarik, tanpa jualan keras", rules: { primaryMetric: "reach_cost", targetIdr: 20000, pauseSpendWithoutResultIdr: 150000, pauseOverTargetRatio: 1.6, minWatchRate: 0.08, maxFrequency: 3.5, scaleUnderTargetRatio: 0.7, scaleStepPct: 15 } },
  { key: "cold_sell", name: "Jual langsung", briefFormat: "Penawaran, bukti, ajakan beli yang jelas", rules: { primaryMetric: "cost_per_sale", targetIdr: 45000, pauseSpendWithoutResultIdr: 300000, pauseOverTargetRatio: 1.6, maxFrequency: 4, scaleUnderTargetRatio: 0.8, scaleStepPct: 20 } },
  { key: "form", name: "Isi formulir", briefFormat: "Manfaat jelas, pertanyaan singkat, persetujuan WhatsApp", rules: { primaryMetric: "cost_per_qualified_lead", targetIdr: 15000, pauseSpendWithoutResultIdr: 200000, pauseOverTargetRatio: 1.6, maxFrequency: 4, scaleUnderTargetRatio: 0.8, scaleStepPct: 20 } },
  { key: "whatsapp_chat", name: "Chat WhatsApp", briefFormat: "Pembuka percakapan yang memancing pertanyaan", rules: { primaryMetric: "cost_per_sale", targetIdr: 40000, pauseSpendWithoutResultIdr: 250000, pauseOverTargetRatio: 1.6, maxFrequency: 4, scaleUnderTargetRatio: 0.8, scaleStepPct: 20 } },
  { key: "retargeting", name: "Tawarkan ulang", briefFormat: "Testimoni dan jawaban atas keberatan", rules: { primaryMetric: "cost_per_sale", targetIdr: 35000, pauseSpendWithoutResultIdr: 200000, pauseOverTargetRatio: 1.6, maxFrequency: 5, scaleUnderTargetRatio: 0.8, scaleStepPct: 15 } },
];

const AD_RULES = ["Tulis dalam Bahasa Indonesia sehari-hari", "Tampilkan harga pada iklan penjualan", "Hanya gunakan klaim yang disetujui", "larang: paling murah"];
const WA_RULES = ["Sapa dengan Kak", "Balas maksimal tiga kalimat", "Selalu tawarkan COD atau transfer", "Serahkan ke tim jika ada komplain"];

export async function setupWorkspace(db: Ctx["db"], name: string, owner: string): Promise<Ctx> {
  const [w] = await db.insert(workspaces).values({ name, settings: SETTINGS }).returning();
  const workspaceId = w.id;
  await db.insert(members).values([{ workspaceId, name: owner, role: "owner" }, { workspaceId, name: "Tim sales", role: "sales" }]);
  await db.insert(goalTemplates).values(GOALS.map((g) => ({ ...g, workspaceId })));
  await db.insert(budgetLimits).values([
    { workspaceId, kind: "ads_daily", amountIdr: 3000000 }, { workspaceId, kind: "ads_monthly", amountIdr: 40000000 },
    { workspaceId, kind: "assets_monthly", amountIdr: 1000000 }, { workspaceId, kind: "ai_monthly", amountIdr: 1000000 }, { workspaceId, kind: "whatsapp_monthly", amountIdr: 500000 },
  ]);
  const mk = (t: string[]) => t.map((text) => ({ id: crypto.randomUUID(), text }));
  await db.insert(rulebooks).values([
    { workspaceId, kind: "ads", version: 1, rules: mk(AD_RULES), tone: "Akrab, jelas, tidak lebay", createdBy: owner },
    { workspaceId, kind: "whatsapp", version: 1, rules: mk(WA_RULES), tone: "Ramah seperti penjaga toko yang paham produknya", createdBy: owner },
  ]);
  return { db, workspaceId, actor: owner };
}

const store = globalThis as unknown as { __larisSeed?: Promise<void> };

export function ensureSeeded() {
  store.__larisSeed ??= (async () => {
    const db = await getDb();
    if ((await db.select({ id: workspaces.id }).from(workspaces).limit(1)).length) return;
    const ctx = await setupWorkspace(db, "Rumah Laris", "Pemilik");
    // Sample data is only for full simulation. It must never trigger real ads, messages, or AI calls.
    const a = adapterStatus();
    if (a.ai || a.ads || a.whatsapp || a.database) return;
    const [serum, blender, shoe] = await db.insert(products).values([
      { workspaceId: ctx.workspaceId, name: "Serum Niacinamide Glow", category: "cosmetic" as const, description: "Serum wajah ringan untuk dipakai setiap malam.", priceIdr: 99000, costIdr: 32000, stock: 240, bpomNumber: "NA18230100000", halalStatus: "Bersertifikat", approvedClaims: ["Membantu kulit tampak lebih cerah", "Melembapkan kulit"], proof: ["4,8 dari 1.200 ulasan pembeli"], visual: { shape: "bottle" as const, color: "#E85D9A" } },
      { workspaceId: ctx.workspaceId, name: "Blender Portabel Mini", category: "general" as const, description: "Blender isi daya USB yang muat di tas.", priceIdr: 189000, costIdr: 96000, stock: 85, approvedClaims: [], proof: ["Terjual lebih dari 3.000 unit"], visual: { shape: "blender" as const, color: "#1FA971" } },
      { workspaceId: ctx.workspaceId, name: "Sepatu Kerja Empuk", category: "general" as const, description: "Sepatu kerja dengan sol empuk untuk seharian.", priceIdr: 279000, costIdr: 140000, stock: 60, approvedClaims: [], proof: ["Garansi tukar ukuran 7 hari"], visual: { shape: "shoe" as const, color: "#2B3AA8" } },
    ]).returning();

    await generatePlan(ctx, serum.id);
    await generatePlan(ctx, blender.id);
    const toLaunch = await db.select({ id: creatives.id }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).where(eq(creatives.workspaceId, ctx.workspaceId));
    for (const c of toLaunch) await approveCreative(ctx, c.id).catch(() => {});
    for (let i = 7; i >= 1; i--) await simulateDay(ctx, new Date(Date.now() - i * 864e5));
    await generatePlan(ctx, shoe.id);

    const [ad] = await db.select({ ref: creatives.refCode }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).where(eq(campaigns.goal, "whatsapp_chat")).limit(1);
    const chat = async (phone: string, name: string, texts: string[]) => {
      for (const [i, text] of texts.entries()) {
        const r = await receiveInbound(ctx, { phone, name, text, simulated: true, refCode: i === 0 ? ad?.ref : null });
        if (r?.runCloser) await runCloser(ctx, r.conversationId);
      }
    };
    await chat("6281200000001", "Dewi", ["Halo kak, mau tanya", "Harganya berapa?", "Takut palsu nih", "Oke saya pesan COD"]);
    await chat("6281200000002", "Rudi", ["Berapa harganya kak?"]);
    await chat("6281200000003", "Sinta", ["Halo", "Saya kecewa, barang belum sampai. Mau komplain ke admin"]);

    const other = await setupWorkspace(db, "Toko Contoh Klien", "Klien");
    await db.insert(products).values({ workspaceId: other.workspaceId, name: "Kopi Susu Botol", description: "Kopi susu siap minum.", priceIdr: 25000, costIdr: 11000, stock: 100 });
  })().catch((e) => { store.__larisSeed = undefined; throw e; });
  return store.__larisSeed;
}
