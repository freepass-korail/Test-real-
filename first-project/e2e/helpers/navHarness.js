import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { buildCoordinateTimeline } from './pathPlayer.js';
import { evaluateTrace } from './metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.join(__dirname, '..', 'test-results');

const scenariosDoc = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../fixtures/scenarios.json'), 'utf8'),
);

export { scenariosDoc };

export function getScenario(name) {
  const s = scenariosDoc.scenarios.find((x) => x.name === name);
  if (!s) throw new Error(`scenario not found: ${name}`);
  return structuredClone(s);
}

export function getPace() {
  const demo = process.env.E2E_DEMO === '1';
  if (demo) {
    // 데모용 — 실보행보다 빠르게 (timeScale 1.7)
    return {
      demo: true,
      timeScale: Number(process.env.E2E_TIME_SCALE || 1.7),
      tickMs: Number(process.env.E2E_TICK_MS || 200),
      stepPauseMs: Number(process.env.E2E_STEP_PAUSE_MS || 700),
    };
  }
  return {
    demo: false,
    timeScale: Number(process.env.E2E_TIME_SCALE || 12),
    tickMs: Number(process.env.E2E_TICK_MS || 35),
    stepPauseMs: Number(process.env.E2E_STEP_PAUSE_MS || 120),
  };
}

async function humanPause(page, ms) {
  if (ms > 0) await page.waitForTimeout(ms);
}

export async function e2eLog(page, msg) {
  console.log(msg);
  await page.evaluate((m) => console.log(m), msg).catch(() => {});
}

/**
 * GPS 좌표만 시나리오로 주입.
 * guide / guide/steps 는 page.route 없이 실제 BE(Vite 프록시) 응답 사용.
 */
export async function installMocks(page, { lat, lng } = {}) {
  const logs = [];
  page.on('console', (msg) => {
    const text = msg.text();
    logs.push({ type: msg.type(), text, t: Date.now() });
    if (text.includes('[E2E]') || text.includes('[NAV]') || text.includes('[TTS]')) {
      console.log(`[browser] ${text}`);
    }
  });

  await page.addInitScript(
    ({ lat0, lng0 }) => {
      let cur = {
        lat: lat0 ?? 37.1279096,
        lng: lng0 ?? 128.2056971,
        accuracy: 5,
        ts: Date.now(),
      };
      const watchers = new Map();
      let wid = 1;

      const makePos = () => ({
        coords: {
          latitude: cur.lat,
          longitude: cur.lng,
          accuracy: cur.accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: cur.ts,
      });

      window.__setMockGeo = (la, ln, accuracy = 5) => {
        cur = { lat: la, lng: ln, accuracy, ts: Date.now() };
        const pos = makePos();
        watchers.forEach((cb) => {
          try {
            cb(pos);
          } catch {
            /* ignore */
          }
        });
      };

      window.__e2eTtsPlayCount = 0;
      window.__e2eLastAudioSrc = null;

      navigator.geolocation.getCurrentPosition = (success) => {
        success(makePos());
      };
      navigator.geolocation.watchPosition = (success) => {
        const id = wid++;
        watchers.set(id, success);
        success(makePos());
        return id;
      };
      navigator.geolocation.clearWatch = (id) => watchers.delete(id);

      // 실제 Audio.play 호출 (BE TTS). 카운트만 계측 — stub 하지 않음.
      const Proto = window.HTMLMediaElement?.prototype;
      if (Proto && !Proto.__e2ePlayPatched) {
        const originalPlay = Proto.play;
        Proto.play = function playPatched(...args) {
          window.__e2eTtsPlayCount = (window.__e2eTtsPlayCount || 0) + 1;
          window.__e2eLastAudioSrc = this?.src || null;
          console.log(
            `[E2E][TTS] play #${window.__e2eTtsPlayCount} src=${String(this?.src || '').slice(0, 64)}`,
          );
          return originalPlay.apply(this, args).catch((err) => {
            console.warn('[E2E][TTS] play rejected:', err?.message || err);
            return undefined;
          });
        };
        Proto.__e2ePlayPatched = true;
      }
    },
    { lat0: lat, lng0: lng },
  );

  console.log(
    '[E2E] page.route 미사용 — 실제 BE /api/tickets/{ticketId}/guide(+steps). GPS만 시나리오 좌표.',
  );

  return { logs };
}

/** Zustand에 로드된 실제 안내 → pathPlayer용 guide 형태 */
export async function getLiveGuide(page) {
  return page.evaluate(() => {
    const s = window.__FLOW_STORE__?.getState?.();
    if (!s) return null;
    const route = s.routeSteps || [];
    return {
      stationName: null,
      totalDistanceM: s.totalDistanceM,
      route,
      directions: route.map((r) => ({
        nodeId: r.nodeId,
        text: r.directionText || r.instruction || '',
        cumulativeDistanceM: r.cumulativeDistanceM,
        distanceToNextM: r.distanceToNextM,
        audioBase64: s.audioMap?.[r.nodeId] || null,
      })),
    };
  });
}

/**
 * 시나리오 pathMode를 실제 BE nodeId 배열에 바인딩.
 * (API 응답을 가짜로 만드는 게 아니라, 걷는 좌표 시퀀스만 재구성)
 */
export function bindScenarioToLiveRoute(scenario, nodeIds) {
  const n = [...(nodeIds || [])];
  if (!n.length) {
    throw new Error('live route nodeIds empty — BE에 당일 승차권이 있는지 확인');
  }

  const mode = scenario.pathMode || (scenario.path?.length ? 'explicit' : 'full');

  if (mode === 'explicit') {
    return { ...scenario, path: scenario.path };
  }

  if (mode === 'full') {
    return {
      ...scenario,
      path: n,
      continueAfter: undefined,
      backtrackTo: undefined,
    };
  }

  if (mode === 'deviate') {
    const cut = Math.min(Math.max(2, Math.floor(n.length / 2)), n.length - 1);
    return {
      ...scenario,
      path: n.slice(0, cut),
      continueAfter: n.slice(cut),
      backtrackTo: undefined,
    };
  }

  if (mode === 'backtrack') {
    const cut = Math.min(Math.max(3, Math.floor(n.length * 0.65)), n.length - 1);
    const backIdx = Math.max(0, cut - 2);
    return {
      ...scenario,
      path: n.slice(0, cut),
      backtrackTo: n[backIdx],
      continueAfter: n.slice(backIdx + 1),
    };
  }

  if (mode === 'pause') {
    const cut = Math.min(Math.max(2, Math.floor(n.length * 0.55)), n.length - 1);
    return {
      ...scenario,
      path: n.slice(0, cut),
      continueAfter: n.slice(cut),
      backtrackTo: undefined,
    };
  }

  return { ...scenario, path: n };
}

export async function goToS5(page) {
  const { stepPauseMs } = getPace();
  const ticketId = String(process.env.E2E_TICKET_ID || '19');

  await test.step('goto + 로드 검증', async () => {
    const res = await page.goto(`/?ticketId=${ticketId}&e2e=1`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    expect(res, 'goto 응답 없음').toBeTruthy();
    expect(
      res.ok() || res.status() === 304,
      `goto HTTP ${res?.status?.()}`,
    ).toBeTruthy();

    await expect(page).toHaveURL(new RegExp(`[?&]ticketId=${ticketId}\\b`));
    await expect(page.locator('#root')).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('#root')).not.toBeEmpty();

    try {
      await page.waitForLoadState('networkidle', { timeout: 15_000 });
    } catch (err) {
      console.warn(
        '[E2E] networkidle 대기 타임아웃 — S1 버튼 가시성으로 로드 판정 계속:',
        err?.message || err,
      );
    }

    await page.evaluate(() => sessionStorage.removeItem('korail_guide_session'));

    const startBtn = page.getByRole('button', { name: '시작하기' });
    await expect(startBtn).toBeVisible({ timeout: 20_000 });
    await expect(startBtn).toBeEnabled();
    await humanPause(page, stepPauseMs);
  });

  await test.step('S1→S5 클릭 플로우', async () => {
    await page.getByRole('button', { name: '시작하기' }).click();
    await humanPause(page, stepPauseMs);
    const allowBtn = page.getByRole('button', { name: '위치 허용' });
    await expect(allowBtn).toBeVisible({ timeout: 15_000 });

    const { demo } = getPace();
    if (demo) {
      // 영상용: 앱 허용 모달 → OS 위치 알림까지 사람처럼
      await e2eLog(page, '[E2E DEMO] S2 앱 「위치 허용」 — 화면 유지 후 클릭');
      await humanPause(page, Math.max(stepPauseMs * 2, 1800));
      await allowBtn.hover();
      await humanPause(page, 400);
      await allowBtn.click({ delay: 120 });
    } else {
      await allowBtn.click();
    }

    // Playwright는 사전 grant라 OS 팝업이 안 뜸 → 앱이 시뮬레이션한 시스템 알림 클릭
    const systemAllow = page.getByTestId('system-geo-allow');
    await expect(systemAllow).toBeVisible({ timeout: 10_000 });
    if (demo) {
      await e2eLog(page, '[E2E DEMO] OS 위치 허용 알림 — 화면 유지 후 「허용」');
      await humanPause(page, Math.max(stepPauseMs * 2, 1600));
      await systemAllow.hover();
      await humanPause(page, 350);
      await systemAllow.click({ delay: 120 });
      await humanPause(page, Math.max(stepPauseMs, 900));
    } else {
      await systemAllow.click();
      await humanPause(page, stepPauseMs);
    }

    await expect(page.getByRole('button', { name: '네' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: '네' }).click();
    await humanPause(page, stepPauseMs);

    const navStart = page.getByRole('button', { name: /길찾기 시작/ });
    await expect(navStart).toBeVisible({ timeout: 15_000 });
    await navStart.click();
    await humanPause(page, stepPauseMs);

    await expect
      .poll(() => page.evaluate(() => window.__FLOW_STORE__?.getState?.().step), {
        timeout: 15_000,
        message:
          'S5 미진입 — ticketId guide 실패(E3)일 수 있음. ?ticketId= 와 BE 승차권 확인',
      })
      .toBe('S5');

    // 자동재생 잠금 해제
    await page.locator('body').click({ position: { x: 200, y: 400 } });
    await humanPause(page, Math.round(stepPauseMs * 0.6));

    await expect
      .poll(
        () =>
          page.evaluate(() => (window.__FLOW_STORE__?.getState?.().routeSteps?.length || 0) > 0),
        {
          timeout: 25_000,
          message: 'routeSteps 미로드 — 실제 BE 안내 확인',
        },
      )
      .toBeTruthy();

    await expect
      .poll(
        () =>
          page.evaluate(
            () => Object.keys(window.__FLOW_STORE__?.getState?.().audioMap || {}).length,
          ),
        {
          timeout: 25_000,
          message: 'audioMap 미로드 — BE guide/steps audioBase64 확인',
        },
      )
      .toBeGreaterThan(0);
  });

  await e2eLog(page, '[E2E] S5 진입 (실제 BE 안내 + TTS, GPS만 시나리오)');
}

export async function playScenario(page, scenario, guide, pace = getPace()) {
  const { timeScale, tickMs, demo } = pace;
  const { samples, totalDistanceM } = buildCoordinateTimeline(scenario, guide, {
    stepM: demo ? 2 : 5,
  });
  const trace = [];
  const announcedNodes = [];
  let lastAnnounced = -1;

  const audioCount = await page.evaluate(
    () => Object.keys(window.__FLOW_STORE__?.getState?.().audioMap || {}).length,
  );

  await e2eLog(
    page,
    `[E2E] ▶ ${scenario.name} | nodes=${scenario.path?.join('→')} | samples=${samples.length} | TTS클립=${audioCount} | timeScale=${timeScale}${demo ? ' (DEMO)' : ''} | LIVE BE`,
  );

  for (const sample of samples) {
    const waitMs =
      sample.phase === 'pause'
        ? Math.max(40, Math.round((sample.dtSec * 1000) / Math.max(1, timeScale / 4)))
        : Math.max(tickMs, Math.round(((sample.dtSec || 0.2) * 1000) / timeScale));

    await page.evaluate(
      ({ lat, lng }) => {
        window.__setMockGeo?.(lat, lng, 5);
      },
      { lat: sample.lat, lng: sample.lng },
    );

    await page.waitForTimeout(waitMs);

    const snap = await page.evaluate(() => {
      const s = window.__FLOW_STORE__?.getState?.();
      if (!s) return null;
      return {
        step: s.step,
        remainM: s.distanceM,
        progressM: s.progressM,
        arrowDeg: s.destinationAngle,
        altRoute: s.altRoute,
        targetIndex: s.currentStepIndex,
        announcedPassIndex: s.announcedPassIndex,
        passNode: s.routeSteps?.[s.announcedPassIndex]?.nodeId ?? null,
        targetNode: s.routeSteps?.[s.currentStepIndex]?.nodeId ?? null,
        ttsPlays: window.__e2eTtsPlayCount || 0,
      };
    });

    if (!snap) continue;

    if (snap.announcedPassIndex != null && snap.announcedPassIndex !== lastAnnounced) {
      // 전진(index 증가)만 새 안내로 기록. 후퇴(index 감소)는 되감기일 뿐 —
      // 이후 같은 인덱스를 다시 전진해서 지나가면 재안내로 다시 기록돼야 함.
      if (snap.announcedPassIndex > lastAnnounced) {
        for (let i = lastAnnounced + 1; i <= snap.announcedPassIndex; i += 1) {
          const nodeId = await page.evaluate(
            (idx) => window.__FLOW_STORE__.getState().routeSteps?.[idx]?.nodeId,
            i,
          );
          if (nodeId) announcedNodes.push(nodeId);
        }
      }
      lastAnnounced = snap.announcedPassIndex;
      await e2eLog(
        page,
        `[E2E] 음성안내 pass#${lastAnnounced} node=${announcedNodes.at(-1)} remain≈${Number(snap.remainM).toFixed(1)}m ttsPlays=${snap.ttsPlays}`,
      );
    }

    trace.push({
      ...sample,
      ...snap,
      atEnd: snap.step === 'S5_1',
      t: Date.now(),
    });

    if (snap.step === 'S5_1') break;
  }

  // 마지막 노드 한 번 더 고정
  const end = guide.route?.[guide.route.length - 1];
  if (end) {
    await page.evaluate(
      ({ lat, lng }) => window.__setMockGeo?.(lat, lng, 5),
      { lat: end.lat, lng: end.lng },
    );
    await page.waitForTimeout(demo ? 800 : 400);
    const finalSnap = await page.evaluate(() => {
      const s = window.__FLOW_STORE__?.getState?.();
      return s
        ? {
            step: s.step,
            remainM: s.distanceM,
            progressM: s.progressM,
            arrowDeg: s.destinationAngle,
            altRoute: s.altRoute,
            targetIndex: s.currentStepIndex,
            announcedPassIndex: s.announcedPassIndex,
            ttsPlays: window.__e2eTtsPlayCount || 0,
          }
        : null;
    });
    if (finalSnap) {
      trace.push({
        lat: end.lat,
        lng: end.lng,
        phase: 'forward',
        expectedS: totalDistanceM,
        expectedRemain: 0,
        atNode: end.nodeId,
        ...finalSnap,
        atEnd: finalSnap.step === 'S5_1',
      });
    }
  }

  const ttsPlayCount = await page.evaluate(() => window.__e2eTtsPlayCount || 0);

  await e2eLog(
    page,
    `[E2E] ■ ${scenario.name} done | announced=${announcedNodes.length} | ttsPlays=${ttsPlayCount} | finalStep=${trace.at(-1)?.step}`,
  );

  return { samples, trace, announcedNodes, totalDistanceM, ttsPlayCount, guide };
}

export function writeScenarioReport({
  scenario,
  result,
  trace,
  announcedNodes,
  logs,
  ttsPlayCount,
}) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const out = {
    name: scenario.name,
    desc: scenario.desc,
    expect: scenario.expect,
    passed: result.passed,
    summary: { ...result.summary, ttsPlayCount: ttsPlayCount ?? result.summary?.ttsPlayCount },
    checks: result.checks,
    announcedNodes,
    consoleNav: (logs || [])
      .filter((l) => /\[NAV\]|\[TTS\]|\[E2E\]/.test(l.text || l))
      .slice(-80),
    traceTail: trace.slice(-12),
    generatedAt: new Date().toISOString(),
    mode: 'live-be',
  };
  const file = path.join(REPORT_DIR, `${scenario.name}.report.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');

  console.log('\n========== E2E REPORT:', scenario.name, '==========');
  console.log(JSON.stringify({ passed: out.passed, summary: out.summary, checks: out.checks }, null, 2));
  console.log('saved:', file);
  console.log('================================================\n');
  return out;
}

export function runExpectations(scenario, trace, announcedNodes, ttsPlayCount = 0) {
  return evaluateTrace(trace, scenario, scenariosDoc._공통검증, announcedNodes, ttsPlayCount);
}
