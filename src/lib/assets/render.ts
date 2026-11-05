import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import type { GoalKey } from "@/db/schema";
import { idr } from "@/lib/format";

const run = promisify(execFile);
export const ASSET_DIR = path.join(process.cwd(), ".data/assets");

const THEMES: Record<GoalKey, { bg: string; fg: string; tag: string; tagFg: string }> = {
  eyeball: { bg: "#1B2483", fg: "#FFFFFF", tag: "#F5B90F", tagFg: "#14163A" },
  cold_sell: { bg: "#F5B90F", fg: "#14163A", tag: "#D3203A", tagFg: "#FFFFFF" },
  form: { bg: "#0B7A55", fg: "#FFFFFF", tag: "#F5B90F", tagFg: "#14163A" },
  whatsapp_chat: { bg: "#FFFFFF", fg: "#14163A", tag: "#0B7A55", tagFg: "#FFFFFF" },
  retargeting: { bg: "#D3203A", fg: "#FFFFFF", tag: "#FFFFFF", tagFg: "#D3203A" },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);

export function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const lines: string[] = []; let cur = "";
  for (const w of text.split(/\s+/)) {
    if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { const kept = lines.slice(0, maxLines); kept[maxLines - 1] = kept[maxLines - 1].replace(/[.,]?$/, "…"); return kept; }
  return lines;
}

function shapeSvg(shape: string, color: string, cx: number, cy: number) {
  const g = (inner: string) => `<g transform="translate(${cx} ${cy})">${inner}</g>`;
  if (shape === "bottle") return g(`<rect x="-34" y="-250" width="68" height="70" rx="10" fill="#14163A"/><rect x="-22" y="-185" width="44" height="40" fill="#fff"/><rect x="-105" y="-150" width="210" height="400" rx="34" fill="${color}" stroke="#14163A" stroke-width="7"/><rect x="-78" y="-60" width="156" height="170" rx="10" fill="#fff"/><rect x="-55" y="-30" width="110" height="16" fill="#14163A"/><rect x="-55" y="0" width="80" height="11" fill="#14163A" opacity=".45"/><rect x="-55" y="24" width="96" height="11" fill="#14163A" opacity=".45"/>`);
  if (shape === "blender") return g(`<path d="M-105 -230 H105 L78 90 H-78 Z" fill="#ffffff" fill-opacity=".85" stroke="#14163A" stroke-width="7"/><rect x="-115" y="-262" width="230" height="38" rx="12" fill="#14163A"/><path d="M-83 -60 H83 L72 88 H-72 Z" fill="${color}"/><rect x="-92" y="90" width="184" height="150" rx="24" fill="#14163A"/><circle cy="165" r="36" fill="${color}" stroke="#fff" stroke-width="6"/>`);
  if (shape === "shoe") return g(`<path d="M-230 40 C-235 -50 -200 -110 -160 -120 C-130 -80 -80 -70 -50 -90 C10 -30 110 0 190 15 C240 25 245 70 240 105 H-230 Z" fill="${color}" stroke="#14163A" stroke-width="7"/><rect x="-240" y="100" width="490" height="50" rx="25" fill="#fff" stroke="#14163A" stroke-width="7"/><path d="M-30 -60 L10 -90 M10 -32 L50 -62 M50 -12 L90 -42" stroke="#fff" stroke-width="10" stroke-linecap="round"/>`);
  return g(`<rect x="-160" y="-170" width="320" height="360" rx="20" fill="${color}" stroke="#14163A" stroke-width="7"/><rect x="-100" y="-60" width="200" height="130" fill="#fff"/>`);
}

export type RenderInput = {
  id: string; goal: GoalKey; hook: string; productName: string; priceIdr: number; brand: string;
  visual: { shape: string; color: string }; format: "image" | "video"; showPrice: boolean; aiLabel: boolean;
};

/** Template layer: hook, price, and brand are stamped by code, so AI can never garble them. */
export function creativeSvg(i: RenderInput) {
  const W = 1080, H = 1350; const t = THEMES[i.goal];
  const lines = wrap(i.hook, 19, 4);
  const hookSvg = lines.map((l, n) => `<text x="72" y="${172 + n * 104}" font-size="92" font-weight="900" fill="${t.fg}" font-family="Arial Black, Helvetica Neue, Arial, sans-serif">${esc(l)}</text>`).join("");
  const price = i.showPrice ? `<g transform="translate(${W - 280} ${H - 310}) rotate(-7)"><rect x="-235" y="-82" width="470" height="164" rx="22" fill="${t.tag}"/><text text-anchor="middle" y="24" font-size="66" font-weight="900" fill="${t.tagFg}" font-family="Arial Black, Arial, sans-serif">${esc(idr(i.priceIdr).replace(/\s/g, " "))}</text></g>` : "";
  const label = i.aiLabel ? `<text x="${W - 72}" y="${H - 52}" text-anchor="end" font-size="26" fill="${t.fg}" font-family="Arial, sans-serif">Dibuat dengan AI</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${t.bg}"/>
  <circle cx="${W - 120}" cy="${H - 400}" r="430" fill="${t.tag}" opacity=".16"/>${hookSvg}
  ${shapeSvg(i.visual.shape, i.visual.color, i.visual.shape === "shoe" ? 500 : 360, 900)}${price}
  <text x="72" y="${H - 96}" font-size="40" font-weight="700" fill="${t.fg}" font-family="Arial, sans-serif">${esc(i.productName)}</text>
  <text x="72" y="${H - 50}" font-size="28" fill="${t.fg}" opacity=".8" font-family="Arial, sans-serif">${esc(i.brand)}</text>${label}</svg>`;
}

export async function renderCreative(i: RenderInput): Promise<{ posterPath: string; assetPath: string }> {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  const posterPath = `${i.id}.jpg`;
  const posterFile = path.join(ASSET_DIR, posterPath);
  await sharp(Buffer.from(creativeSvg(i))).jpeg({ quality: 88 }).toFile(posterFile);
  if (i.format !== "video") return { posterPath, assetPath: posterPath };
  const assetPath = `${i.id}.mp4`;
  try {
    await run("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", posterFile, "-vf",
      "scale=1440:1800,zoompan=z='min(zoom+0.0012,1.18)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=180:s=864x1080:fps=30,format=yuv420p",
      "-frames:v", "180", "-c:v", "libx264", "-preset", "veryfast", "-movflags", "+faststart", path.join(ASSET_DIR, assetPath)], { timeout: 120000 });
    return { posterPath, assetPath };
  } catch (e) {
    console.error("Video render failed, keeping the image", e);
    return { posterPath, assetPath: posterPath };
  }
}
