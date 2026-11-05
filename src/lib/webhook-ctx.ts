import { asc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { workspaces } from "@/db/schema";
import { ensureSeeded } from "./seed";
import type { Ctx } from "./types";

/** Webhooks belong to the first workspace until each business has its own connection. */
export async function webhookCtx(actor: string): Promise<Ctx> {
  await ensureSeeded();
  const db = await getDb();
  const [w] = await db.select({ id: workspaces.id }).from(workspaces).orderBy(asc(workspaces.createdAt)).limit(1);
  return { db, workspaceId: w.id, actor };
}
