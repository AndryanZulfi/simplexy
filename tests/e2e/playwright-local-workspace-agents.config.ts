import { defineConfig } from "@playwright/test";

// Attach only to an explicitly supplied disposable authenticated instance, never the default dev home.
export default defineConfig({
  testDir: ".",
  testMatch: "local-workspace-agents.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  use: { baseURL: process.env.PAPERCLIP_E2E_BASE_URL, trace: "off" },
  outputDir: "./test-results/local-workspace-agents",
  reporter: "list",
});
