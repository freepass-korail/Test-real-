import { test, expect } from '@playwright/test';
import {
  getScenario,
  getPace,
  installMocks,
  goToS5,
  getLiveGuide,
  bindScenarioToLiveRoute,
  playScenario,
  runExpectations,
  writeScenarioReport,
  e2eLog,
} from './helpers/navHarness.js';

const SCENARIO_NAMES = [
  '1_해피케이스',
  '2a_옆으로_이탈후_복귀',
  '2b_반대방향_후퇴후_재전진',
  '3_중간정지',
];

for (const name of SCENARIO_NAMES) {
  test(name, async ({ page }, testInfo) => {
    const pace = getPace();
    test.setTimeout(pace.demo ? 900_000 : 180_000);
    const rawScenario = getScenario(name);
    const { logs } = await installMocks(page);

    if (pace.demo) {
      await e2eLog(
        page,
        `[E2E] DEMO 모드 — timeScale=${pace.timeScale}, tick=${pace.tickMs}ms, stepPause=${pace.stepPauseMs}ms | LIVE BE TTS`,
      );
    }

    await goToS5(page);
    await expect(page).not.toHaveURL('about:blank');

    const liveGuide = await getLiveGuide(page);
    expect(liveGuide?.route?.length, 'live guide route empty').toBeGreaterThan(0);

    const first = liveGuide.route[0];
    await page.evaluate(
      ({ lat, lng }) => window.__setMockGeo?.(lat, lng, 5),
      { lat: first.lat, lng: first.lng },
    );

    const nodeIds = liveGuide.route.map((r) => r.nodeId);
    const scenario = bindScenarioToLiveRoute(rawScenario, nodeIds);

    await e2eLog(page, `[E2E] ===== START ${name} =====`);
    await e2eLog(page, `[E2E] ${scenario.desc}`);
    await e2eLog(page, `[E2E] live path=${nodeIds.join('→')} | scenario path=${scenario.path?.join('→')}`);

    const { trace, announcedNodes, ttsPlayCount } = await playScenario(
      page,
      scenario,
      liveGuide,
      pace,
    );

    const result = runExpectations(scenario, trace, announcedNodes, ttsPlayCount);
    const report = writeScenarioReport({
      scenario,
      result,
      trace,
      announcedNodes,
      logs,
      ttsPlayCount,
    });

    for (const c of result.checks) {
      await e2eLog(
        page,
        `[E2E] check ${c.name}: ${c.pass ? 'PASS' : 'FAIL'} actual=${JSON.stringify(c.actual)} limit=${JSON.stringify(c.limit)}`,
      );
    }

    await testInfo.attach(`${name}.report.json`, {
      body: Buffer.from(JSON.stringify(report, null, 2), 'utf8'),
      contentType: 'application/json',
    });

    expect(
      report.passed,
      `${name} checks failed: ${JSON.stringify(result.checks.filter((c) => !c.pass))}`,
    ).toBe(true);
  });
}
