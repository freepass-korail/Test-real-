/**
 * 티켓 56 시나리오 헤드리스 검증 (Playwright 없이 BE + geo 로직)
 * GPS 좌표를 경로 따라 주입했을 때 문구/진행/이탈이 어떻게 나오는지 확인
 *
 *   node scripts/sim-ticket56-scenarios.mjs
 */
import {
  ensureStepDistances,
  gateProgressFromStart,
  getDistanceMeters,
  getDistanceToRouteMeters,
  getProgressAlongRouteM,
  getRemainingToTargetM,
  OFF_ROUTE_THRESHOLD_M,
  resolveStepIndexFromProgress,
  START_ENGAGE_RADIUS_M,
} from '../src/utils/geo.js';

const BASE = process.env.API_BASE || 'http://43.201.30.167:8080';
const TICKET_ID = Number(process.env.TICKET_ID || 56);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function pointsAlong(a, b, stepM = 4) {
  const dist = getDistanceMeters(a.lat, a.lng, b.lat, b.lng);
  const n = Math.max(1, Math.ceil(dist / stepM));
  const out = [];
  for (let i = 1; i <= n; i += 1) {
    const t = i / n;
    out.push({ lat: lerp(a.lat, b.lat, t), lng: lerp(a.lng, b.lng, t) });
  }
  return out;
}

function offsetByBearing(pos, bearingDeg, distanceM) {
  const R = 6371000;
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (pos.lat * Math.PI) / 180;
  const lng1 = (pos.lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceM / R) +
      Math.cos(lat1) * Math.sin(distanceM / R) * Math.cos(br),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(br) * Math.sin(distanceM / R) * Math.cos(lat1),
      Math.cos(distanceM / R) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

function makeNav(steps, screenTextMap) {
  let startEngaged = false;
  let progressM = 0;
  let offHits = 0;
  let altRoute = false;

  return {
    tick(pos) {
      const rawProgressM = getProgressAlongRouteM(pos, steps);
      const gated = gateProgressFromStart({
        pos,
        steps,
        rawProgressM,
        prevProgressM: progressM,
        startEngaged,
      });
      startEngaged = gated.startEngaged;
      progressM = gated.progressM;
      const { passedIndex, targetIndex, guideIndex } = resolveStepIndexFromProgress(
        progressM,
        steps,
      );
      const guide = steps[guideIndex];
      const instruction = gated.lockedAtStart
        ? screenTextMap[steps[0].nodeId] || steps[0].instruction
        : screenTextMap[guide?.nodeId] || guide?.instruction || '';
      const remainM = gated.lockedAtStart
        ? gated.distToStartM
        : getRemainingToTargetM(progressM, targetIndex, steps);

      if (!gated.lockedAtStart) {
        const routeDist = getDistanceToRouteMeters(pos, steps);
        if (routeDist > OFF_ROUTE_THRESHOLD_M) {
          offHits += 1;
          if (offHits >= 3) altRoute = true;
        } else {
          offHits = 0;
          altRoute = false;
        }
      } else {
        offHits = 0;
        altRoute = false;
      }

      return {
        lockedAtStart: gated.lockedAtStart,
        startEngaged,
        progressM,
        rawProgressM,
        remainM,
        instruction,
        passNode: steps[passedIndex]?.nodeId,
        targetNode: gated.lockedAtStart ? steps[0]?.nodeId : steps[targetIndex]?.nodeId,
        altRoute,
        arrived:
          !gated.lockedAtStart &&
          (passedIndex >= steps.length - 1 ||
            (targetIndex >= steps.length - 1 && remainM <= 20)),
      };
    },
  };
}

function walkPath(nav, pathNodes, label) {
  const snaps = [];
  for (let i = 0; i < pathNodes.length - 1; i += 1) {
    const pts = pointsAlong(pathNodes[i], pathNodes[i + 1], 4);
    for (const p of pts) snaps.push({ ...nav.tick(p), at: pathNodes[i + 1].nodeId, phase: 'forward' });
  }
  const last = nav.tick(pathNodes[pathNodes.length - 1]);
  snaps.push({ ...last, at: pathNodes[pathNodes.length - 1].nodeId, phase: 'forward' });
  console.log(`  [${label}] samples=${snaps.length} final="${snaps.at(-1)?.instruction}" remain=${Math.round(snaps.at(-1)?.remainM)} arrived=${snaps.at(-1)?.arrived}`);
  return snaps;
}

const guide = await (await fetch(`${BASE}/api/tickets/${TICKET_ID}/guide`)).json();
const stepsRes = await (await fetch(`${BASE}/api/tickets/${TICKET_ID}/guide/steps`)).json();
if (!guide?.route?.length) {
  console.error('empty route', guide);
  process.exit(1);
}

const dirMap = Object.fromEntries((guide.directions || []).map((d) => [d.nodeId, d]));
const screenTextMap = {};
for (const s of stepsRes.steps || []) {
  if (s.nodeId && s.screenText) screenTextMap[s.nodeId] = s.screenText;
}

const steps = ensureStepDistances(
  guide.route.map((n, i) => {
    const d = dirMap[n.nodeId] || {};
    return {
      order: i,
      nodeId: n.nodeId,
      name: n.name,
      lat: n.lat,
      lng: n.lng,
      instruction: d.text || screenTextMap[n.nodeId] || n.name || '',
      cumulativeDistanceM: d.cumulativeDistanceM,
      distanceToNextM: d.distanceToNextM,
    };
  }),
);

const byId = Object.fromEntries(steps.map((s) => [s.nodeId, s]));
const results = [];

console.log(`=== ticket ${TICKET_ID} scenario simulation ===`);
console.log(`path: ${steps.map((s) => s.nodeId).join('→')} (~${Math.round(guide.totalDistanceM)}m)`);
console.log(`start: ${screenTextMap[steps[0].nodeId]}`);
console.log(`n11: ${screenTextMap.n11}`);
console.log(`START_ENGAGE_RADIUS_M=${START_ENGAGE_RADIUS_M}`);

// 56_1 n01 출발 완주
{
  const name = '56_1_n01출발_완주';
  const nav = makeNav(steps, screenTextMap);
  const start = nav.tick(byId.n01);
  const startOk =
    String(start.instruction).includes('출발') &&
    Math.abs(start.remainM - 18) <= 8 &&
    !start.lockedAtStart;
  const snaps = walkPath(nav, steps, name);
  const arrived = snaps.some((s) => s.arrived) || snaps.at(-1)?.progressM >= (steps.at(-1).cumulativeDistanceM - 1);
  const passNodes = [...new Set(snaps.map((s) => s.passNode).filter(Boolean))];
  const pass = startOk && arrived;
  results.push({ name, pass, detail: { startOk, startInstr: start.instruction, startRemain: Math.round(start.remainM), arrived, passNodes } });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`, results.at(-1).detail);
}

// 56_2 시작직후 n11 점프 방지
{
  const name = '56_2_시작직후_n11점프방지';
  const nav = makeNav(steps, screenTextMap);
  const atN11 = nav.tick(byId.n11);
  const lockOk =
    atN11.lockedAtStart &&
    String(atN11.instruction).includes('출발') &&
    !String(atN11.instruction).includes('에스컬레이터') &&
    atN11.progressM <= 5;
  const atN01 = nav.tick(byId.n01);
  const unlockOk = atN01.startEngaged && !atN01.lockedAtStart && String(atN01.instruction).includes('출발');
  const snaps = walkPath(nav, steps, name);
  const arrived = snaps.some((s) => s.arrived) || snaps.at(-1)?.progressM >= (steps.at(-1).cumulativeDistanceM - 1);
  const pass = lockOk && unlockOk && arrived;
  results.push({
    name,
    pass,
    detail: {
      lockOk,
      n11Instr: atN11.instruction,
      n11Remain: Math.round(atN11.remainM),
      unlockOk,
      n01Instr: atN01.instruction,
      arrived,
    },
  });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`, results.at(-1).detail);
}

// 56_3 옆으로 이탈 후 복귀
{
  const name = '56_3_옆으로_이탈후_복귀';
  const nav = makeNav(steps, screenTextMap);
  nav.tick(byId.n01);
  const midIdx = Math.floor(steps.length / 2);
  const midPath = steps.slice(0, midIdx + 1);
  walkPath(nav, midPath, `${name}/to-mid`);
  const mid = steps[midIdx];
  // 이탈: 경로에서 확실히 떨어지도록 여러 방향으로 시도
  let offHit = false;
  for (const bearing of [90, 180, 270, 45]) {
    for (let i = 0; i < 4; i += 1) {
      const p = offsetByBearing(mid, bearing, 40);
      const s = nav.tick(p);
      if (s.altRoute) offHit = true;
    }
    if (offHit) break;
  }
  // return
  for (let i = 0; i < 3; i += 1) nav.tick(mid);
  const rest = steps.slice(midIdx);
  const snaps = walkPath(nav, rest, `${name}/finish`);
  const recovered = snaps.slice(-3).every((s) => !s.altRoute);
  const arrived = snaps.some((s) => s.arrived) || snaps.at(-1)?.progressM >= (steps.at(-1).cumulativeDistanceM - 1);
  const pass = offHit && recovered && arrived;
  results.push({ name, pass, detail: { offHit, recovered, arrived } });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`, results.at(-1).detail);
}

// 56_4 반대방향 후퇴 후 재전진
{
  const name = '56_4_반대방향_후퇴후_재전진';
  const nav = makeNav(steps, screenTextMap);
  nav.tick(byId.n01);
  const cut = Math.min(Math.max(3, Math.floor(steps.length * 0.65)), steps.length - 1);
  const backIdx = Math.max(0, cut - 2);
  walkPath(nav, steps.slice(0, cut + 1), `${name}/out`);
  const beforeBack = nav.tick(steps[cut]);
  // backtrack
  let increased = false;
  const backPath = [...steps.slice(backIdx, cut + 1)].reverse();
  for (let i = 0; i < backPath.length - 1; i += 1) {
    for (const p of pointsAlong(backPath[i], backPath[i + 1], 4)) {
      const s = nav.tick(p);
      if (s.remainM > beforeBack.remainM + 0.5) increased = true;
    }
  }
  const snaps = walkPath(nav, steps.slice(backIdx), `${name}/again`);
  const arrived = snaps.some((s) => s.arrived) || snaps.at(-1)?.progressM >= (steps.at(-1).cumulativeDistanceM - 1);
  const pass = increased && arrived;
  results.push({ name, pass, detail: { increased, arrived } });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`, results.at(-1).detail);
}

const allPass = results.every((r) => r.pass);
console.log('\n=== SUMMARY ===');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}`);
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED');
process.exit(allPass ? 0 : 1);
