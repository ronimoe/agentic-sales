import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createLocalDb } from "@/db/client";
import { adMetrics, budgetLimits, campaigns, contacts, conversations, creatives, orders, products, workspaces } from "@/db/schema";
import { setupWorkspace } from "./seed";
import { approveCreative, generatePlan, rejectCreative, syncFromMeta } from "./pipeline";
import { receiveInbound, sendToCustomer } from "./whatsapp/service";
import { CLOSER_TOOL_NAMES, runCloser } from "./ai/closer";
import { importCsv, setOrderStatus } from "./orders/service";
import { profitOf } from "./orders/csv";
import { parseEvolutionEvent } from "./whatsapp/channel";

describe("sale traced to its angle", () => {
  it("runs from product to delivered sale, isolated by workspace", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "Pemilik A");
    const b = await setupWorkspace(db, "B", "Pemilik B");
    const [p] = await db.insert(products).values({ workspaceId: a.workspaceId, name: "Serum", priceIdr: 100000, costIdr: 30000, stock: 5, proof: ["Bukti"], visual: { shape: "bottle", color: "#E85D9A" } }).returning();

    await expect(generatePlan(b, p.id)).rejects.toThrow();
    await generatePlan(a, p.id);

    const [row] = await db.select({ c: creatives }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).where(and(eq(campaigns.goal, "whatsapp_chat"), eq(creatives.workspaceId, a.workspaceId)));
    await expect(approveCreative(b, row.c.id)).rejects.toThrow();
    await approveCreative(a, row.c.id);

    const say = async (text: string, ref?: string) => {
      const r = await receiveInbound(a, { phone: "62811", name: "Dewi", text, simulated: true, refCode: ref });
      if (r?.runCloser) await runCloser(a, r.conversationId);
      return r!.conversationId;
    };
    const conv = await say("Halo kak", row.c.refCode);
    await say("Saya pesan COD");

    const [o] = await db.select().from(orders).where(eq(orders.workspaceId, a.workspaceId));
    expect(o.creativeId).toBe(row.c.id);
    expect(o.attribution).toBe("confirmed");
    expect(profitOf(o)).toBe(0);
    await setOrderStatus(b, o.id, "delivered");
    expect((await db.select().from(orders).where(eq(orders.id, o.id)))[0].status).toBe("ordered");
    await setOrderStatus(a, o.id, "delivered");
    const [done] = await db.select().from(orders).where(eq(orders.id, o.id));
    expect(profitOf(done)).toBe(70000);
    expect((await db.select().from(creatives).where(eq(creatives.id, done.creativeId!)))[0].angleId).toBe(row.c.angleId);

    await say("STOP");
    expect((await sendToCustomer(a, conv, "promo", "human")).sent).toBe(false);
    expect((await db.select().from(conversations).where(eq(conversations.id, conv)))[0].stage).toBe("lost");
  });

  it("blocks approval when compliance fails, and rejection is scoped", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "P");
    const [p] = await db.insert(products).values({ workspaceId: a.workspaceId, name: "Krim", category: "cosmetic", priceIdr: 1000, costIdr: 1, stock: 1 }).returning();
    await generatePlan(a, p.id);
    const [c] = await db.select().from(creatives).where(eq(creatives.workspaceId, a.workspaceId));
    expect(c.compliance.passed).toBe(false);
    await expect(approveCreative(a, c.id)).rejects.toThrow(/BPOM/);
    await rejectCreative(a, c.id, "Tidak sesuai");
    expect((await db.select().from(creatives).where(eq(creatives.id, c.id)))[0].status).toBe("rejected");
  });

  it("imports marketplace CSV as estimated, and repeat imports don't duplicate", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "P");
    await db.insert(products).values({ workspaceId: a.workspaceId, name: "Serum Niacinamide Glow", priceIdr: 99000, costIdr: 30000, stock: 5 });
    const csv = 'No. Pesanan;Nama Produk;Jumlah;Total Pembayaran;Biaya Admin;Status Pesanan\nSP1;Serum Niacinamide;1;"Rp 99.000";"Rp 8.000";Selesai\nSP3;Lain;1;"Rp 5";;aneh';
    const r = await importCsv(a, "shopee", csv);
    expect(r).toMatchObject({ imported: 1, unmatched: 0 });
    expect(r.errors).toHaveLength(1);
    await importCsv(a, "shopee", csv);
    const rows = await db.select().from(orders).where(eq(orders.workspaceId, a.workspaceId));
    expect(rows).toHaveLength(1);
    expect(profitOf(rows[0])).toBe(61000);
  });

  it("matches long marketplace titles, and unmatched orders add no profit", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "P");
    await db.insert(products).values({ workspaceId: a.workspaceId, name: "Serum Glow", priceIdr: 99000, costIdr: 30000, stock: 5 });
    await importCsv(a, "tokopedia", 'order_id,product,amount,status\nT1,Serum Glow Original BPOM 30ml,99000,selesai\nT2,Barang Lain,50000,selesai');
    const rows = await db.select().from(orders).where(eq(orders.workspaceId, a.workspaceId));
    expect(profitOf(rows.find((r) => r.externalId === "T1")!)).toBe(69000);
    expect(profitOf(rows.find((r) => r.externalId === "T2")!)).toBe(0);
  });

  it("doesn't treat a casual ya as marketing consent", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "P");
    const [p] = await db.insert(products).values({ workspaceId: a.workspaceId, name: "Serum", priceIdr: 99000, costIdr: 30000, stock: 5 }).returning();
    const say = async (text: string) => { const r = await receiveInbound(a, { phone: "62822", name: "Rina", text, simulated: true }); await runCloser(a, r!.conversationId); };
    await say("Harganya berapa ya kak?");
    expect((await db.select().from(contacts).where(eq(contacts.phone, "62822")))[0].optInAt).toBeNull();
    await db.update(conversations).set({ productId: p.id }).where(eq(conversations.workspaceId, a.workspaceId));
    await say("Saya pesan COD");
    await say("Ya boleh");
    expect((await db.select().from(contacts).where(eq(contacts.phone, "62822")))[0].optInAt).not.toBeNull();
  });

  it("syncs real results, then pauses on them, and stops paid WhatsApp at the cap", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "P");
    const [p] = await db.insert(products).values({ workspaceId: a.workspaceId, name: "Serum", priceIdr: 99000, costIdr: 30000, stock: 5, visual: { shape: "bottle", color: "#E85D9A" } }).returning();
    await generatePlan(a, p.id);
    const [row] = await db.select({ c: creatives }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).where(eq(campaigns.goal, "cold_sell"));
    await approveCreative(a, row.c.id);
    await db.update(creatives).set({ externalId: "9001" }).where(eq(creatives.id, row.c.id));
    const fake = { simulated: false, launch: async () => { throw new Error("no"); }, setBudget: async () => {}, paused: [] as string[], async pause(id: string) { this.paused.push(id); },
      insights: async () => [{ day: "2026-11-01", spendIdr: 900000, impressions: 50000, reach: 40000, clicks: 300, videoWatches: 0, frequency: 1.2 }] };
    expect(await syncFromMeta(a, fake)).toBe(1);
    expect(await syncFromMeta(a, fake)).toBe(1);
    expect(fake.paused).toEqual(["9001"]);
    const m = await db.select().from(adMetrics).where(eq(adMetrics.creativeId, row.c.id));
    expect(m).toHaveLength(1);
    expect(m[0].simulated).toBe(false);

    await db.update(budgetLimits).set({ amountIdr: 0 }).where(and(eq(budgetLimits.workspaceId, a.workspaceId), eq(budgetLimits.kind, "whatsapp_monthly")));
    await db.update(workspaces).set({ settings: { whatsappCost: { marketingIdr: 667, utilityIdr: 300, serviceIdr: 357, freeServicePerMonth: 0 }, quietHours: { startHour: 21, endHour: 8 }, aiLabelAds: false } }).where(eq(workspaces.id, a.workspaceId));
    const r = await receiveInbound(a, { phone: "62833", name: "", text: "halo", simulated: true });
    expect((await sendToCustomer(a, r!.conversationId, "halo", "human")).sent).toBe(false);
  });

  it("gives the closer no ad, budget, or rule tools", () => {
    expect(CLOSER_TOOL_NAMES.join(" ")).not.toMatch(/ad|budget|rule|campaign/i);
  });

  it("ignores group and own messages from Evolution", () => {
    const base = { event: "messages.upsert", data: { key: { remoteJid: "62811@s.whatsapp.net", id: "x" }, message: { conversation: "hai" } } };
    expect(parseEvolutionEvent(base)).toMatchObject({ phone: "62811", text: "hai" });
    expect(parseEvolutionEvent({ ...base, data: { ...base.data, key: { remoteJid: "1@g.us" } } })).toBeNull();
    expect(parseEvolutionEvent({ ...base, data: { ...base.data, key: { remoteJid: "62811@s.whatsapp.net", fromMe: true } } })).toBeNull();
  });
});
