"use client";
import { useEffect, useState, useTransition } from "react";
import { approve, reject } from "@/app/actions";

export type ReviewItem = {
  id: string; hook: string; primaryText: string; headline: string; cta: string; format: string; assetPath: string | null; posterPath: string | null;
  goal: string; dest: string; budget: string; angle: string; audience: string; product: string; opener: string | null; form: string[] | null; passed: boolean; issues: string[]; checks: { key: string; label: string; status: string; detail?: string }[]; attempts: number; attemptsText: string; script: string | null;
};
type L = { checks: string; warn: string; fail: string; notRun: string; script: string; left: string; approve: string; reject: string; rejectWhy: string; confirmReject: string; reasons: string[]; goal: string; dest: string; budget: string; angle: string; audience: string; check: string; passed: string; text: string; opener: string; form: string; keys: string; other: string };

const ORDER: Record<string, number> = { fail: 0, warn: 1, not_run: 2, pass: 3 };

export function Reviewer({ items, l, canApprove }: { items: ReviewItem[]; l: L; canApprove: boolean }) {
  const [idx, setIdx] = useState(0);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [pending, start] = useTransition();
  const i = Math.min(idx, items.length - 1);
  const c = items[i];
  const rejecting = rejectingId === c?.id;
  const setRejecting = (on: boolean) => { setWhy(""); setRejectingId(on ? c.id : null); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea") || e.metaKey || e.ctrlKey || !canApprove) return;
      if (e.key === "a" && c?.passed) start(() => approve(c.id));
      if (e.key === "r") { setWhy(""); setRejectingId(c?.id ?? null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [c, canApprove]);
  if (!c) return null;
  const media = c.assetPath?.endsWith(".mp4")
    ? <video key={c.id} src={`/api/assets/${c.assetPath}`} poster={`/api/assets/${c.posterPath}`} controls muted loop playsInline className="mx-auto max-h-[72vh] bg-black" />
    // eslint-disable-next-line @next/next/no-img-element
    : <img src={`/api/assets/${c.assetPath}`} alt={c.hook} className="mx-auto max-h-[72vh]" />;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div>
        <div className="overflow-hidden rounded-2xl border-[1.5px] border-tinta">{media}</div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={l.left}>
          {items.map((x, n) => <button key={x.id} onClick={() => setIdx(n)} aria-label={x.hook} aria-current={n === i} className={`h-16 w-[52px] shrink-0 overflow-hidden rounded-md border-2 ${n === i ? "border-nila" : "border-transparent opacity-70 hover:opacity-100"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/assets/${x.posterPath}`} alt="" className="h-full w-full object-cover" />
          </button>)}
        </div>
      </div>
      <div>
        <p className="hint">{c.product}</p>
        <h2 className="mt-0.5 text-[26px] font-extrabold leading-tight tracking-tight">{c.hook}</h2>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {[[l.goal, c.goal], [l.dest, c.dest], [l.budget, c.budget], [l.angle, c.angle], [l.audience, c.audience]].map(([k, v]) => <div key={k}><dt className="hint">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
        </dl>
        <div className="rowline mt-4 pt-3">
          <p className="hint">{l.checks}{c.attempts > 1 ? `, ${c.attemptsText}` : ""}</p>
          <ul className="mt-1 grid gap-x-5 sm:grid-cols-2">{[...c.checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]).map((x) => <li key={x.key} className="py-1"><span className="flex items-center justify-between gap-2"><span className="font-semibold">{x.label}</span><span className={`chip ${x.status === "pass" ? "chip-go" : x.status === "fail" ? "chip-stop" : x.status === "warn" ? "chip-wait" : "chip-mute"}`}>{x.status === "pass" ? l.passed : x.status === "fail" ? l.fail : x.status === "warn" ? l.warn : l.notRun}</span></span>{x.detail && x.status !== "pass" && <span className="hint block">{x.detail}</span>}</li>)}</ul>
        </div>
        <div className="rowline mt-4 pt-3"><p className="hint">{l.text}</p><p className="mt-1 max-w-prose">{c.primaryText}</p><p className="mt-1 font-semibold">{c.headline}</p><p className="hint">{c.cta}</p></div>
        {c.script && <div className="rowline mt-3 pt-3"><p className="hint">{l.script}</p><p>{c.script}</p></div>}
        {c.opener && <div className="rowline mt-3 pt-3"><p className="hint">{l.opener}</p><p>{c.opener}</p></div>}
        {c.form && <div className="rowline mt-3 pt-3"><p className="hint">{l.form}</p><ul className="list-inside list-disc">{c.form.map((q) => <li key={q}>{q}</li>)}</ul></div>}

        {canApprove && !rejecting && <div className="sticky bottom-16 mt-5 flex flex-wrap items-center gap-2 bg-awan py-2 md:bottom-0">
          <button className="btn btn-go min-h-12 flex-1 sm:flex-none" disabled={pending || !c.passed} style={!c.passed ? { opacity: .45, cursor: "not-allowed" } : undefined} onClick={() => start(() => approve(c.id))}>{l.approve}</button>
          <button className="btn min-h-12" onClick={() => setRejecting(true)}>{l.reject}</button>
          <span className="hint hidden lg:inline">{l.keys}</span>
        </div>}
        {canApprove && rejecting && <div className="mt-5 rounded-xl border-[1.5px] border-tinta bg-white p-4">
          <p className="font-semibold">{l.rejectWhy}</p>
          <div className="mt-2 flex flex-wrap gap-2">{l.reasons.map((r) => <button key={r} onClick={() => setWhy(r)} className={`chip ${why === r ? "" : "chip-mute"} min-h-8 cursor-pointer`} aria-pressed={why === r}>{r}</button>)}</div>
          <input className="field mt-3" autoFocus placeholder={l.other} value={why} onChange={(e) => setWhy(e.target.value)} />
          <div className="mt-3 flex gap-2"><button className="btn btn-main" disabled={pending} onClick={() => start(() => reject(c.id, why))}>{l.confirmReject}</button><button className="btn" onClick={() => setRejecting(false)}>×</button></div>
        </div>}
      </div>
    </div>
  );
}
