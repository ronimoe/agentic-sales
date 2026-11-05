import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { campaignPlans, campaigns, creatives, products } from "@/db/schema";
import Link from "next/link";
import { createPlan } from "@/app/actions";
import { AngleBoard } from "@/components/angle-board";
import { KnowledgePanel } from "@/components/knowledge-panel";
import { suggestLimits } from "@/lib/ads/limits";
import { getCtx } from "@/lib/ctx";
import { idr, num, pct } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { adScore, scorecard } from "@/lib/queries";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ctx, t] = await Promise.all([getCtx(), getT()]);
  const [p] = await ctx.db.select().from(products).where(and(eq(products.id, id), eq(products.workspaceId, ctx.workspaceId)));
  if (!p) notFound();
  const camps = await ctx.db.select().from(campaigns).where(eq(campaigns.productId, id)).orderBy(desc(campaigns.createdAt));
  const ads = await ctx.db.select().from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).where(eq(campaigns.productId, id));
  const score = await adScore(ctx, ads.map((a) => a.creatives.id));
  const [plan] = await ctx.db.select().from(campaignPlans).where(eq(campaignPlans.productId, id)).orderBy(desc(campaignPlans.createdAt)).limit(1);
  const P = t.products;
  const lim = suggestLimits(p);
  return (
    <div>
      <p className="hint tabular">{idr(p.priceIdr)}, {P.margin.toLowerCase()} {pct(p.priceIdr ? (p.priceIdr - p.costIdr) / p.priceIdr : 0)}, {P.stock.toLowerCase()} {p.stock}</p>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <h1 className="h1 max-w-3xl">{p.name}</h1>
        <div className="flex flex-wrap gap-2"><Link href={`/products/${p.id}/edit`} className="btn">{P.edit}</Link><form action={createPlan.bind(null, p.id)}><button className="btn btn-main">{P.plan}</button></form></div>
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

      <section className="mt-8 max-w-3xl rounded-2xl bg-nila-soft px-4 py-3">
        <h2 className="font-bold">{P.limits}</h2>
        <p>{P.limitsLine(idr(p.targetCostIdr ?? lim.targetIdr), idr(p.stopSpendIdr ?? lim.stopSpendIdr))}</p>
        <p className="hint">{p.targetCostIdr || p.stopSpendIdr ? P.limitsOwn : P.limitsWhy(idr(lim.net), idr(lim.returnLoss))}</p>
      </section>

      <KnowledgePanel ctx={ctx} p={p} t={P} />

      <AngleBoard ctx={ctx} productId={p.id} t={t} />

      <div className="mt-10 max-w-3xl">
        <section><h2 className="h2 mb-2">{P.facts}</h2>
          <dl>{[[P.desc, p.description], [P.bpom, p.bpomNumber], [P.halal, p.halalStatus], [P.claims, p.approvedClaims.join(", ")], [P.proof, p.proof.join(", ")]].map(([k, v]) => <div key={k} className="rowline py-2"><dt className="hint">{k}</dt><dd>{v || <span className="hint">{P.none}</span>}</dd></div>)}</dl>
        </section>
      </div>
    </div>
  );
}
