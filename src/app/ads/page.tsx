import { and, desc, eq, inArray } from "drizzle-orm";
import { campaigns, creatives, products } from "@/db/schema";
import { pauseAd, resume, simulate, syncMeta } from "@/app/actions";
import { adsPlatform } from "@/lib/ads/platform";
import { can, getCtx } from "@/lib/ctx";
import { idr, num, pct } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { adScore, scorecard } from "@/lib/queries";

export default async function Ads() {
  const [ctx, t] = await Promise.all([getCtx(), getT()]);
  const rows = await ctx.db.select({ c: creatives, camp: campaigns, product: products.name }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).innerJoin(products, eq(campaigns.productId, products.id))
    .where(and(eq(creatives.workspaceId, ctx.workspaceId), inArray(creatives.status, ["live", "paused"]))).orderBy(desc(creatives.status), desc(creatives.createdAt));
  const score = await adScore(ctx, rows.map((r) => r.c.id));
  const sim = adsPlatform().simulated; const ok = can(ctx.member.role, "approve");
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h1 className="h1">{t.ads.title}</h1>
        {sim && <form action={simulate}><button className="btn" title={t.ads.simHint}><span className="chip chip-wait">{t.sim}</span>{t.ads.simDay}</button></form>}
        {!sim && <form action={syncMeta}><button className="btn btn-main">{t.ads.sync}</button></form>}
      </div>
      {!rows.length && <div className="py-6"><h2 className="h2">{t.ads.empty}</h2><p>{t.ads.emptyBody}</p></div>}
      <ul>{rows.map(({ c, camp, product }) => { const s = score.get(c.id)!; return (
        <li key={c.id} className="rowline grid grid-cols-[64px_minmax(0,1fr)] gap-x-4 gap-y-2 py-3 md:grid-cols-[64px_minmax(0,1.3fr)_minmax(0,1.5fr)_auto] md:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/assets/${c.posterPath}`} alt="" className="h-20 w-16 rounded-md object-cover" />
          <div><p className="font-bold">{c.hook}</p><p className="hint">{product}, {t.goal[camp.goal]}, {t.dest[camp.destination]}</p>
            {c.status === "paused" ? <p className="mt-1 text-sm"><span className="chip chip-stop">{t.status.paused}</span> {c.pauseReason}</p> : <span className="chip chip-go mt-1">{t.status.live}</span>}</div>
          <dl className="col-span-2 flex flex-wrap gap-x-5 gap-y-1 md:col-span-1"><div><dt className="hint">{t.ads.spend}</dt><dd className="font-bold tabular">{idr(s.spend)}</dd></div>{scorecard(camp.goal, s, t, idr, num, pct).map(([k, v]) => <div key={k}><dt className="hint">{k}</dt><dd className="font-bold tabular">{v}</dd></div>)}</dl>
          {ok && <form className="col-span-2 md:col-span-1" action={c.status === "live" ? pauseAd.bind(null, c.id) : resume.bind(null, c.id)}><button className="btn">{c.status === "live" ? t.ads.pause : t.ads.resume}</button></form>}
        </li>
      ); })}</ul>
    </div>
  );
}
