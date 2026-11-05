import { and, eq } from "drizzle-orm";
import { goalTemplates, rulebooks } from "@/db/schema";
import { saveGoal, saveRulebook } from "@/app/actions";
import { getCtx } from "@/lib/ctx";
import { getT } from "@/lib/i18n";

export default async function Rules() {
  const [ctx, t] = await Promise.all([getCtx(), getT()]);
  const R = t.rules;
  const active = await ctx.db.select().from(rulebooks).where(and(eq(rulebooks.workspaceId, ctx.workspaceId), eq(rulebooks.active, true)));
  const goals = await ctx.db.select().from(goalTemplates).where(eq(goalTemplates.workspaceId, ctx.workspaceId));
  return (
    <div>
      <h1 className="h1">{R.title}</h1><p className="mt-2 max-w-2xl">{R.intro}</p>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        {(["ads", "whatsapp"] as const).map((k) => { const b = active.find((x) => x.kind === k); return (
          <form key={k} action={saveRulebook.bind(null, k)} className="space-y-3">
            <div className="flex items-center justify-between"><h2 className="h2">{R[k]}</h2>{b && <span className="chip chip-mute">{R.version(b.version)}</span>}</div>
            <div><label className="lbl" htmlFor={`${k}-tone`}>{R.tone}</label><input id={`${k}-tone`} name="tone" defaultValue={b?.tone} className="field" /></div>
            <div><label className="lbl" htmlFor={`${k}-rules`}>{R.list}</label><textarea id={`${k}-rules`} name="rules" rows={7} defaultValue={b?.rules.map((r) => r.text).join("\n")} className="field" />{k === "ads" && <p className="hint mt-1">{R.listHint}</p>}</div>
            <button className="btn btn-main">{R.save}</button>
          </form>
        ); })}
      </div>
      <h2 className="h2 mt-10 mb-2">{R.goals}</h2>
      <ul>{goals.map((g) => <li key={g.id} className="rowline py-3">
        <form action={saveGoal.bind(null, g.id)} className="grid items-end gap-3 sm:grid-cols-[1.2fr_1fr_1fr_.7fr_auto]">
          <p className="font-bold">{t.goal[g.key]}</p>
          <div><label className="hint" htmlFor={`t-${g.id}`}>{R.target}</label><input id={`t-${g.id}`} name="target" defaultValue={g.rules.targetIdr} className="field tabular" /></div>
          <div><label className="hint" htmlFor={`p-${g.id}`}>{R.pauseAt}</label><input id={`p-${g.id}`} name="pauseAt" defaultValue={g.rules.pauseSpendWithoutResultIdr} className="field tabular" /></div>
          <div><label className="hint" htmlFor={`f-${g.id}`}>{R.freq}</label><input id={`f-${g.id}`} name="freq" defaultValue={g.rules.maxFrequency} className="field tabular" /></div>
          <button className="btn">{R.saveGoal}</button>
        </form>
      </li>)}</ul>
    </div>
  );
}
