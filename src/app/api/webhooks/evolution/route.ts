import crypto from "node:crypto";
import { after } from "next/server";
import { runCloser } from "@/lib/ai/closer";
import { parseEvolutionEvent } from "@/lib/whatsapp/channel";
import { receiveInbound } from "@/lib/whatsapp/service";
import { webhookCtx } from "@/lib/webhook-ctx";

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export async function POST(req: Request) {
  const secret = process.env.EVOLUTION_WEBHOOK_TOKEN;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!secret || !same(token, secret)) return new Response("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => null);
  const m = body && parseEvolutionEvent(body);
  if (!m) return Response.json({ ignored: true });
  const ctx = await webhookCtx("WhatsApp");
  const r = await receiveInbound(ctx, { ...m, simulated: false });
  if (r?.runCloser) after(() => runCloser(ctx, r.conversationId));
  return Response.json({ ok: true });
}
