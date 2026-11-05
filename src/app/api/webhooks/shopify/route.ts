import { upsertExternalOrder } from "@/lib/orders/service";
import { mapShopifyOrder, verifyHmacBase64 } from "@/lib/orders/webhooks";
import { webhookCtx } from "@/lib/webhook-ctx";

export async function POST(req: Request) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const raw = await req.text();
  if (!secret || !verifyHmacBase64(raw, req.headers.get("x-shopify-hmac-sha256"), secret)) return new Response("Unauthorized", { status: 401 });
  await upsertExternalOrder(await webhookCtx("Shopify"), "shopify", mapShopifyOrder(JSON.parse(raw)), "partial");
  return Response.json({ ok: true });
}
