import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "json", "json-summary", "html"],
      reportOnFailure: true,
    },
  },
  pack: {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    outDir: "dist",
    platform: "neutral",
    dts: true,
    unbundle: true,
  },
});
