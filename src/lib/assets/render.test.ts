import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { fileChecks } from "@/lib/ads/checks";
import { ASSET_DIR, REELS_SAFE, reelsSvg, renderCreative, type RenderInput } from "./render";

const base: RenderInput = { id: "test-render", goal: "cold_sell", hook: "Pulang kerja, wajah nggak kusam lagi", line2: "Membantu kulit tampak lebih cerah setiap malam", cta: "Beli sekarang", productName: "Serum Niacinamide Glow", priceIdr: 99000, brandName: "Rumah Laris", brand: undefined, visual: { shape: "bottle", color: "#E85D9A" }, photoPath: "test-photo.jpg", showPrice: true, aiLabel: false, format: "image" };

describe("renderCreative", () => {
  it("renders Meta-sized feed images and Reels video with a real photo", async () => {
    fs.mkdirSync(ASSET_DIR, { recursive: true });
    await sharp({ create: { width: 900, height: 900, channels: 3, background: "#d8c7a8" } }).jpeg().toFile(path.join(ASSET_DIR, "test-photo.jpg"));
    const img = await renderCreative(base);
    const vid = await renderCreative({ ...base, id: "test-render-v", format: "video" });
    expect((await fileChecks(path.join(ASSET_DIR, img.assetPath), "image", 30))[0].status).toBe("pass");
    expect((await fileChecks(path.join(ASSET_DIR, vid.assetPath), "video", 15))[0]).toMatchObject({ status: "pass" });
    if (process.env.PREVIEW_DIR) for (const [f, o] of [[img.assetPath, "feed.jpg"], [vid.posterPath, "s0.jpg"], ["test-render-v-s2.jpg", "s2.jpg"]]) await sharp(path.join(ASSET_DIR, f)).resize(380).toFile(path.join(process.env.PREVIEW_DIR, o));
    for (const f of fs.readdirSync(ASSET_DIR)) if (f.startsWith("test-")) fs.unlinkSync(path.join(ASSET_DIR, f));
  }, 120000);

  it("keeps Reels text inside the safe zone", () => {
    for (const scene of [0, 1, 2] as const) {
      const ys = [...reelsSvg({ ...base, photoPath: null, format: "video" }, scene).matchAll(/<text x="[1-9][\d.]*" y="([\d.]+)"/g)].map((m) => Number(m[1]));
      for (const y of ys) { expect(y).toBeGreaterThan(REELS_SAFE.top); expect(y).toBeLessThanOrEqual(REELS_SAFE.bottom); }
    }
  });
});
