import crypto from "node:crypto";
import { REF_RE } from "@/lib/whatsapp/policy";
import type { OrderStatus } from "@/db/schema";

export function verifyHmacBase64(raw: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const a = crypto.createHmac("sha256", secret).update(raw, "utf8").digest();
  const b = Buffer.from(signature, "base64");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type ShopifyOrder = {
  id: number | string; name?: string; total_price?: string; financial_status?: string; fulfillment_status?: string | null;
  cancelled_at?: string | null; landing_site?: string | null; note_attributes?: { name: string; value: string }[];
  customer?: { first_name?: string; last_name?: string }; line_items?: { title: string; quantity: number }[];
};

export function mapShopifyOrder(o: ShopifyOrder) {
  const status: OrderStatus = o.cancelled_at ? "cancelled"
    : o.fulfillment_status === "fulfilled" ? "shipped"
    : o.financial_status === "paid" ? "paid" : o.financial_status === "refunded" ? "returned" : "ordered";
  const hay = `${o.landing_site ?? ""} ${(o.note_attributes ?? []).map((n) => n.value).join(" ")}`;
  const item = o.line_items?.[0];
  return {
    externalId: String(o.id), status, amountIdr: Math.round(Number(o.total_price ?? 0)),
    refCode: hay.match(REF_RE)?.[0] ?? null, product: item?.title ?? "", quantity: item?.quantity ?? 1,
    customer: [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" "),
  };
}
