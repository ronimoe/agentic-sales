import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ASSET_DIR } from "./render";

/** Re-encodes uploads to JPEG under a random name, so a file can't choose its own path or type. */
export async function saveUploadedImage(file: File, maxBytes: number) {
  if (file.size > maxBytes) throw new Error(`Foto lebih dari ${Math.round(maxBytes / 1e6)} MB`);
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  const name = `up-${crypto.randomUUID()}.jpg`;
  try {
    await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toFile(path.join(ASSET_DIR, name));
  } catch { throw new Error("File ini bukan gambar yang bisa dibaca"); }
  return name;
}
