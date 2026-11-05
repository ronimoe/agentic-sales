"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type P = { href: string; label: string; icon: string; badge?: number; compact?: boolean };

export function NavLink({ href, label, icon, badge, compact }: P) {
  const path = usePathname();
  const on = href === "/" ? path === "/" : path.startsWith(href);
  const svg = <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={icon} /></svg>;
  const dot = badge ? <span className="rounded-full bg-kunyit px-1.5 text-xs font-bold text-tinta tabular">{badge}</span> : null;
  if (compact) return (
    <Link href={href} aria-current={on ? "page" : undefined} className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${on ? "text-nila" : "text-abu"}`}>
      {svg}<span className="max-w-full truncate px-0.5">{label}</span>{dot && <span className="absolute right-2 top-1">{dot}</span>}
    </Link>
  );
  return (
    <Link href={href} aria-current={on ? "page" : undefined} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 font-semibold ${on ? "bg-white text-nila" : "text-white/85 hover:bg-white/10"}`}>
      {svg}<span className="flex-1">{label}</span>{dot}
    </Link>
  );
}
