import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import type { GoalKey } from "@/db/schema";
import { idr } from "@/lib/format";

const run = promisify(execFile);
export const ASSET_DIR = path.join(process.cwd(), ".data/assets");

type Theme = { bg: string; fg: string; tag: string; tagFg: string };
const THEMES: Record<GoalKey, Theme> = {
  eyeball: { bg: "#1B2483", fg: "#FFFFFF", tag: "#F5B90F", tagFg: "#14163A" },
  cold_sell: { bg: "#F5B90F", fg: "#14163A", tag: "#D3203A", tagFg: "#FFFFFF" },
  form: { bg: "#0B7A55", fg: "#FFFFFF", tag: "#F5B90F", tagFg: "#14163A" },
  whatsapp_chat: { bg: "#FFFFFF", fg: "#14163A", tag: "#0B7A55", tagFg: "#FFFFFF" },
  retargeting: { bg: "#D3203A", fg: "#FFFFFF", tag: "#FFFFFF", tagFg: "#D3203A" },
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const readable = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150 ? "#14163A" : "#FFFFFF"; };

export type Brand = { logoPath: string | null; primary: string; accent: string } | undefined;
function themeFor(goal: GoalKey, b: Brand): Theme {
  const base = THEMES[goal];
  if (!b) return base;
  if (goal === "eyeball" || goal === "form") return { bg: b.primary, fg: readable(b.primary), tag: b.accent, tagFg: readable(b.accent) };
  if (goal === "cold_sell") return { bg: b.accent, fg: readable(b.accent), tag: b.primary, tagFg: readable(b.primary) };
  return { ...base, tag: b.primary, tagFg: readable(b.primary) };
}

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

const dataUri = (file: string | null) => {
  if (!file) return null;
  const f = path.join(ASSET_DIR, file);
  return fs.existsSync(f) ? `data:image/jpeg;base64,${fs.readFileSync(f).toString("base64")}` : null;
};

/** A real photo goes in a frame. There's no background removal yet, so no fake cutouts. */
function productLayer(i: RenderInput, cx: number, cy: number, box: number, id: string) {
  const photo = dataUri(i.photoPath);
  if (!photo) return shapeSvg(i.visual.shape, i.visual.color, i.visual.shape === "shoe" ? cx + 140 : cx, cy);
  const x = cx - box / 2, y = cy - box / 2;
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${box}" height="${box}" rx="36"/></clipPath><rect x="${x - 10}" y="${y - 10}" width="${box + 20}" height="${box + 20}" rx="44" fill="#ffffff"/><image href="${photo}" x="${x}" y="${y}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;
}

export type RenderInput = {
  id: string; goal: GoalKey; hook: string; line2: string; cta: string; productName: string; priceIdr: number; brandName: string; brand: Brand;
  visual: { shape: string; color: string }; photoPath: string | null; format: "image" | "video"; showPrice: boolean; aiLabel: boolean;
};

const text = (s: string, x: number, y: number, size: number, fill: string, weight = 900, anchor = "start", op = 1) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${op}" font-family="Arial Black, Helvetica Neue, Arial, sans-serif">${esc(s)}</text>`;

const logoLayer = (i: RenderInput, x: number, y: number) => { const l = dataUri(i.brand?.logoPath ?? null); return l ? `<image href="${l}" x="${x}" y="${y}" width="120" height="120" preserveAspectRatio="xMidYMid meet"/>` : ""; };
const priceTag = (i: RenderInput, t: Theme, x: number, y: number) => `<g transform="translate(${x} ${y}) rotate(-7)"><rect x="-235" y="-82" width="470" height="164" rx="22" fill="${t.tag}"/>${text(idr(i.priceIdr).replace(/\s/g, " "), 0, 24, 66, t.tagFg, 900, "middle")}</g>`;

/** Feed image, 4:5. Hook, price, and brand are stamped by code, so AI can never garble them. */
export function feedSvg(i: RenderInput) {
  const W = 1080, H = 1350; const t = themeFor(i.goal, i.brand);
  const hook = wrap(i.hook, 19, 4).map((l, n) => text(l, 72, 172 + n * 104, 92, t.fg)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${t.bg}"/>
  <circle cx="${W - 120}" cy="${H - 400}" r="430" fill="${t.tag}" opacity=".16"/>${hook}
  ${productLayer(i, 400, 860, 560, "p")}${i.showPrice ? priceTag(i, t, W - 280, H - 310) : ""}
  ${text(i.productName, 72, H - 96, 40, t.fg, 700)}${text(i.brandName, 72, H - 50, 28, t.fg, 400, "start", 0.8)}
  ${logoLayer(i, W - 192, 60)}${i.aiLabel ? text("Dibuat dengan AI", W - 72, H - 52, 26, t.fg, 400, "end") : ""}</svg>`;
}

/** Reels frame, 9:16. Text stays inside Meta's safe zone: top 14%, bottom 35%, and sides 6% stay clear. */
export const REELS_SAFE = { top: 269, bottom: 1248, side: 65 };
export function reelsSvg(i: RenderInput, scene: 0 | 1 | 2) {
  const W = 1080, H = 1920; const t = themeFor(i.goal, i.brand); const s = REELS_SAFE;
  const head = (str: string, size: number, chars: number, lines: number) => wrap(str, chars, lines).map((l, n) => text(l, s.side + 15, s.top + size + n * (size * 1.13), size, t.fg)).join("");
  const label = i.aiLabel ? text("Dibuat dengan AI", W - s.side - 15, s.top - 24, 26, t.fg, 400, "end") : "";
  const body = scene === 0
    ? head(i.hook, 92, 19, 4) + productLayer(i, W / 2, 1000, 400, "p")
    : scene === 1
      ? head(i.line2, 76, 23, 4) + productLayer(i, W / 2, 980, 440, "p")
      : head(i.showPrice ? i.productName : i.brandName, 70, 25, 2) + productLayer(i, W / 2, 800, 360, "p")
        + (i.showPrice ? priceTag(i, t, W / 2, 1110) : "") + text(i.cta, W / 2, 1245, 40, t.fg, 700, "middle");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${t.bg}"/><circle cx="${W - 100}" cy="1000" r="460" fill="${t.tag}" opacity=".16"/>${body}${logoLayer(i, W - s.side - 135, s.top - 150)}${label}</svg>`;
}

export const SCENE_SECONDS = 3;

export async function renderCreative(i: RenderInput): Promise<{ posterPath: string; assetPath: string; frames: string[]; seconds: number }> {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  const posterPath = `${i.id}.jpg`;
  const posterFile = path.join(ASSET_DIR, posterPath);
  if (i.format !== "video") {
    await sharp(Buffer.from(feedSvg(i)), { density: 128 }).resize(1440, 1800).jpeg({ quality: 88 }).toFile(posterFile);
    return { posterPath, assetPath: posterPath, frames: [posterFile], seconds: 0 };
  }
  const frames: string[] = [];
  for (const scene of [0, 1, 2] as const) {
    const f = scene === 0 ? posterFile : path.join(ASSET_DIR, `${i.id}-s${scene}.jpg`);
    await sharp(Buffer.from(reelsSvg(i, scene))).jpeg({ quality: 90 }).toFile(f);
    frames.push(f);
  }
  const assetPath = `${i.id}.mp4`;
  const frameCount = SCENE_SECONDS * 30;
  const filters = frames.map((_, n) => `[${n}:v]scale=1350:2400,zoompan=z='min(zoom+0.0009,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frameCount}:s=1080x1920:fps=30,format=yuv420p[v${n}]`).join(";");
  await run("ffmpeg", ["-y", "-loglevel", "error", ...frames.flatMap((f) => ["-i", f]), "-filter_complex", `${filters};${frames.map((_, n) => `[v${n}]`).join("")}concat=n=${frames.length}:v=1:a=0[out]`, "-map", "[out]", "-c:v", "libx264", "-preset", "veryfast", "-movflags", "+faststart", path.join(ASSET_DIR, assetPath)], { timeout: 180000 });
  return { posterPath, assetPath, frames, seconds: SCENE_SECONDS * frames.length };
}
