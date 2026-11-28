import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // Preserve mock call history for tests that intentionally retain setup calls.
    clearMocks: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "json", "json-summary", "html"],
      reportOnFailure: true,
    },
  },
});
