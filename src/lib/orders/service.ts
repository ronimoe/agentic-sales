import { and, eq, sql } from "drizzle-orm";
import { creatives, orders, products, variants, type OrderChannel, type OrderStatus } from "@/db/schema";
import { logActivity } from "@/lib/log";
import type { Ctx } from "@/lib/types";
import { parseOrdersCsv } from "./csv";

export async function createChatOrder(ctx: Ctx, o: { conversationId: string; contactId: string; creativeId: string | null; productId: string; customerName: string; quantity: number; paymentMethod: "cod" | "transfer"; variantName?: string | null }) {
  const { db, workspaceId } = ctx;
  const [p] = await db.select().from(products).where(and(eq(products.id, o.productId), eq(products.workspaceId, workspaceId)));
  if (!p) throw new Error("Produk tidak ditemukan");
  const vs = await db.select().from(variants).where(eq(variants.productId, p.id));
  let variant: (typeof vs)[0] | undefined;
  if (vs.length) {
    variant = vs.find((v) => v.name.toLowerCase() === (o.variantName ?? "").trim().toLowerCase());
    if (!variant) return { ok: false as const, reason: `Pilih varian dulu: ${vs.filter((v) => v.stock > 0).map((v) => v.name).join(", ") || "semua habis"}` };
    if (variant.stock < o.quantity) return { ok: false as const, reason: `Varian ${variant.name} tersisa ${variant.stock}` };
  } else if (p.stock < o.quantity) return { ok: false as const, reason: `Stok ${p.name} tersisa ${p.stock}` };
  const [order] = await db.insert(orders).values({
    workspaceId, channel: "whatsapp", productId: p.id, variantId: variant?.id, contactId: o.contactId, conversationId: o.conversationId, creativeId: o.creativeId,
    customerName: o.customerName, quantity: o.quantity, amountIdr: p.priceIdr * o.quantity, costIdr: p.costIdr * o.quantity,
    paymentMethod: o.paymentMethod, attribution: o.creativeId ? "confirmed" : "none",
  }).returning();
  if (variant) await db.update(variants).set({ stock: sql`${variants.stock} - ${o.quantity}` }).where(eq(variants.id, variant.id));
  await db.update(products).set({ stock: sql`greatest(${products.stock} - ${o.quantity}, 0)` }).where(eq(products.id, p.id));
  await logActivity(ctx, "WhatsApp closer", `Membuat pesanan ${p.name}`, `${o.customerName || "Pelanggan"}, ${o.paymentMethod === "cod" ? "COD" : "transfer"}`, "/orders");
  return { ok: true as const, order };
}

export async function setOrderStatus(ctx: Ctx, id: string, status: OrderStatus) {
  await ctx.db.update(orders).set({ status, deliveredAt: status === "delivered" ? new Date() : null }).where(and(eq(orders.id, id), eq(orders.workspaceId, ctx.workspaceId)));
}

export async function upsertExternalOrder(ctx: Ctx, channel: OrderChannel, o: { externalId: string; product: string; quantity: number; amountIdr: number; feesIdr?: number; status: OrderStatus; refCode: string | null; customer: string }, attribution: "confirmed" | "partial" | "estimated") {
  const { db, workspaceId } = ctx;
  const needle = o.product.trim().toLowerCase();
  const all = needle ? await db.select().from(products).where(eq(products.workspaceId, workspaceId)) : [];
  // Marketplace titles often run longer than ours, so match in both directions. Ambiguous titles stay unmatched.
  const hits = all.filter((x) => { const n = x.name.toLowerCase(); return needle.includes(n) || n.includes(needle); });
  const p = hits.length === 1 ? hits[0] : undefined;
  const [ad] = o.refCode ? await db.select({ id: creatives.id }).from(creatives).where(and(eq(creatives.workspaceId, workspaceId), eq(creatives.refCode, o.refCode))) : [];
  await db.insert(orders).values({
    workspaceId, channel, externalId: o.externalId, productId: p?.id, creativeId: ad?.id, customerName: o.customer, quantity: o.quantity, amountIdr: o.amountIdr,
    costIdr: (p?.costIdr ?? 0) * o.quantity, feesIdr: o.feesIdr ?? 0, paymentMethod: "platform", status: o.status, attribution: ad ? attribution : "none",
    deliveredAt: o.status === "delivered" ? new Date() : null,
  }).onConflictDoUpdate({ target: [orders.workspaceId, orders.channel, orders.externalId], set: { status: o.status, amountIdr: o.amountIdr, feesIdr: o.feesIdr ?? 0, deliveredAt: o.status === "delivered" ? new Date() : null } });
  return { matchedProduct: !!p };
}

export async function importCsv(ctx: Ctx, channel: OrderChannel, csv: string) {
  const { rows, errors } = parseOrdersCsv(csv);
  let unmatched = 0;
  for (const r of rows) {
    const res = await upsertExternalOrder(ctx, channel, r, "estimated");
    if (!res.matchedProduct) unmatched++;
  }
  await logActivity(ctx, ctx.actor, `Mengimpor ${rows.length} pesanan ${channel}`, errors.length ? `${errors.length} baris dilewati` : "", "/orders");
  return { imported: rows.length, unmatched, errors };
}
