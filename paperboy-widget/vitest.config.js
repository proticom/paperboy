import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    testTimeout: 10000,
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      reporter: ["text"],
      include: ["src/**/*.js"],
    },
  },
});
