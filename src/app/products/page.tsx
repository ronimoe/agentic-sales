import Link from "next/link";
import { desc, eq, sql, and } from "drizzle-orm";
import { campaigns, creatives, products } from "@/db/schema";
import { getCtx } from "@/lib/ctx";
import { idr, pct } from "@/lib/format";
import { getT } from "@/lib/i18n";

export default async function Products() {
  const [ctx, t] = await Promise.all([getCtx(), getT()]);
  const rows = await ctx.db.select().from(products).where(eq(products.workspaceId, ctx.workspaceId)).orderBy(desc(products.createdAt));
  const posters = await ctx.db.select({ productId: campaigns.productId, poster: sql<string>`min(${creatives.posterPath})`, live: sql<number>`count(*) filter (where ${creatives.status}='live')::int` }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).where(and(eq(creatives.workspaceId, ctx.workspaceId))).groupBy(campaigns.productId);
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3"><h1 className="h1">{t.products.title}</h1><Link href="/products/new" className="btn btn-main">{t.products.add}</Link></div>
      {!rows.length && <div className="py-8"><h2 className="h2">{t.products.empty}</h2><p className="mt-1">{t.products.emptyBody}</p></div>}
      <ul className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => { const a = posters.find((x) => x.productId === p.id); return (
          <li key={p.id}><Link href={`/products/${p.id}`} className="group block">
            <div className="aspect-[4/5] overflow-hidden rounded-2xl bg-nila-soft">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a?.poster ? <img src={`/api/assets/${a.poster}`} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center px-6 text-center font-semibold text-nila">{t.products.plan}</div>}
            </div>
            <h2 className="mt-2.5 text-[17px] font-bold group-hover:underline">{p.name}</h2>
            <p className="hint tabular">{idr(p.priceIdr)}, {t.products.margin.toLowerCase()} {pct(p.priceIdr ? (p.priceIdr - p.costIdr) / p.priceIdr : 0)}, {t.products.stock.toLowerCase()} {p.stock}</p>
            {a && a.live > 0 && <span className="chip chip-go mt-1">{a.live} {t.status.live.toLowerCase()}</span>}
          </Link></li>
        ); })}
      </ul>
    </div>
  );
}
