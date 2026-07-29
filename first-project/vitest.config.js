import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // e2e/ 아래는 Playwright 전용 스펙 — vitest는 순수 유닛 테스트(src/**)만 수집
    include: ['src/**/*.test.js'],
    environment: 'node',
  },
});
