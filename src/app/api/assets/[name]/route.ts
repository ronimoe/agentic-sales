import fs from "node:fs";
import path from "node:path";
import { ASSET_DIR } from "@/lib/assets/render";

const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".mp4": "video/mp4" };

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[\w-]+\.(jpg|mp4)$/.test(name)) return new Response("Not found", { status: 404 });
  const file = path.join(ASSET_DIR, name);
  if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(file), { headers: { "content-type": TYPES[path.extname(name)], "cache-control": "public, max-age=31536000, immutable" } });
}
