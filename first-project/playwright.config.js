import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;
const BASE = `http://127.0.0.1:${PORT}`;
/** CI에서는 항상 새 webServer. 로컬은 이미 떠 있는 Vite 재사용 가능 */
const reuseExistingServer = !process.env.CI && process.env.E2E_REUSE_SERVER !== '0';
/** 사람 속도로 보여주기: E2E_DEMO=1 → 클릭 slowMo + 좌표 주입도 느림 */
const isDemo = process.env.E2E_DEMO === '1' || process.env.E2E_DEMO === 'true';
/** Chrome 창으로 보기 (데모/브라우저 테스트) */
const headed =
  process.env.E2E_HEADED === '0'
    ? false
    : isDemo || process.env.E2E_HEADED === '1' || process.env.E2E_HEADED === 'true';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  /** 재현성: 항상 1워커 (CLI --workers 로 덮어쓰지 말 것) */
  workers: 1,
  retries: 0,
  timeout: isDemo || headed ? 900_000 : 180_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: 'e2e/test-results/playwright-report.json' }],
  ],
  use: {
    baseURL: BASE,
    headless: !headed,
    locale: 'ko-KR',
    permissions: ['geolocation'],
    geolocation: { latitude: 37.1279096, longitude: 128.2056971 },
    /** 통과해도 Actions/Console 남김 — retain-on-failure 금지 */
    trace: 'on',
    screenshot: 'on',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    launchOptions: {
      // 클릭·타이핑 사이 딜레이 (ms) — 데모에서 사람이 누르는 것처럼
      slowMo: isDemo ? Number(process.env.E2E_SLOWMO || 450) : 0,
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
    // Vite가 HTML을 주기 시작하는 시점. 루트만 보면 빈 응답 타이밍에 통과할 수 있어 index 성격 URL 사용
    url: `${BASE}/?e2e=1`,
    reuseExistingServer,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
