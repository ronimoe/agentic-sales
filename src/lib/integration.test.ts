import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createLocalDb } from "@/db/client";
import { adMetrics, angles, budgetLimits, campaigns, contacts, conversations, creatives, knowledge, messages, objections, orders, products, variants, workspaces } from "@/db/schema";
import { setupWorkspace } from "./seed";
import { approveCreative, draftMoreAngles, generatePlan, monitorAds, rejectCreative, syncFromMeta, testAngle } from "./pipeline";
import { answerAsHuman, receiveInbound, sendToCustomer } from "./whatsapp/service";
import { closerActions, CLOSER_TOOL_NAMES, runCloser } from "./ai/closer";
import { factsFor, runAiReadiness } from "./knowledge/service";
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

  it("only tells customers confirmed facts, and turns a team answer into a draft", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "P");
    const [p] = await db.insert(products).values({ workspaceId: a.workspaceId, name: "Sepatu Empuk", priceIdr: 100000, costIdr: 1, stock: 5 }).returning();
    await db.insert(knowledge).values([
      { workspaceId: a.workspaceId, productId: p.id, topic: "care", question: "Cara merawat", answer: "RAHASIA-DRAFT", status: "draft" },
      { workspaceId: a.workspaceId, productId: p.id, topic: "warranty", question: "Ada garansi?", answer: "Garansi tukar 7 hari.", status: "confirmed" },
    ]);
    const say = async (text: string) => { const r = await receiveInbound(a, { phone: "62844", name: "Rina", text, simulated: true }); await runCloser(a, r!.conversationId); return r!.conversationId; };
    const conv = await say("Sepatu empuk masih ada?");
    expect((await db.select().from(conversations).where(eq(conversations.id, conv)))[0].productId).toBe(p.id);
    await say("Ada garansi kak?");
    await say("Cara merawat sepatunya gimana?");
    const texts = (await db.select().from(messages).where(eq(messages.conversationId, conv))).map((m) => m.body).join(" ");
    expect(texts).toContain("Garansi tukar 7 hari.");
    expect(texts).not.toContain("RAHASIA-DRAFT");
    const [c] = await db.select().from(conversations).where(eq(conversations.id, conv));
    expect(c.handler).toBe("needs_human");
    expect(c.handoffQuestion).toContain("merawat");

    await answerAsHuman(a, conv, "Lap dengan kain lembap ya Kak.");
    const drafts = await db.select().from(knowledge).where(and(eq(knowledge.productId, p.id), eq(knowledge.source, "chat")));
    expect(drafts[0]).toMatchObject({ status: "draft", answer: "Lap dengan kain lembap ya Kak." });
    expect((await factsFor(a, p.id)).some((f) => f.source === "chat")).toBe(false);
  });

  it("sells only available variants", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "P");
    const [p] = await db.insert(products).values({ workspaceId: a.workspaceId, name: "Sepatu", priceIdr: 100000, costIdr: 1, stock: 2 }).returning();
    await db.insert(variants).values([{ workspaceId: a.workspaceId, productId: p.id, name: "42", stock: 0 }, { workspaceId: a.workspaceId, productId: p.id, name: "41", stock: 2 }]);
    const r = await receiveInbound(a, { phone: "62855", name: "", text: "halo", simulated: true });
    const act = closerActions(a, r!.conversationId);
    await act.selectProduct(p.id);
    expect(await act.createOrder(1, "cod", "R", "42")).toContain("tersisa 0");
    expect(await act.createOrder(1, "cod", "R", null)).toContain("Pilih varian");
    expect(await act.createOrder(1, "cod", "R", "41")).toContain("Pesanan dibuat");
    expect((await db.select().from(variants).where(eq(variants.name, "41")))[0].stock).toBe(1);
  });

  it("can't pick another business's product", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "P"); const b = await setupWorkspace(db, "B", "Q");
    const [other] = await db.insert(products).values({ workspaceId: b.workspaceId, name: "Rahasia", priceIdr: 1, costIdr: 1, stock: 1 }).returning();
    const r = await receiveInbound(a, { phone: "62866", name: "", text: "halo", simulated: true });
    const act = closerActions(a, r!.conversationId);
    expect(await act.searchProducts("Rahasia")).toEqual([]);
    expect(await act.selectProduct(other.id)).toContain("tidak ditemukan");
  });

  it("runs the AI readiness test with no customer-facing writes", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "P");
    const [p] = await db.insert(products).values({ workspaceId: a.workspaceId, name: "Serum", priceIdr: 1000, costIdr: 1, stock: 3 }).returning();
    const results = await runAiReadiness(a, p.id, async () => ({ answer: "Ya", grounded: true }));
    expect(results.length).toBeGreaterThan(15);
    for (const t of [orders, messages, conversations, objections]) expect(await db.select().from(t)).toHaveLength(0);
    expect((await db.select().from(products).where(eq(products.id, p.id)))[0].stock).toBe(3);
  });

  it("retries failed copy within a limit, and blocks what still fails", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "P");
    const [p] = await db.insert(products).values({ workspaceId: a.workspaceId, name: "Blender", priceIdr: 100000, costIdr: 1, stock: 5, neverSay: ["kenalan"], visual: { shape: "box", color: "#2B3AA8" } }).returning();
    const calls: string[][] = [];
    await generatePlan(a, p.id, { rewrite: async (d, issues) => { calls.push(issues); return d; } });
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const all = await db.select().from(creatives).where(eq(creatives.workspaceId, a.workspaceId));
    const bad = all.find((c) => c.attempts === 3)!;
    expect(bad.compliance.passed).toBe(false);
    await expect(approveCreative(a, bad.id)).rejects.toThrow(/kenalan/);
    const video = all.find((c) => c.format === "video")!;
    expect(video.checks.find((x) => x.key === "format")).toMatchObject({ status: "pass" });
    expect(video.checks.find((x) => x.key === "ai_visual")?.status).toBe("not_run");
    expect(video.script).toBeTruthy();
  });

  it("blocks stale price and empty stock at approval, and pauses live ads when stock runs out", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "P");
    const [p] = await db.insert(products).values({ workspaceId: a.workspaceId, name: "Blender", priceIdr: 100000, costIdr: 1, stock: 5, visual: { shape: "box", color: "#2B3AA8" } }).returning();
    await generatePlan(a, p.id);
    const [x, y] = await db.select().from(creatives).where(eq(creatives.workspaceId, a.workspaceId));
    await approveCreative(a, x.id);
    await db.update(products).set({ priceIdr: 120000 }).where(eq(products.id, p.id));
    await expect(approveCreative(a, y.id)).rejects.toThrow(/Harga/);
    await db.update(products).set({ priceIdr: 100000, stock: 0 }).where(eq(products.id, p.id));
    await expect(approveCreative(a, y.id)).rejects.toThrow(/Stok/);
    await monitorAds(a);
    expect((await db.select().from(creatives).where(eq(creatives.id, x.id)))[0]).toMatchObject({ status: "paused", pauseReason: "Stok Blender habis" });
  });

  it("tests several different angles fairly, without repeating ideas", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "P");
    const [p] = await db.insert(products).values({ workspaceId: a.workspaceId, name: "Serum", priceIdr: 100000, costIdr: 1, stock: 9, visual: { shape: "bottle", color: "#E85D9A" } }).returning();
    await generatePlan(a, p.id);
    const all = await db.select().from(angles).where(eq(angles.productId, p.id));
    expect(all.length).toBeGreaterThanOrEqual(6);
    expect(new Set(all.map((x) => x.type)).size).toBeGreaterThanOrEqual(6);
    const testing = all.filter((x) => x.status === "testing");
    expect(testing.length).toBe(4);
    const rows = await db.select({ c: creatives, camp: campaigns }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).where(eq(campaigns.goal, "whatsapp_chat"));
    expect(new Set(rows.map((r) => r.c.angleId)).size).toBe(4);
    expect(rows[0].camp.dailyBudgetIdr).toBe(400000);
    expect(new Set(rows.map((r) => r.c.format)).size).toBe(1);

    await draftMoreAngles(a, p.id);
    expect((await db.select().from(angles).where(eq(angles.productId, p.id))).length).toBe(all.length);
  });

  it("stops an angle, then the next idea takes its place awaiting approval", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "P");
    const [p] = await db.insert(products).values({ workspaceId: a.workspaceId, name: "Serum", priceIdr: 100000, costIdr: 1, stock: 9, visual: { shape: "bottle", color: "#E85D9A" } }).returning();
    await generatePlan(a, p.id);
    const ads = await db.select().from(creatives).where(eq(creatives.workspaceId, a.workspaceId));
    const target = ads[0].angleId;
    for (const c of ads) if (c.angleId === target) { if (c.status === "in_review") await db.update(creatives).set({ status: "paused", pauseReason: "Sudah Rp1 tanpa penjualan" }).where(eq(creatives.id, c.id)); }
    const before = (await db.select().from(angles).where(and(eq(angles.productId, p.id), eq(angles.status, "testing")))).length;
    await monitorAds(a);
    const list = await db.select().from(angles).where(eq(angles.productId, p.id));
    expect(list.find((x) => x.id === target)).toMatchObject({ status: "stopped", stopReason: "Sudah Rp1 tanpa penjualan" });
    expect(list.filter((x) => x.status === "testing").length).toBe(before);
    const fresh = list.find((x) => x.status === "testing" && !ads.some((c) => c.angleId === x.id))!;
    const newAds = await db.select().from(creatives).where(eq(creatives.angleId, fresh.id));
    expect(newAds.every((c) => c.status === "in_review")).toBe(true);
  });

  it("respects budget caps when an angle joins a live test", async () => {
    const db = await createLocalDb();
    const a = await setupWorkspace(db, "A", "P");
    const [p] = await db.insert(products).values({ workspaceId: a.workspaceId, name: "Serum", priceIdr: 100000, costIdr: 1, stock: 9, visual: { shape: "bottle", color: "#E85D9A" } }).returning();
    await generatePlan(a, p.id);
    const rows = await db.select({ c: creatives }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).where(eq(campaigns.goal, "cold_sell"));
    for (const r of rows.slice(0, 3)) await approveCreative(a, r.c.id);
    const idea = (await db.select().from(angles).where(and(eq(angles.productId, p.id), eq(angles.status, "idea"))))[0];
    await testAngle(a, idea.id);
    expect(await testAngle(a, idea.id)).toBe(0);
    const newAd = (await db.select({ c: creatives }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).where(and(eq(campaigns.goal, "cold_sell"), eq(creatives.angleId, idea.id))))[0].c;
    await db.update(budgetLimits).set({ amountIdr: 400000 }).where(and(eq(budgetLimits.workspaceId, a.workspaceId), eq(budgetLimits.kind, "ads_daily")));
    await approveCreative(a, rows[3].c.id);
    await expect(approveCreative(a, newAd.id)).rejects.toThrow(/Batas belanja/);
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
