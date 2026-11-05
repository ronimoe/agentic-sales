import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { angles, campaignPlans, campaigns, creatives, products } from "@/db/schema";
import { createPlan } from "@/app/actions";
import { getCtx } from "@/lib/ctx";
import { idr, num, pct } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { adScore, bestAngles, scorecard } from "@/lib/queries";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ctx, t] = await Promise.all([getCtx(), getT()]);
  const [p] = await ctx.db.select().from(products).where(and(eq(products.id, id), eq(products.workspaceId, ctx.workspaceId)));
  if (!p) notFound();
  const camps = await ctx.db.select().from(campaigns).where(eq(campaigns.productId, id)).orderBy(desc(campaigns.createdAt));
  const ads = await ctx.db.select().from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).where(eq(campaigns.productId, id));
  const score = await adScore(ctx, ads.map((a) => a.creatives.id));
  const [plan] = await ctx.db.select().from(campaignPlans).where(eq(campaignPlans.productId, id)).orderBy(desc(campaignPlans.createdAt)).limit(1);
  const ang = await ctx.db.select().from(angles).where(eq(angles.productId, id)).orderBy(desc(angles.createdAt));
  const results = await bestAngles(ctx, id);
  const P = t.products;
  return (
    <div>
      <p className="hint tabular">{idr(p.priceIdr)}, {P.margin.toLowerCase()} {pct(p.priceIdr ? (p.priceIdr - p.costIdr) / p.priceIdr : 0)}, {P.stock.toLowerCase()} {p.stock}</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <h1 className="h1 max-w-3xl">{p.name}</h1>
        <form action={createPlan.bind(null, p.id)}><button className="btn btn-main">{P.plan}</button></form>
      </div>
      {plan && <p className="mt-3 max-w-3xl"><span className="font-semibold">{P.why}: </span>{plan.rationale}</p>}

      <h2 className="h2 mt-8 mb-3">{P.campaigns}</h2>
      {!camps.length && <p className="rowline py-3">{P.noCampaign}</p>}
      <ul className="grid gap-4 md:grid-cols-2">
        {camps.map((c) => {
          const list = ads.filter((a) => a.creatives.campaignId === c.id).map((a) => a.creatives);
          const sum = { spend: 0, reach: 0, impressions: 0, watches: 0, chats: 0, qualified: 0, sales: 0 };
          for (const a of list) { const s = score.get(a.id); if (s) (Object.keys(sum) as (keyof typeof sum)[]).forEach((k) => { sum[k] += s[k]; }); }
          return (
            <li key={c.id} className="rounded-2xl border-[1.5px] border-garis bg-white p-4">
              <div className="flex items-center justify-between gap-2"><h3 className="text-[17px] font-bold">{t.goal[c.goal]}</h3><span className={`chip ${c.status === "live" ? "chip-go" : c.status === "paused" ? "chip-stop" : "chip-mute"}`}>{t.status[c.status]}</span></div>
              <p className="hint">{t.dest[c.destination]}, {idr(c.dailyBudgetIdr)} / {t.lang === "en" ? "day" : "hari"}</p>
              <div className="mt-3 flex gap-1.5">{list.map((a) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={a.id} src={`/api/assets/${a.posterPath}`} alt={a.hook} title={a.hook} className="h-20 w-16 rounded-md object-cover" />
              ))}</div>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">{scorecard(c.goal, sum, t, idr, num, pct).map(([k, v]) => <div key={k}><dt className="hint">{k}</dt><dd className="font-bold tabular">{v}</dd></div>)}</dl>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 grid gap-8 md:grid-cols-[1.3fr_1fr]">
        <section><h2 className="h2 mb-2">{P.angles}</h2>
          <ul>{ang.map((a) => { const r = results.find((x) => x.id === a.id); return (
            <li key={a.id} className="rowline flex justify-between gap-4 py-2.5"><div><p className="font-semibold">{a.title}</p><p className="hint">{a.audience}. {a.pain}.</p></div>{r && <p className="shrink-0 text-right font-bold tabular">{idr(r.profit)}<span className="hint block font-normal">{r.sales} {P.sold}</span></p>}</li>
          ); })}</ul>
        </section>
        <section><h2 className="h2 mb-2">{P.facts}</h2>
          <dl>{[[P.desc, p.description], [P.bpom, p.bpomNumber], [P.halal, p.halalStatus], [P.claims, p.approvedClaims.join(", ")], [P.proof, p.proof.join(", ")]].map(([k, v]) => <div key={k} className="rowline py-2"><dt className="hint">{k}</dt><dd>{v || <span className="hint">{P.none}</span>}</dd></div>)}</dl>
        </section>
      </div>
    </div>
  );
}
