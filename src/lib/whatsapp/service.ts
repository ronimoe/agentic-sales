import { and, asc, eq, gte, sql } from "drizzle-orm";
import { contacts, conversations, creatives, campaigns, messages, workspaces } from "@/db/schema";
import { logActivity, logUsage } from "@/lib/log";
import type { Ctx } from "@/lib/types";
import { evaluateSend, isOptOut, REF_RE, type SendRequest } from "./policy";
import { sendViaEvolution } from "./channel";

const FREE_ENTRY_MS = 7 * 864e5;

export type Inbound = { phone: string; name: string; text: string; externalId?: string | null; simulated: boolean; refCode?: string | null };

export async function receiveInbound(ctx: Ctx, m: Inbound) {
  const { db, workspaceId } = ctx;
  const now = new Date();
  if (m.externalId) {
    const [dup] = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.workspaceId, workspaceId), eq(messages.externalId, m.externalId)));
    if (dup) return null;
  }
  const ref = m.refCode ?? m.text.match(REF_RE)?.[0] ?? null;
  const [ad] = ref ? await db.select({ c: creatives, productId: campaigns.productId }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id))
    .where(and(eq(creatives.workspaceId, workspaceId), eq(creatives.refCode, ref))) : [];

  const [contact] = await db.insert(contacts).values({ workspaceId, phone: m.phone, name: m.name, lastInboundAt: now, freeEntryUntil: ad ? new Date(now.getTime() + FREE_ENTRY_MS) : null })
    .onConflictDoUpdate({ target: [contacts.workspaceId, contacts.phone], set: { lastInboundAt: now, ...(m.name ? { name: m.name } : {}), ...(ad ? { freeEntryUntil: new Date(now.getTime() + FREE_ENTRY_MS) } : {}) } }).returning();

  let [conv] = await db.select().from(conversations).where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.contactId, contact.id)));
  if (!conv) {
    [conv] = await db.insert(conversations).values({ workspaceId, contactId: contact.id, creativeId: ad?.c.id, productId: ad?.productId, source: ad ? "ad_chat" : "organic", simulated: m.simulated }).returning();
  } else if (ad && !conv.creativeId) {
    await db.update(conversations).set({ creativeId: ad.c.id, productId: ad.productId, source: "ad_chat" }).where(eq(conversations.id, conv.id));
    conv = { ...conv, creativeId: ad.c.id, productId: ad.productId, source: "ad_chat" };
  }
  await db.insert(messages).values({ workspaceId, conversationId: conv.id, sender: "customer", body: m.text.replace(REF_RE, "").replace(/\(\s*\)/, "").trim() || m.text, externalId: m.externalId ?? null });
  await db.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, conv.id));

  if (isOptOut(m.text)) {
    await db.update(contacts).set({ optOutAt: now }).where(eq(contacts.id, contact.id));
    await db.update(conversations).set({ stage: "lost", handler: "human" }).where(eq(conversations.id, conv.id));
    await systemNote(ctx, conv.id, "Pelanggan berhenti berlangganan. Pesan keluar diblokir.");
    return { conversationId: conv.id, runCloser: false };
  }
  return { conversationId: conv.id, runCloser: conv.handler === "ai" };
}

export const systemNote = (ctx: Ctx, conversationId: string, body: string) =>
  ctx.db.insert(messages).values({ workspaceId: ctx.workspaceId, conversationId, sender: "system", body });

async function serviceSentThisMonth(ctx: Ctx) {
  const d = new Date();
  const [r] = await ctx.db.select({ v: sql<number>`count(*)::int` }).from(messages)
    .where(and(eq(messages.workspaceId, ctx.workspaceId), eq(messages.kind, "session"), sql`${messages.sender} in ('ai','human')`, gte(messages.createdAt, new Date(d.getFullYear(), d.getMonth(), 1))));
  return r?.v ?? 0;
}

/** The only way a message leaves the app: every send passes the official-rules check first. */
export async function sendToCustomer(ctx: Ctx, conversationId: string, body: string, sender: "ai" | "human", req: SendRequest = { kind: "session" }) {
  const { db, workspaceId } = ctx;
  const [row] = await db.select({ conv: conversations, contact: contacts }).from(conversations).innerJoin(contacts, eq(conversations.contactId, contacts.id))
    .where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspaceId)));
  if (!row) throw new Error("Percakapan tidak ditemukan");
  const [w] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  const now = new Date();
  const decision = evaluateSend(req, row.contact, w.settings, now, await serviceSentThisMonth(ctx));
  if (!decision.allowed) {
    await systemNote(ctx, conversationId, `Pesan tidak dikirim: ${decision.reason}`);
    return { sent: false as const, reason: decision.reason };
  }
  let externalId: string | null = null;
  if (!row.conv.simulated) externalId = await sendViaEvolution(row.contact.phone, body);
  await db.insert(messages).values({ workspaceId, conversationId, sender, body, kind: req.kind, estimatedCostIdr: decision.costIdr, externalId });
  await db.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, conversationId));
  if (decision.costIdr) await logUsage(ctx, "whatsapp", decision.costIdr, true, req.kind);
  return { sent: true as const };
}

export async function requestHuman(ctx: Ctx, conversationId: string, reason: string) {
  await ctx.db.update(conversations).set({ handler: "needs_human", handoffReason: reason }).where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, ctx.workspaceId)));
  await logActivity(ctx, "WhatsApp closer", "Meminta bantuan orang", reason, `/chats?c=${conversationId}`);
}

export const historyOf = (ctx: Ctx, conversationId: string) =>
  ctx.db.select().from(messages).where(and(eq(messages.conversationId, conversationId), eq(messages.workspaceId, ctx.workspaceId))).orderBy(asc(messages.createdAt));
