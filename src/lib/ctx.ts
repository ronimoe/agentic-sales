import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { members, workspaces } from "@/db/schema";
import { ensureSeeded } from "./seed";
import { resolveSession } from "./session";
import type { Ctx } from "./types";

export type AppCtx = Ctx & { workspace: typeof workspaces.$inferSelect; member: typeof members.$inferSelect; allWorkspaces: { id: string; name: string }[]; allMembers: (typeof members.$inferSelect)[] };

/** Prototype session: workspace and member come from cookies until Supabase Auth is connected. */
export async function getCtx(): Promise<AppCtx> {
  await ensureSeeded();
  const db = await getDb();
  const jar = await cookies();
  const all = await db.select().from(workspaces).orderBy(workspaces.createdAt);
  const rows = await db.select().from(members);
  const session = resolveSession(all, (w) => rows.filter((m) => m.workspaceId === w.id), { ws: jar.get("ws")?.value, member: jar.get("member")?.value }, !!process.env.DATABASE_URL);
  const { workspace, member } = session;
  return { db, workspaceId: workspace.id, actor: member.name, workspace, member, allMembers: session.visibleMembers, allWorkspaces: session.visibleWorkspaces.map((w) => ({ id: w.id, name: w.name })) };
}

export const can = (role: string, action: "approve" | "settings" | "chat") =>
  action === "chat" ? true : action === "approve" ? role === "owner" || role === "approver" : role === "owner";
