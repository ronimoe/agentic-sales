import { activity, usageEvents } from "@/db/schema";
import type { Ctx } from "./types";

export const logActivity = (ctx: Ctx, actor: string, action: string, reason = "", href?: string, at?: Date) =>
  ctx.db.insert(activity).values({ workspaceId: ctx.workspaceId, actor, action, reason, href, ...(at ? { createdAt: at } : {}) });

export const logUsage = (ctx: Ctx, kind: "ads" | "assets" | "ai" | "whatsapp", costIdr: number, simulated: boolean, note?: string, at?: Date) =>
  ctx.db.insert(usageEvents).values({ workspaceId: ctx.workspaceId, kind, costIdr, simulated, note, ...(at ? { createdAt: at } : {}) });
