import { defineConfig, devices } from "@playwright/test";

/**
 * اختبارات E2E تعمل على خادم وواجهة معزولين حتى لا تمسّ بيانات التطوير:
 *   API → 127.0.0.1:8021 (قاعدة data/e2e.db وتخزين storage-e2e)
 *   WEB → localhost:5174
 *
 * التشغيل:  npm run test:e2e
 */
const API_TARGET = "http://127.0.0.1:8021";
const WEB_URL = "http://localhost:5174";

/** للسماح باستخدام متصفح مثبّت مسبقاً: E2E_BROWSER_CHANNEL=chrome|msedge */
const CHANNEL = process.env.E2E_BROWSER_CHANNEL as "chrome" | "msedge" | undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: WEB_URL,
    locale: "ar",
    viewport: { width: 1360, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1360, height: 900 },
        ...(CHANNEL ? { channel: CHANNEL } : {}),
      },
    },
  ],
  webServer: [
    {
      command:
        ".venv\\Scripts\\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8021",
      cwd: "../api",
      url: `${API_TARGET}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        EDU_DATABASE_URL: "sqlite:///data/e2e.db",
        EDU_STORAGE_DIR: "storage-e2e",
        EDU_SECRET_KEY: "e2e-only-secret-key-do-not-use-in-production",
        EDU_WEB_ORIGIN: WEB_URL,
        PYTHONIOENCODING: "utf-8",
      },
    },
    {
      command: "npm run dev -- --port 5174 --strictPort",
      url: WEB_URL,
      reuseExistingServer: true,
      timeout: 120_000,
      env: { VITE_API_TARGET: API_TARGET },
    },
  ],
});
