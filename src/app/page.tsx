import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { activity, conversations, creatives } from "@/db/schema";
import { SimChip } from "@/components/sim-chip";
import { adapterStatus } from "@/lib/adapters";
import { getLimit } from "@/lib/budget";
import { getCtx } from "@/lib/ctx";
import { hourWib, idr, timeWib, dateWib } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { bestAngles, moneySummary } from "@/lib/queries";

export default async function Today() {
  const [ctx, t] = await Promise.all([getCtx(), getT()]);
  const w = eq(creatives.workspaceId, ctx.workspaceId);
  const c = async (cond: ReturnType<typeof and>, table: typeof creatives | typeof conversations) => (await ctx.db.select({ v: sql<number>`count(*)::int` }).from(table as typeof creatives).where(cond))[0].v;
  const ready = await c(and(w, eq(creatives.status, "in_review"), sql`(${creatives.compliance}->>'passed')::boolean`), creatives);
  const blocked = await c(and(w, eq(creatives.status, "in_review"), sql`not (${creatives.compliance}->>'passed')::boolean`), creatives);
  const human = (await ctx.db.select({ v: sql<number>`count(*)::int` }).from(conversations).where(and(eq(conversations.workspaceId, ctx.workspaceId), eq(conversations.handler, "needs_human"))))[0].v;
  const n = (ready ? 1 : 0) + (blocked ? 1 : 0) + (human ? 1 : 0);
  const [money, best, feed, cap] = await Promise.all([
    moneySummary(ctx), bestAngles(ctx),
    ctx.db.select().from(activity).where(eq(activity.workspaceId, ctx.workspaceId)).orderBy(desc(activity.createdAt)).limit(8),
    getLimit(ctx, "ads_daily"),
  ]);
  const h = hourWib(new Date());
  const hello = h < 11 ? t.today.morning : h < 15 ? t.today.noon : h < 18 ? t.today.evening : t.today.night;
  const decisions = [
    ready > 0 && { title: t.today.adsReady(ready), sub: t.today.adsReadySub, href: "/approvals", cta: t.today.review },
    blocked > 0 && { title: t.today.blocked(blocked), sub: t.today.blockedSub, href: "/approvals", cta: t.today.review },
    human > 0 && { title: t.today.chatsNeed(human), sub: "", href: "/chats?filter=human", cta: t.today.open },
  ].filter(Boolean) as { title: string; sub: string; href: string; cta: string }[];
  return (
    <div>
      <section className="-mx-4 -mt-6 bg-kunyit px-4 pb-6 pt-7 md:-mx-8 md:-mt-9 md:px-8 md:pb-8 md:pt-10">
        <h1 className="h1 max-w-3xl">{hello} {t.today.needs(n)}</h1>
        {decisions.length > 0 && <ul className="mt-5 max-w-3xl divide-y-[1.5px] divide-tinta/20 border-y-[1.5px] border-tinta/20">
          {decisions.map((d) => <li key={d.title} className="flex items-center justify-between gap-4 py-3">
            <div><p className="text-[17px] font-bold">{d.title}</p>{d.sub && <p className="text-sm text-tinta/75">{d.sub}</p>}</div>
            <Link href={d.href} className="btn btn-main">{d.cta}</Link>
          </li>)}
        </ul>}
      </section>

      <section className="mt-8 grid gap-x-10 gap-y-5 md:grid-cols-[1.4fr_1fr]">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-abu">{t.today.profit}{!adapterStatus().ads && <SimChip label={t.sim} tip={t.simTip} />}</h2>
          <p className="text-[clamp(40px,6vw,64px)] leading-tight tabular" style={{ fontFamily: "var(--font-display)" }}>{idr(money.profit)}</p>
          <p className="hint">{idr(money.confirmedProfit)} {t.today.confirmed}, {idr(money.estimatedProfit)} {t.today.estimated}</p>
        </div>
        <dl className="grid grid-cols-2 gap-4 self-end sm:grid-cols-3">
          <div><dt className="hint">{t.today.spend}</dt><dd className="text-lg font-bold tabular">{idr(money.spend)}</dd><dd className="hint">{t.today.cap(idr(cap))}</dd></div>
          <div><dt className="hint">{t.today.transit}</dt><dd className="text-lg font-bold tabular">{money.transit}</dd><dd className="hint">{t.today.transitSub}</dd></div>
          <div><dt className="hint">{t.today.returned}</dt><dd className="text-lg font-bold tabular">{money.returned}</dd></div>
        </dl>
      </section>

      <div className="mt-10 grid gap-10 md:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="h2 mb-2">{t.today.did}</h2>
          <ul>{feed.map((a) => <li key={a.id} className="rowline py-2.5">
            <div className="flex justify-between gap-3"><p className="font-semibold">{a.href ? <Link href={a.href} className="hover:underline">{a.action}</Link> : a.action}</p><time className="hint shrink-0 tabular">{dateWib(a.createdAt, t.locale)}, {timeWib(a.createdAt, t.locale)}</time></div>
            <p className="hint"><span className="font-semibold">{a.actor}</span>{a.reason ? `: ${a.reason}` : ""}</p>
          </li>)}</ul>
        </section>
        <section>
          <h2 className="h2 mb-2">{t.today.best}</h2>
          {best.length === 0 && <p className="hint rowline py-3">{t.today.noBest}</p>}
          <ul>{best.slice(0, 5).map((b) => <li key={b.id} className="rowline flex justify-between gap-3 py-2.5">
            <div><p className="font-semibold">{b.title}</p><p className="hint">{b.product}</p></div>
            <div className="text-right"><p className="font-bold tabular">{idr(b.profit)}</p><p className="hint tabular">{t.today.sales(b.sales)}</p></div>
          </li>)}</ul>
        </section>
      </div>
    </div>
  );
}
