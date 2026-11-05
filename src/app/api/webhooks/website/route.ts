import { z } from "zod";
import { upsertExternalOrder } from "@/lib/orders/service";
import { verifyHmacBase64 } from "@/lib/orders/webhooks";
import { webhookCtx } from "@/lib/webhook-ctx";

const Order = z.object({
  externalId: z.string(), product: z.string(), quantity: z.number().int().min(1), amountIdr: z.number().int().min(0),
  status: z.enum(["ordered", "confirmed", "paid", "shipped", "delivered", "returned", "cancelled"]), refCode: z.string().nullable().default(null), customer: z.string().default(""),
});

/** Called by the Vercel site. Signature: base64 HMAC-SHA256 of the body in x-laris-signature. */
export async function POST(req: Request) {
  const secret = process.env.WEBSITE_WEBHOOK_SECRET;
  const raw = await req.text();
  if (!secret || !verifyHmacBase64(raw, req.headers.get("x-laris-signature"), secret)) return new Response("Unauthorized", { status: 401 });
  const parsed = Order.safeParse(JSON.parse(raw));
  if (!parsed.success) return Response.json({ error: "Invalid order" }, { status: 400 });
  await upsertExternalOrder(await webhookCtx("Website"), "website", parsed.data, "confirmed");
  return Response.json({ ok: true });
}
