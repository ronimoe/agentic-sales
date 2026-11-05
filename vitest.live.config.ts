import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { include: ["src/**/*.live.test.ts"], testTimeout: 300000 },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
