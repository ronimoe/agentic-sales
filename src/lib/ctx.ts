import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { members, workspaces } from "@/db/schema";
import { ensureSeeded } from "./seed";
import type { Ctx } from "./types";

export type AppCtx = Ctx & { workspace: typeof workspaces.$inferSelect; member: typeof members.$inferSelect; allWorkspaces: { id: string; name: string }[]; allMembers: (typeof members.$inferSelect)[] };

/** Prototype session: workspace and member come from cookies until Supabase Auth is connected. */
export async function getCtx(): Promise<AppCtx> {
  await ensureSeeded();
  const db = await getDb();
  const jar = await cookies();
  const all = await db.select().from(workspaces).orderBy(workspaces.createdAt);
  const workspace = all.find((w) => w.id === jar.get("ws")?.value) ?? all[0];
  const allMembers = await db.select().from(members).where(eq(members.workspaceId, workspace.id));
  const member = allMembers.find((m) => m.id === jar.get("member")?.value) ?? allMembers[0];
  return { db, workspaceId: workspace.id, actor: member.name, workspace, member, allMembers, allWorkspaces: all.map((w) => ({ id: w.id, name: w.name })) };
}

export const can = (role: string, action: "approve" | "settings" | "chat") =>
  action === "chat" ? true : action === "approve" ? role === "owner" || role === "approver" : role === "owner";
