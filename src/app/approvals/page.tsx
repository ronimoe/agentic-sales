import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { angles, campaigns, creatives, products } from "@/db/schema";
import { Reviewer } from "@/components/reviewer";
import { can, getCtx } from "@/lib/ctx";
import { idr } from "@/lib/format";
import { getT } from "@/lib/i18n";

export default async function Approvals() {
  const [ctx, t] = await Promise.all([getCtx(), getT()]);
  const rows = await ctx.db.select({ c: creatives, camp: campaigns, a: angles, p: products }).from(creatives)
    .innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).innerJoin(angles, eq(creatives.angleId, angles.id)).innerJoin(products, eq(campaigns.productId, products.id))
    .where(and(eq(creatives.workspaceId, ctx.workspaceId), eq(creatives.status, "in_review"))).orderBy(asc(creatives.createdAt));
  const a = t.approvals;
  if (!rows.length) return (
    <div className="max-w-xl py-10"><h1 className="h1">{a.doneTitle}</h1><p className="mt-3">{a.doneBody}</p><Link className="btn btn-main mt-5" href="/products">{a.makePlan}</Link></div>
  );
  const items = rows.map(({ c, camp, a: an, p }) => ({
    id: c.id, hook: c.hook, primaryText: c.primaryText, headline: c.headline, cta: c.cta, format: c.format, assetPath: c.assetPath, posterPath: c.posterPath,
    goal: t.goal[camp.goal], dest: t.dest[camp.destination], budget: idr(camp.dailyBudgetIdr), angle: an.title, audience: an.audience, product: p.name,
    opener: c.whatsappOpener, form: c.formQuestions, passed: c.compliance.passed, issues: c.compliance.issues,
  }));
  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between gap-3"><h1 className="h1">{a.title}</h1><p className="font-semibold tabular">{a.left(rows.length)}</p></div>
      {!can(ctx.member.role, "approve") && <p className="mb-4 rounded-xl bg-kunyit-soft px-4 py-2">{a.noPerm}</p>}
      <Reviewer items={items} canApprove={can(ctx.member.role, "approve")} l={{ ...a, left: a.left(rows.length) }} />
    </div>
  );
}
