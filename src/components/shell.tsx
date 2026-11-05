import Link from "next/link";
import { cookies } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { conversations, creatives } from "@/db/schema";
import { adapterStatus } from "@/lib/adapters";
import { getCtx } from "@/lib/ctx";
import { getT } from "@/lib/i18n";
import { NavLink } from "./nav-link";
import { Flash } from "./flash";

export async function Shell({ children }: { children: React.ReactNode }) {
  const [ctx, t] = await Promise.all([getCtx(), getT()]);
  const count = async (q: Promise<{ v: number }[]>) => (await q)[0]?.v ?? 0;
  const review = await count(ctx.db.select({ v: sql<number>`count(*)::int` }).from(creatives).where(and(eq(creatives.workspaceId, ctx.workspaceId), eq(creatives.status, "in_review"))));
  const human = await count(ctx.db.select({ v: sql<number>`count(*)::int` }).from(conversations).where(and(eq(conversations.workspaceId, ctx.workspaceId), eq(conversations.handler, "needs_human"))));
  const a = adapterStatus();
  const simulated = !a.ai || !a.ads || !a.whatsapp;
  const flash = (await cookies()).get("flash")?.value;
  const items = [
    { href: "/", label: t.nav.today, icon: "M4 11l8-7 8 7v9h-5v-6H9v6H4z", mobile: true },
    { href: "/approvals", label: t.nav.approvals, icon: "M5 12l5 5L20 7", badge: review, mobile: true },
    { href: "/products", label: t.nav.products, icon: "M4 8l8-4 8 4v9l-8 4-8-4zM4 8l8 4 8-4M12 12v9", mobile: true },
    { href: "/ads", label: t.nav.ads, icon: "M4 10v4l12 5V5zM16 9a3 3 0 010 6" },
    { href: "/chats", label: t.nav.chats, icon: "M4 5h16v11H9l-5 4z", badge: human, mobile: true },
    { href: "/orders", label: t.nav.orders, icon: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6", mobile: true },
    { href: "/dashboard", label: t.nav.dashboard, icon: "M4 20V10M10 20V4M16 20v-7M21 20H3" },
    { href: "/rules", label: t.nav.rules, icon: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h3" },
    { href: "/settings", label: t.nav.settings, icon: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3" },
  ];
  return (
    <div className="min-h-dvh md:pl-56">
      <aside className="kawung fixed inset-y-0 left-0 hidden w-56 flex-col text-white md:flex">
        <Link href="/" className="px-5 pb-4 pt-6 text-[34px] leading-none" style={{ fontFamily: "var(--font-display)" }}>Laris</Link>
        <p className="px-5 pb-5 text-[13px] text-white/70">{ctx.workspace.name}</p>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Menu">
          {items.map((i) => <NavLink key={i.href} {...i} />)}
        </nav>
        {simulated && <Link href="/settings" title={t.simTip} className="m-3 rounded-lg bg-kunyit px-3 py-2 text-[13px] font-semibold text-tinta">{t.sim}: {[!a.ai && "AI", !a.ads && "Meta", !a.whatsapp && "WhatsApp"].filter(Boolean).join(", ")}</Link>}
      </aside>
      <header className="kawung sticky top-0 z-20 flex items-center justify-between px-4 py-2.5 text-white md:hidden">
        <Link href="/" className="text-2xl leading-none" style={{ fontFamily: "var(--font-display)" }}>Laris</Link>
        <div className="flex items-center gap-2">
          {simulated && <Link href="/settings" className="rounded-md bg-kunyit px-2 py-1 text-xs font-semibold text-tinta">{t.sim}</Link>}
          <details className="relative">
            <summary className="cursor-pointer list-none rounded-md border border-white/40 px-2 py-1 text-sm font-semibold">Menu</summary>
            <div className="absolute right-0 z-30 mt-2 w-44 rounded-xl bg-white p-1 text-tinta shadow-lg">
              {items.filter((i) => !i.mobile).map((i) => <Link key={i.href} href={i.href} className="block rounded-lg px-3 py-2 font-semibold hover:bg-awan">{i.label}</Link>)}
            </div>
          </details>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-9">{flash && <Flash text={flash} />}{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t-[1.5px] border-garis bg-white md:hidden" aria-label="Menu">
        {items.filter((i) => i.mobile).map((i) => <NavLink key={i.href} {...i} compact />)}
      </nav>
    </div>
  );
}
