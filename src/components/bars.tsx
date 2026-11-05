export type Bar = { label: string; value: number; display: string };

/** Single-series bars with per-mark tooltips and a table view, so color is never the only way to read them. */
export function Bars({ title, data, color, tableLabel, dayLabel }: { title: string; data: Bar[]; color: string; tableLabel: string; dayLabel: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const H = 140;
  return (
    <figure>
      <figcaption className="font-semibold">{title}</figcaption>
      <div className="mt-2 flex h-[168px] items-end gap-[2px] border-b border-garis" role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.display}`).join(", ")}`}>
        {data.map((d) => <div key={d.label} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.label}: ${d.display}`}>
          <div className="mx-auto w-full max-w-9 rounded-t" style={{ height: Math.max(2, (d.value / max) * H), background: color }} />
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-tinta px-2 py-1 text-xs text-white group-hover:block">{d.display}</span>
        </div>)}
      </div>
      <div className="mt-1 flex gap-[2px]">{data.map((d, i) => <span key={d.label} className="hint flex-1 text-center text-[11.5px] tabular">{i === 0 || i === data.length - 1 ? d.label : ""}</span>)}</div>
      <details className="mt-1"><summary className="hint cursor-pointer">{tableLabel}</summary>
        <table className="mt-1 w-full text-sm"><thead><tr className="hint"><th className="text-left font-medium">{dayLabel}</th><th className="text-right font-medium">{title}</th></tr></thead><tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td className="text-right tabular">{d.display}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

export function HBars({ data, color }: { data: (Bar & { note?: string })[]; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return <ul className="space-y-2.5">{data.map((d) => <li key={d.label}>
    <div className="flex justify-between gap-3"><span className="font-semibold">{d.label}{d.note && <span className="chip chip-mute ml-2">{d.note}</span>}</span><span className="font-bold tabular">{d.display}</span></div>
    <div className="mt-1 h-2 rounded-r bg-nila-soft"><div className="h-2 rounded-r" style={{ width: `${(Math.max(d.value, 0) / max) * 100}%`, background: color }} /></div>
  </li>)}</ul>;
}
