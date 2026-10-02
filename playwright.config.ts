import { defineConfig, devices } from "@playwright/test";

// Use the real GPU where available: under SwiftShader (software GL) the sky renders at ~7 fps
// and Playwright's stability waits make every action slow. CI without a GPU falls back to it.
const gl = process.platform === "darwin" ? ["--use-angle=metal"] : ["--use-gl=angle", "--use-angle=swiftshader"];

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { args: ["--autoplay-policy=user-gesture-required", ...gl] } } }],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
