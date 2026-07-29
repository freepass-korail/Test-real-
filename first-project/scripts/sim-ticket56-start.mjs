/**
 * 티켓 56 안내 시작 GPS 시뮬레이션
 * - n01 근처: 출발 안내가 나와야 함
 * - n11(에스컬레이터) 근처: 출발 잠금으로 중간 문구로 점프하면 안 됨
 *
 *   node scripts/sim-ticket56-start.mjs
 */
import {
  ensureStepDistances,
  gateProgressFromStart,
  getProgressAlongRouteM,
  getRemainingToTargetM,
  resolveStepIndexFromProgress,
  START_ENGAGE_RADIUS_M,
} from '../src/utils/geo.js';

const BASE = process.env.API_BASE || 'http://43.201.30.167:8080';
const TICKET_ID = Number(process.env.TICKET_ID || 56);

function summarize(label, pos, steps, screenTextMap, startEngaged, prevProgressM) {
  const rawProgressM = getProgressAlongRouteM(pos, steps);
  const gated = gateProgressFromStart({
    pos,
    steps,
    rawProgressM,
    prevProgressM,
    startEngaged,
  });
  const { passedIndex, targetIndex, guideIndex } = resolveStepIndexFromProgress(
    gated.progressM,
    steps,
  );
  const guide = steps[guideIndex];
  const text =
    (guide?.nodeId && screenTextMap[guide.nodeId]) || guide?.instruction || '';
  const distanceM = gated.lockedAtStart
    ? gated.distToStartM
    : getRemainingToTargetM(gated.progressM, targetIndex, steps);

  console.log(`\n[${label}] GPS ${pos.lat.toFixed(7)}, ${pos.lng.toFixed(7)}`);
  console.log(
    `  raw s=${rawProgressM.toFixed(1)}m → gated s=${gated.progressM.toFixed(1)}m` +
      ` | locked=${gated.lockedAtStart} engaged=${gated.startEngaged}` +
      ` | distStart=${gated.distToStartM.toFixed(1)}m (engage≤${START_ENGAGE_RADIUS_M}m)`,
  );
  console.log(
    `  pass=${steps[passedIndex]?.nodeId} → target=${steps[targetIndex]?.nodeId}` +
      ` | UI ${Math.round(distanceM)}m | "${text}"`,
  );
  return gated;
}

const guide = await (await fetch(`${BASE}/api/tickets/${TICKET_ID}/guide`)).json();
const stepsRes = await (await fetch(`${BASE}/api/tickets/${TICKET_ID}/guide/steps`)).json();

if (!guide?.route?.length) {
  console.error('route empty — ticket', TICKET_ID, guide);
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
      instruction: d.text || n.name || '',
      cumulativeDistanceM: d.cumulativeDistanceM,
      distanceToNextM: d.distanceToNextM,
    };
  }),
);

const n01 = steps[0];
const n11 = steps.find((s) => s.nodeId === 'n11') || steps[steps.length - 2];

console.log(`=== ticket ${TICKET_ID} start simulation ===`);
console.log(
  `from=${guide.fromNode} → ${guide.platformNode} | nodes=${steps.map((s) => s.nodeId).join('→')}`,
);
console.log(`start text: ${screenTextMap[n01.nodeId] || n01.instruction}`);
console.log(`n11 text: ${screenTextMap[n11?.nodeId] || n11?.instruction}`);

const atEscalator = summarize(
  'A) GPS at n11 (에스컬레이터) — BEFORE fix this jumped to escalator UI',
  { lat: n11.lat, lng: n11.lng },
  steps,
  screenTextMap,
  false,
  0,
);

const atStart = summarize(
  'B) GPS at n01 (출발)',
  { lat: n01.lat, lng: n01.lng },
  steps,
  screenTextMap,
  false,
  0,
);

const afterEngage = summarize(
  'C) still near n01 after engage',
  { lat: n01.lat, lng: n01.lng },
  steps,
  screenTextMap,
  true,
  atStart.progressM,
);

const okLock =
  atEscalator.lockedAtStart === true &&
  Math.round(atEscalator.progressM) === 0 &&
  (screenTextMap[n01.nodeId] || n01.instruction).includes('출발');
const okStart = atStart.startEngaged === true && atStart.lockedAtStart === false;

console.log('\n=== RESULT ===');
console.log(okLock ? 'PASS: n11 GPS keeps start lock (no escalator jump)' : 'FAIL: start lock');
console.log(okStart ? 'PASS: n01 GPS engages and allows progress' : 'FAIL: n01 engage');
console.log(afterEngage.startEngaged ? 'PASS: remains engaged near start' : 'FAIL: engage lost');

if (!okLock || !okStart) process.exit(1);
