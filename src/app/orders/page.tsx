import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { orders, products, type OrderChannel, type OrderStatus } from "@/db/schema";
import { importOrders, updateOrder } from "@/app/actions";
import { getCtx } from "@/lib/ctx";
import { dateWib, idr } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { profitOf } from "@/lib/orders/csv";

const NEXT: Partial<Record<OrderStatus, OrderStatus[]>> = {
  ordered: ["confirmed", "cancelled"], confirmed: ["paid", "shipped", "cancelled"], paid: ["shipped", "cancelled"], shipped: ["delivered", "returned"], delivered: ["returned"],
};
const CHANNELS: OrderChannel[] = ["whatsapp", "website", "shopify", "tokopedia", "shopee", "tiktok_shop"];

export default async function Orders({ searchParams }: { searchParams: Promise<{ ch?: string }> }) {
  const { ch } = await searchParams;
  const [ctx, t] = await Promise.all([getCtx(), getT()]);
  const O = t.orders;
  const filter = CHANNELS.includes(ch as OrderChannel) ? (ch as OrderChannel) : undefined;
  const rows = await ctx.db.select({ o: orders, product: products.name }).from(orders).leftJoin(products, eq(orders.productId, products.id))
    .where(and(eq(orders.workspaceId, ctx.workspaceId), filter ? eq(orders.channel, filter) : undefined)).orderBy(desc(orders.orderedAt)).limit(100);
  const chip = (s: OrderStatus) => s === "delivered" ? "chip-go" : s === "returned" || s === "cancelled" ? "chip-stop" : "chip-wait";
  const attr = (a: string) => a === "confirmed" ? "chip-go" : a === "none" ? "chip-mute" : "chip-wait";
  return (
    <div>
      <h1 className="h1 mb-1">{O.title}</h1><p className="hint mb-4">{O.profitNote}</p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/orders" className={`chip min-h-8 ${filter ? "chip-mute" : ""}`}>{O.all}</Link>
        {CHANNELS.map((c) => <Link key={c} href={`/orders?ch=${c}`} className={`chip min-h-8 ${filter === c ? "" : "chip-mute"}`}>{t.channel[c]}</Link>)}
      </div>
      {!rows.length && <p className="rowline py-3">{O.empty}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead><tr className="hint">{[O.product, O.customer, O.amount, O.profit, O.status, O.link, ""].map((h, i) => <th key={i} scope="col" className="pb-2 pr-4 font-medium">{h}</th>)}</tr></thead>
          <tbody>{rows.map(({ o, product }) => <tr key={o.id} className="rowline align-top">
            <td className="py-2.5 pr-4"><span className="font-semibold">{product ?? "-"}</span><span className="hint block">{t.channel[o.channel]}, {dateWib(o.orderedAt, t.locale)}{o.paymentMethod === "cod" ? ", COD" : ""}</span></td>
            <td className="py-2.5 pr-4">{o.customerName || "-"}</td>
            <td className="py-2.5 pr-4 tabular">{idr(o.amountIdr)}</td>
            <td className="py-2.5 pr-4 font-bold tabular">{o.status === "delivered" ? idr(profitOf(o)) : "-"}</td>
            <td className="py-2.5 pr-4"><span className={`chip ${chip(o.status)}`}>{t.status[o.status]}</span></td>
            <td className="py-2.5 pr-4"><span className={`chip ${attr(o.attribution)}`}>{t.attr[o.attribution]}</span></td>
            <td className="py-2.5"><div className="flex gap-1">{(NEXT[o.status] ?? []).map((n) => <form key={n} action={updateOrder.bind(null, o.id, n)}><button className="btn min-h-8 px-2 text-[13px]">{t.status[n]}</button></form>)}</div></td>
          </tr>)}</tbody>
        </table>
      </div>
      <section className="mt-8 max-w-xl">
        <h2 className="h2">{O.imp}</h2><p className="hint mb-3">{O.impHint}</p>
        <form action={importOrders} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div><label className="lbl" htmlFor="channel">{O.channel}</label><select id="channel" name="channel" className="field">{(["tokopedia", "shopee", "tiktok_shop"] as const).map((c) => <option key={c} value={c}>{t.channel[c]}</option>)}</select></div>
          <div><label className="lbl" htmlFor="file">{O.file}</label><input id="file" name="file" type="file" accept=".csv,text/csv" required className="field" /></div>
          <button className="btn btn-main">{O.doImport}</button>
        </form>
      </section>
    </div>
  );
}
