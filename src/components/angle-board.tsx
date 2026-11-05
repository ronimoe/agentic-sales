import { and, asc, eq } from "drizzle-orm";
import { addAngle, draftIdeas, restoreIdea, stopIdea, testIdea } from "@/app/actions";
import { angles, type GoalKey } from "@/db/schema";
import { angleCapacity } from "@/lib/angles/logic";
import { getLimit, liveDailyTotal } from "@/lib/budget";
import { idr, num } from "@/lib/format";
import type { Messages } from "@/lib/i18n/messages";
import { angleCells } from "@/lib/pipeline";
import type { Ctx } from "@/lib/types";

const COLS: GoalKey[] = ["eyeball", "whatsapp_chat", "cold_sell", "form", "retargeting"];
const CHIP = { idea: "chip-mute", testing: "", winning: "chip-go", stopped: "chip-stop" } as const;

export async function AngleBoard({ ctx, productId, t }: { ctx: Ctx; productId: string; t: Messages }) {
  const P = t.products;
  const list = await ctx.db.select().from(angles).where(and(eq(angles.productId, productId), eq(angles.workspaceId, ctx.workspaceId))).orderBy(asc(angles.createdAt));
  const cells = await angleCells(ctx, productId);
  const room = (await getLimit(ctx, "ads_daily")) - (await liveDailyTotal(ctx));
  const active = list.filter((a) => a.status === "testing" || a.status === "winning").sort((a, b) => Number(b.status === "winning") - Number(a.status === "winning"));
  const ideas = list.filter((a) => a.status === "idea");
  const stopped = list.filter((a) => a.status === "stopped");
  const cols = COLS.filter((g) => cells.some((c) => c.goal === g));
  const unit = (g: GoalKey) => g === "eyeball" ? P.costUnit.eyeball : g === "form" ? P.costUnit.form : P.costUnit.sale;
  const Head = (a: (typeof list)[0]) => <><span className={`chip ${CHIP[a.status]}`}>{P.angleStatus[a.status]}</span> <span className="chip chip-mute">{P.angleType[a.type]}</span><p className="mt-1 font-bold">{a.title}</p><p className="hint">{a.audience}{a.audience && a.pain ? ". " : ""}{a.pain}</p></>;
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="h2">{P.board}</h2><p className="hint">{P.boardHint} {P.capacity(angleCapacity(room))}</p></div>
        <form action={draftIdeas.bind(null, productId)}><button className="btn">{P.moreIdeas}</button></form>
      </div>
      {!list.length && <p className="rowline mt-3 py-3">{P.noAngles}</p>}
      {active.length > 0 && <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead><tr className="hint"><th scope="col" className="pb-2 pr-4 font-medium">{P.angleCol}</th>{cols.map((g) => <th key={g} scope="col" className="pb-2 pr-4 font-medium">{t.goal[g]}<span className="block text-xs">{unit(g)}</span></th>)}<th /></tr></thead>
          <tbody>{active.map((a) => <tr key={a.id} className="rowline align-top">
            <td className="max-w-72 py-3 pr-4">{Head(a)}</td>
            {cols.map((g) => { const c = cells.find((x) => x.angleId === a.id && x.goal === g); return (
              <td key={g} className="py-3 pr-4 tabular">{!c ? <span className="hint">{P.noAd}</span> : c.cost === null ? <span className="hint">{P.noResult}</span> : <><span className="font-bold">{idr(c.cost)}</span><span className="hint block">{num(c.results)}</span>{c.best && <span className="chip chip-go mt-0.5">{P.best}</span>}</>}</td>
            ); })}
            <td className="py-3"><form action={stopIdea.bind(null, a.id)}><button className="btn min-h-8 px-3 text-[13px]">{P.stop}</button></form></td>
          </tr>)}</tbody>
        </table>
      </div>}
      {ideas.length > 0 && <div className="mt-6"><h3 className="font-bold">{P.ideasTitle(ideas.length)}</h3>
        <ul className="mt-2 grid gap-x-8 md:grid-cols-2">{ideas.map((a) => <li key={a.id} className="rowline flex items-start justify-between gap-3 py-2.5"><div>{Head(a)}</div><form action={testIdea.bind(null, a.id)}><button className="btn min-h-8 px-3 text-[13px]">{P.test}</button></form></li>)}</ul>
      </div>}
      {stopped.length > 0 && <details className="mt-6"><summary className="cursor-pointer font-bold">{P.stoppedTitle(stopped.length)}</summary>
        <ul className="mt-2">{stopped.map((a) => <li key={a.id} className="rowline flex items-start justify-between gap-3 py-2.5"><div>{Head(a)}{a.stopReason && <p className="mt-0.5 text-sm">{a.stopReason}</p>}</div><form action={restoreIdea.bind(null, a.id)}><button className="btn min-h-8 px-3 text-[13px]">{P.restore}</button></form></li>)}</ul>
      </details>}
      <details className="mt-6"><summary className="cursor-pointer font-bold">{P.addAngle}</summary>
        <form action={addAngle.bind(null, productId)} className="mt-3 grid max-w-3xl gap-3 sm:grid-cols-2">
          {([["title", P.angleTitle], ["hook", P.hookF], ["audience", P.audienceF], ["pain", P.painF], ["promise", P.promiseF], ["proof", P.proofF]] as const).map(([n, l]) => <div key={n}><label className="lbl" htmlFor={`a-${n}`}>{l}</label><input id={`a-${n}`} name={n} required={n === "title"} className="field" /></div>)}
          <div><button className="btn btn-main">{P.addSave}</button></div>
        </form>
      </details>
    </section>
  );
}
