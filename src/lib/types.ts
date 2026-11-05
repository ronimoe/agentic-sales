import type { Db } from "@/db/client";
export type Ctx = { db: Db; workspaceId: string; actor: string };
