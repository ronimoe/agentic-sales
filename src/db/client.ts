import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema>;
type Store = { db: Promise<Db> };
const store = globalThis as unknown as { __laris?: Store };

/** Applies supabase/migrations/*.sql in name order. Only used for the temporary local database. */
async function migrateLocal(exec: (sql: string) => Promise<unknown>, query: (sql: string, p?: unknown[]) => Promise<{ rows: unknown[] }>) {
  await exec("create table if not exists _local_migrations (name text primary key)");
  const dir = path.join(process.cwd(), "supabase/migrations");
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const done = await query("select 1 from _local_migrations where name = $1", [file]);
    if (done.rows.length) continue;
    await exec(fs.readFileSync(path.join(dir, file), "utf8"));
    await query("insert into _local_migrations(name) values ($1)", [file]);
  }
}

export async function createLocalDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  await migrateLocal((s) => client.exec(s), (s, p) => client.query(s, p));
  return drizzlePglite(client, { schema });
}

async function connect(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    const postgres = (await import("postgres")).default;
    // Migrations on remote Supabase are applied with: npx supabase db push
    return drizzlePostgres(postgres(process.env.DATABASE_URL, { prepare: false }), { schema }) as unknown as Db;
  }
  return createLocalDb(path.join(process.cwd(), ".data/pglite"));
}

export function getDb(): Promise<Db> {
  store.__laris ??= { db: connect() };
  return store.__laris.db;
}
