import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "pnpm next start -p 3100",
    url: "http://localhost:3100/kit",
    reuseExistingServer: true,
    env: {
      WOWYOY_SECRET: "e2e-only-secret",
      WOWYOY_ALLOW_PRIVATE_HOSTS: "1",
      WOWYOY_INSECURE_COOKIES: "1",
      ANTHROPIC_API_KEY: "",
    },
    timeout: 60_000,
  },
  projects: [
    { name: "light", use: { ...devices["Desktop Chrome"], colorScheme: "light" } },
    { name: "dark", use: { ...devices["Desktop Chrome"], colorScheme: "dark" } },
    { name: "mobile", use: { ...devices["Pixel 7"], colorScheme: "light" } },
  ],
})
