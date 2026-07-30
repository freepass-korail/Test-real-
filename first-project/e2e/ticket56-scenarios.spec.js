/**
 * 오늘 기준 ticketId=56 실BE 안내 시나리오
 * GPS만 주입, guide/steps·TTS는 실제 BE
 *
 *   $env:E2E_TICKET_ID='56'; npx playwright test e2e/ticket56-scenarios.spec.js --workers=1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import {
  getPace,
  installMocks,
  goToS5,
  getLiveGuide,
  bindScenarioToLiveRoute,
  playScenario,
  runExpectations,
  writeScenarioReport,
  e2eLog,
  scenariosDoc as defaultScenariosDoc,
} from './helpers/navHarness.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ticket56Doc = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/scenarios-ticket56.json'), 'utf8'),
);

process.env.E2E_TICKET_ID = process.env.E2E_TICKET_ID || '56';

function getTicket56Scenario(name) {
  const s = ticket56Doc.scenarios.find((x) => x.name === name);
  if (!s) throw new Error(`ticket56 scenario not found: ${name}`);
  return structuredClone(s);
}

async function readNavSnap(page) {
  return page.evaluate(() => {
    const s = window.__FLOW_STORE__?.getState?.();
    if (!s) return null;
    return {
      step: s.step,
      remainM: s.distanceM,
      progressM: s.progressM,
      instruction: s.currentInstruction || '',
      altRoute: s.altRoute,
      overshoot: s.overshoot,
      targetIndex: s.currentStepIndex,
      announcedPassIndex: s.announcedPassIndex,
      passNode: s.routeSteps?.[s.announcedPassIndex]?.nodeId ?? null,
      targetNode: s.routeSteps?.[s.currentStepIndex]?.nodeId ?? null,
      startNode: s.routeSteps?.[0]?.nodeId ?? null,
    };
  });
}

async function setGpsAtNode(page, route, nodeId) {
  const node = route.find((r) => r.nodeId === nodeId);
  expect(node, `route missing node ${nodeId}`).toBeTruthy();
  await page.evaluate(
    ({ lat, lng }) => window.__setMockGeo?.(lat, lng, 5),
    { lat: node.lat, lng: node.lng },
  );
  await page.waitForTimeout(600);
  return node;
}

async function runStartLockPreflight(page, scenario, liveGuide) {
  const pre = scenario.preflight;
  if (!pre) return { startLockHolds: true };

  await e2eLog(page, `[E2E] preflight GPS → ${pre.gpsAtNode}`);
  await setGpsAtNode(page, liveGuide.route, pre.gpsAtNode);
  // 출발 잠금 반영 대기 (몇 틱)
  await page.waitForTimeout(900);
  const snap = await readNavSnap(page);
  await e2eLog(
    page,
    `[E2E] preflight snap remain=${snap?.remainM} progress=${snap?.progressM}` +
      ` instr="${snap?.instruction}" alt=${snap?.altRoute} overshoot=${snap?.overshoot}`,
  );

  const instruction = String(snap?.instruction || '');
  const checks = [];

  if (pre.expectInstructionContains) {
    const pass = instruction.includes(pre.expectInstructionContains);
    checks.push({
      name: 'startLockInstruction',
      pass,
      actual: instruction,
      limit: `contains:${pre.expectInstructionContains}`,
    });
    expect(pass, `expected instruction to contain "${pre.expectInstructionContains}", got "${instruction}"`).toBe(true);
  }
  if (pre.expectInstructionNotContains) {
    const pass = !instruction.includes(pre.expectInstructionNotContains);
    checks.push({
      name: 'startLockNoEscalatorJump',
      pass,
      actual: instruction,
      limit: `notContains:${pre.expectInstructionNotContains}`,
    });
    expect(
      pass,
      `instruction must NOT contain "${pre.expectInstructionNotContains}", got "${instruction}"`,
    ).toBe(true);
  }
  if (pre.expectProgressNearM != null) {
    const pass = Number(snap?.progressM ?? 999) <= 5;
    checks.push({
      name: 'startLockProgress',
      pass,
      actual: snap?.progressM,
      limit: pre.expectProgressNearM,
    });
    expect(pass, `progress should stay near 0 while locked, got ${snap?.progressM}`).toBe(true);
  }

  if (pre.thenGpsAtNode) {
    await e2eLog(page, `[E2E] preflight jump GPS → ${pre.thenGpsAtNode}`);
    await setGpsAtNode(page, liveGuide.route, pre.thenGpsAtNode);
    await page.waitForTimeout(900);
    const after = await readNavSnap(page);
    await e2eLog(
      page,
      `[E2E] after jump remain=${after?.remainM} progress=${after?.progressM} instr="${after?.instruction}"`,
    );

    const afterInstr = String(after?.instruction || '');
    if (pre.thenExpectInstructionNotContains) {
      const pass = !afterInstr.includes(pre.thenExpectInstructionNotContains);
      checks.push({
        name: 'earlyJumpNoEscalator',
        pass,
        actual: afterInstr,
        limit: `notContains:${pre.thenExpectInstructionNotContains}`,
      });
      expect(
        pass,
        `after jump instruction must NOT contain "${pre.thenExpectInstructionNotContains}", got "${afterInstr}"`,
      ).toBe(true);
    }
    if (pre.thenExpectInstructionContains) {
      const pass = afterInstr.includes(pre.thenExpectInstructionContains);
      checks.push({
        name: 'earlyJumpInstruction',
        pass,
        actual: afterInstr,
        limit: `contains:${pre.thenExpectInstructionContains}`,
      });
      expect(pass, `after jump expected "${pre.thenExpectInstructionContains}", got "${afterInstr}"`).toBe(true);
    }
    if (pre.thenExpectProgressMaxM != null) {
      const pass = Number(after?.progressM ?? 999) <= Number(pre.thenExpectProgressMaxM) + 1;
      checks.push({
        name: 'earlyJumpProgressCap',
        pass,
        actual: after?.progressM,
        limit: pre.thenExpectProgressMaxM,
      });
      expect(
        pass,
        `progress should stay ≤${pre.thenExpectProgressMaxM}m after early jump, got ${after?.progressM}`,
      ).toBe(true);
    }
  }

  return {
    startLockHolds: checks.every((c) => c.pass),
    checks,
  };
}

async function assertStartUi(page, scenario) {
  const expectCfg = scenario.expect || {};
  if (!expectCfg.startInstructionContains && expectCfg.startDistanceAroundM == null) {
    return [];
  }
  const snap = await readNavSnap(page);
  const checks = [];
  if (expectCfg.startInstructionContains) {
    const pass = String(snap?.instruction || '').includes(expectCfg.startInstructionContains);
    checks.push({
      name: 'startInstructionContains',
      pass,
      actual: snap?.instruction,
      limit: expectCfg.startInstructionContains,
    });
    expect(pass).toBe(true);
  }
  if (expectCfg.startDistanceAroundM != null) {
    const d = Number(snap?.remainM);
    const pass = Number.isFinite(d) && Math.abs(d - expectCfg.startDistanceAroundM) <= 8;
    checks.push({
      name: 'startDistanceAroundM',
      pass,
      actual: d,
      limit: expectCfg.startDistanceAroundM,
    });
    expect(pass, `start distance expected ~${expectCfg.startDistanceAroundM}m, got ${d}`).toBe(true);
  }
  return checks;
}

const SCENARIO_NAMES = ticket56Doc.scenarios.map((s) => s.name);

for (const name of SCENARIO_NAMES) {
  test(name, async ({ page }, testInfo) => {
    const pace = getPace();
    test.setTimeout(pace.demo ? 900_000 : 240_000);
    const rawScenario = getTicket56Scenario(name);

    // 시작 잠금 시나리오: 처음부터 출발점 밖에서 GPS를 잡아 engage가 먼저 풀리지 않게 함
    const initialGeo = rawScenario.preflight
      ? { lat: 37.1205, lng: 128.2015 } // 제천역에서 충분히 먼 좌표
      : { lat: 37.1280816, lng: 128.2056662 }; // n02(갈림길) — BE steps 출발 기준
    const { logs } = await installMocks(page, initialGeo);

    await goToS5(page);

    const liveGuide = await getLiveGuide(page);
    expect(liveGuide?.route?.length, 'ticket56 live route empty').toBeGreaterThan(0);
    await e2eLog(
      page,
      `[E2E] ticket56 live path=${liveGuide.route.map((r) => r.nodeId).join('→')} total≈${liveGuide.totalDistanceM}`,
    );

    // 기본은 n01에서 시작. preflight가 있으면 그쪽이 먼저 GPS를 잡음.
    if (!rawScenario.preflight) {
      const first = liveGuide.route[0];
      await page.evaluate(
        ({ lat, lng }) => window.__setMockGeo?.(lat, lng, 5),
        { lat: first.lat, lng: first.lng },
      );
      await page.waitForTimeout(700);
    } else {
      // goToS5 동안 먼 좌표로 이미 start-lock 상태여야 함
      await page.waitForTimeout(700);
      const lockedSnap = await readNavSnap(page);
      await e2eLog(
        page,
        `[E2E] pre-S5 lock check progress=${lockedSnap?.progressM} instr="${lockedSnap?.instruction}"`,
      );
    }

    const extraChecks = [];
    if (rawScenario.preflight) {
      const lockResult = await runStartLockPreflight(page, rawScenario, liveGuide);
      extraChecks.push(...(lockResult.checks || []));
    } else {
      extraChecks.push(...(await assertStartUi(page, rawScenario)));
    }

    const nodeIds = liveGuide.route.map((r) => r.nodeId);
    const scenario = bindScenarioToLiveRoute(rawScenario, nodeIds);

    await e2eLog(page, `[E2E] ===== START ${name} =====`);
    await e2eLog(page, `[E2E] ${scenario.desc}`);

    const { trace, announcedNodes, ttsPlayCount } = await playScenario(
      page,
      scenario,
      liveGuide,
      pace,
    );

    // runExpectations는 기본 scenariosDoc 공통검증을 씀
    const result = runExpectations(scenario, trace, announcedNodes, ttsPlayCount);
    if (rawScenario.expect?.startLockHolds) {
      result.checks.push({
        name: 'startLockHolds',
        pass: extraChecks.every((c) => c.pass),
        actual: extraChecks,
        limit: true,
      });
      result.passed = result.passed && extraChecks.every((c) => c.pass);
    } else if (extraChecks.length) {
      result.checks.push(...extraChecks);
      result.passed = result.passed && extraChecks.every((c) => c.pass);
    }

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
      `${name} failed: ${JSON.stringify(result.checks.filter((c) => !c.pass))}`,
    ).toBe(true);
  });
}

// silence unused import warning if bundler cares
void defaultScenariosDoc;
