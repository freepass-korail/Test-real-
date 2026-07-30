import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_RADIUS_M,
  DEST_LOOKAHEAD_M,
  ensureStepDistances,
  getArrowAimPoint,
  getArrowRotation,
  getBearing,
  getDistanceMeters,
  getProgressAlongRouteM,
  getRemainingToTargetM,
  getStepArrivalRadiusM,
  gateProgressFromStart,
  GPS_MAX_ACCURACY_M,
  GPS_SOFT_ACCURACY_M,
  MAX_TURN_DEG_PER_SEC,
  normalizeAngle,
  resolveStepIndexFromProgress,
  shortestAngleDelta,
  shouldArriveByRemain,
  smoothLatLng,
  START_ENGAGE_RADIUS_M,
  stepAngleTowards,
  STEP_ARRIVAL_RADIUS_M,
} from './geo.js';

const BASE_LAT = 37.5;
const METERS_PER_DEG_LAT = 110540;
const METERS_PER_DEG_LNG = 111320 * Math.cos((BASE_LAT * Math.PI) / 180);

/** 기준점(BASE_LAT, 127)에서 동쪽으로 eastM, 북쪽으로 northM 떨어진 좌표 노드 */
function node(id, eastM, northM = 0) {
  return {
    nodeId: id,
    lat: BASE_LAT + northM / METERS_PER_DEG_LAT,
    lng: 127 + eastM / METERS_PER_DEG_LNG,
  };
}

describe('normalizeAngle / shortestAngleDelta', () => {
  it('normalizes into -180..180', () => {
    expect(normalizeAngle(190)).toBeCloseTo(-170, 5);
    expect(normalizeAngle(-190)).toBeCloseTo(170, 5);
    expect(normalizeAngle(360)).toBeCloseTo(0, 5);
  });

  it('takes the short way around the wrap point', () => {
    expect(shortestAngleDelta(170, -170)).toBeCloseTo(20, 5);
    expect(shortestAngleDelta(-170, 170)).toBeCloseTo(-20, 5);
  });
});

describe('getDistanceMeters', () => {
  it('is ~0 for the same point', () => {
    expect(getDistanceMeters(BASE_LAT, 127, BASE_LAT, 127)).toBeCloseTo(0, 3);
  });

  it('matches the equirectangular offset used to build the fixture', () => {
    const a = node('a', 0);
    const b = node('b', 50);
    expect(getDistanceMeters(a.lat, a.lng, b.lat, b.lng)).toBeCloseTo(50, 0);
  });
});

describe('getBearing / getArrowRotation', () => {
  it('points east (~90°) for a due-east target', () => {
    const bearing = getBearing(BASE_LAT, 127, node('e', 50).lat, node('e', 50).lng);
    expect(bearing).toBeCloseTo(90, 0);
  });

  it('arrow rotation is bearing minus device heading', () => {
    expect(getArrowRotation(90, 90)).toBeCloseTo(0, 5);
    expect(getArrowRotation(90, 0)).toBeCloseTo(90, 5);
  });
});

describe('ensureStepDistances', () => {
  it('fills cumulativeDistanceM/distanceToNextM from lat/lng when missing', () => {
    const steps = [node('n01', 0), node('n02', 10), node('n03', 30)];
    ensureStepDistances(steps);
    expect(steps[0].cumulativeDistanceM).toBeCloseTo(0, 0);
    expect(steps[1].cumulativeDistanceM).toBeCloseTo(10, 0);
    expect(steps[2].cumulativeDistanceM).toBeCloseTo(30, 0);
    expect(steps[0].distanceToNextM).toBeCloseTo(10, 0);
  });

  it('keeps BE-provided cumulativeDistanceM as-is (does not recompute)', () => {
    const steps = [
      { ...node('n01', 0), cumulativeDistanceM: 0 },
      { ...node('n02', 10), cumulativeDistanceM: 999 },
    ];
    ensureStepDistances(steps);
    expect(steps[1].cumulativeDistanceM).toBe(999);
  });
});

describe('resolveStepIndexFromProgress', () => {
  const steps = ensureStepDistances([node('n01', 0), node('n02', 10), node('n03', 30), node('n04', 50)]);

  it('starts at the first node when progress is 0', () => {
    const { passedIndex, targetIndex } = resolveStepIndexFromProgress(0, steps);
    expect(passedIndex).toBe(0);
    expect(targetIndex).toBe(1);
  });

  it('resolves to the node in between two waypoints', () => {
    const { passedIndex, targetIndex } = resolveStepIndexFromProgress(15, steps);
    expect(passedIndex).toBe(1);
    expect(targetIndex).toBe(2);
  });

  it('clamps passedIndex/targetIndex to the last node once past the end', () => {
    const { passedIndex, targetIndex } = resolveStepIndexFromProgress(9999, steps);
    expect(passedIndex).toBe(3);
    expect(targetIndex).toBe(3);
  });

  it('returns index 0 for an empty route without throwing', () => {
    expect(resolveStepIndexFromProgress(10, [])).toEqual({
      passedIndex: 0,
      targetIndex: 0,
      guideIndex: 0,
    });
  });
});

describe('getStepArrivalRadiusM', () => {
  it('scales down for closely-spaced nodes (e.g. ~6m apart)', () => {
    const r = getStepArrivalRadiusM(node('a', 0), node('b', 6));
    expect(r).toBeLessThan(STEP_ARRIVAL_RADIUS_M);
    expect(r).toBeGreaterThanOrEqual(2); // 하한
  });

  it('caps at STEP_ARRIVAL_RADIUS_M for widely-spaced nodes', () => {
    const r = getStepArrivalRadiusM(node('a', 0), node('b', 100));
    expect(r).toBe(STEP_ARRIVAL_RADIUS_M);
  });

  it('falls back to the default when a node is missing', () => {
    expect(getStepArrivalRadiusM(null, node('b', 10))).toBe(STEP_ARRIVAL_RADIUS_M);
  });
});

describe('shouldArriveByRemain', () => {
  it('is false when not on the final step', () => {
    expect(
      shouldArriveByRemain({ onFinalStep: false, distanceM: 1, distToLastNode: 1, passedIndex: 0, lastIdx: 3 }),
    ).toBe(false);
  });

  it('arrives once the passed index reaches the last node', () => {
    expect(
      shouldArriveByRemain({ onFinalStep: true, distanceM: 50, passedIndex: 3, lastIdx: 3 }),
    ).toBe(true);
  });

  it('arrives on a long final segment once remain <= ARRIVAL_RADIUS_M', () => {
    expect(
      shouldArriveByRemain({
        onFinalStep: true,
        distanceM: ARRIVAL_RADIUS_M,
        distToLastNode: ARRIVAL_RADIUS_M,
        passedIndex: 2,
        lastIdx: 3,
        lastSegLenM: 300,
      }),
    ).toBe(true);
  });

  it('does NOT arrive early on a short final segment unless snapped near the last node', () => {
    // README 사례: n11→n12 ≈ 19m — 구간 진입만으로 remain<=20이 되는 케이스
    const far = shouldArriveByRemain({
      onFinalStep: true,
      distanceM: 19,
      distToLastNode: 19, // 아직 최종 노드에서 멀리 있음(스냅 반경 밖)
      passedIndex: 2,
      lastIdx: 3,
      lastSegLenM: 19,
    });
    expect(far).toBe(false);

    const near = shouldArriveByRemain({
      onFinalStep: true,
      distanceM: 19,
      distToLastNode: 5, // 최종 노드 스냅 반경(8m) 안
      passedIndex: 2,
      lastIdx: 3,
      lastSegLenM: 19,
    });
    expect(near).toBe(true);
  });
});

describe('stepAngleTowards', () => {
  it('snaps when there is no elapsed time (first sample)', () => {
    expect(stepAngleTowards(0, 170, null)).toBe(0);
    expect(stepAngleTowards(0, 170, 0)).toBe(0);
  });

  it('never rotates faster than MAX_TURN_DEG_PER_SEC, however big the jump', () => {
    // 목표가 180도 반대로 순간적으로 뒤집혀도(자기장 왜곡 등), 100ms 동안은 상한만큼만 돈다
    const dtMs = 100;
    const next = stepAngleTowards(0, 180, dtMs);
    const maxStep = (MAX_TURN_DEG_PER_SEC * dtMs) / 1000;
    expect(Math.abs(shortestAngleDelta(0, next))).toBeLessThanOrEqual(maxStep + 1e-6);
  });

  it('converges to the target over enough elapsed time', () => {
    let angle = 0;
    for (let i = 0; i < 50; i += 1) {
      angle = stepAngleTowards(angle, 90, 100); // 5초 분량
    }
    expect(angle).toBeCloseTo(90, 0);
  });

  it('does not overshoot a small delta', () => {
    const next = stepAngleTowards(0, 5, 100);
    expect(next).toBeGreaterThanOrEqual(0);
    expect(next).toBeLessThanOrEqual(5);
  });
});

describe('getArrowAimPoint (look-ahead)', () => {
  const steps = ensureStepDistances([node('n01', 0), node('n02', 20), node('n03', 40)]);

  it('aims straight at the target when far from it', () => {
    const pos = { lat: node('p', 0).lat, lng: node('p', 0).lng };
    const aim = getArrowAimPoint(pos, steps, 1); // target = n02, 20m away
    expect(aim.lat).toBeCloseTo(steps[1].lat, 9);
    expect(aim.lng).toBeCloseTo(steps[1].lng, 9);
  });

  it('blends toward the next node once inside the look-ahead radius', () => {
    const closeM = DEST_LOOKAHEAD_M / 2; // 반경 절반 지점 = target 코앞
    const pos = { lat: node('p', 20 - closeM).lat, lng: node('p', 20 - closeM).lng };
    const aim = getArrowAimPoint(pos, steps, 1); // target = n02(20m), next = n03(40m)
    // 목표 노드(n02)보다 다음 노드(n03) 쪽으로 치우쳐야 함
    expect(aim.lng).toBeGreaterThan(steps[1].lng);
    expect(aim.lng).toBeLessThan(steps[2].lng);
  });

  it('does not look ahead past the final node', () => {
    const pos = { lat: node('p', 39).lat, lng: node('p', 39).lng };
    const aim = getArrowAimPoint(pos, steps, 2); // target = 마지막 노드
    expect(aim.lat).toBeCloseTo(steps[2].lat, 9);
    expect(aim.lng).toBeCloseTo(steps[2].lng, 9);
  });
});

describe('gateProgressFromStart', () => {
  const steps = ensureStepDistances([
    node('n01', 0),
    node('n02', 20),
    node('n03', 40),
    node('n11', 100),
  ]);

  it('locks until first fix is near the route (not only start node)', () => {
    // 경로에서 멀리 떨어진 점 (north 500m)
    const pos = { lat: node('p', 0, 500).lat, lng: node('p', 0, 500).lng };
    const gated = gateProgressFromStart({
      pos,
      steps,
      rawProgressM: 100,
      prevProgressM: 0,
      startEngaged: false,
    });
    expect(gated.lockedAtStart).toBe(true);
    expect(gated.startEngaged).toBe(false);
    expect(gated.progressM).toBe(0);
  });

  it('localizes entry on first fix near a mid-route node', () => {
    const pos = { lat: steps[2].lat, lng: steps[2].lng }; // n03
    const gated = gateProgressFromStart({
      pos,
      steps,
      rawProgressM: 40,
      prevProgressM: 0,
      startEngaged: false,
    });
    expect(gated.lockedAtStart).toBe(false);
    expect(gated.startEngaged).toBe(true);
    expect(gated.progressM).toBeCloseTo(40, 5);
  });

  it('engages once GPS is within START_ENGAGE_RADIUS_M of start', () => {
    const pos = { lat: node('p', 5).lat, lng: node('p', 5).lng };
    const gated = gateProgressFromStart({
      pos,
      steps,
      rawProgressM: 5,
      prevProgressM: 0,
      startEngaged: false,
    });
    expect(gated.lockedAtStart).toBe(false);
    expect(gated.startEngaged).toBe(true);
    expect(gated.progressM).toBeCloseTo(5, 5);
  });

  it('does not skip n01/n02 in one jump even if raw GPS projects far ahead', () => {
    const pos = { lat: node('p', 5).lat, lng: node('p', 5).lng };
    const gated = gateProgressFromStart({
      pos,
      steps,
      rawProgressM: 100,
      prevProgressM: 0,
      startEngaged: true,
    });
    expect(gated.progressM).toBeLessThanOrEqual(20);
    expect(gated.progressM).toBeLessThanOrEqual(12);
  });

  it('caps a huge forward jump after the early zone', () => {
    const pos = { lat: node('p', 25).lat, lng: node('p', 25).lng };
    const gated = gateProgressFromStart({
      pos,
      steps,
      rawProgressM: 200,
      prevProgressM: 20,
      startEngaged: true,
      maxJumpM: 45,
    });
    expect(gated.progressM).toBe(65);
    expect(gated.lockedAtStart).toBe(false);
  });

  it('ignores small GPS backtracks (hysteresis) so guide does not rewind', () => {
    const pos = { lat: node('p', 30).lat, lng: node('p', 30).lng };
    const gated = gateProgressFromStart({
      pos,
      steps,
      rawProgressM: 25,
      prevProgressM: 33,
      startEngaged: true,
      backtrackHysteresisM: 12,
    });
    expect(gated.progressM).toBe(33);
  });

  it('allows a real backtrack once drop exceeds hysteresis', () => {
    const pos = { lat: node('p', 10).lat, lng: node('p', 10).lng };
    const gated = gateProgressFromStart({
      pos,
      steps,
      rawProgressM: 10,
      prevProgressM: 33,
      startEngaged: true,
      backtrackHysteresisM: 12,
    });
    expect(gated.progressM).toBe(10);
  });
});

describe('getProgressAlongRouteM minSnapCumM', () => {
  const steps = ensureStepDistances([
    node('n01', 0),
    node('n02', 10), // 실제 n01↔n02처럼 촘촘
    node('n03', 40),
    node('n04', 80),
  ]);

  it('does not re-snap to n01 after progress has passed early nodes', () => {
    // GPS는 n01 위인데, 이미 n02 cum(10) 이상 진행한 상태
    const pos = { lat: steps[0].lat, lng: steps[0].lng };
    const withoutFloor = getProgressAlongRouteM(pos, steps);
    expect(withoutFloor).toBeCloseTo(0, 5);

    const withFloor = getProgressAlongRouteM(pos, steps, { minSnapCumM: 10 });
    // n01 스냅/투영으로 0이 되지 않고 earlyEndCum에서 하한
    expect(withFloor).toBeCloseTo(10, 5);
  });

  it('advances along n01→n02 instead of sticking on n01 snap', () => {
    // 구간 중간(5m) — 예전 EARLY 스냅 6~8m면 n01에 붙어서 s=0 고정되던 케이스
    const mid = {
      lat: steps[0].lat + (steps[1].lat - steps[0].lat) * 0.5,
      lng: steps[0].lng + (steps[1].lng - steps[0].lng) * 0.5,
    };
    const s = getProgressAlongRouteM(mid, steps);
    expect(s).toBeGreaterThan(2);
    expect(s).toBeLessThan(Number(steps[1].cumulativeDistanceM));
  });

  it('advances soon after leaving n01 (not stuck for first ~2m)', () => {
    const near = {
      lat: steps[0].lat + (steps[1].lat - steps[0].lat) * 0.2,
      lng: steps[0].lng + (steps[1].lng - steps[0].lng) * 0.2,
    };
    const s = getProgressAlongRouteM(near, steps);
    expect(s).toBeGreaterThan(1);
  });
});

describe('getRemainingToTargetM', () => {
  it('uses distanceToNextM of the from-node, not target cumulativeDistanceM', () => {
    // cum이 어긋나도 남은거리는 distanceToNextM(23.189) 기준
    const steps = [
      {
        ...node('n03', 0),
        cumulativeDistanceM: 37.3,
        distanceToNextM: 23.189,
      },
      {
        ...node('n06', 23.189),
        cumulativeDistanceM: 999, // 잘못/다른 스케일이어도 UI는 distToNext 사용
        distanceToNextM: 0,
      },
    ];
    expect(getRemainingToTargetM(37.3, 1, steps)).toBeCloseTo(23.189, 3);
    expect(getRemainingToTargetM(37.3 + 10, 1, steps)).toBeCloseTo(13.189, 3);
    expect(getRemainingToTargetM(37.3 + 23.189, 1, steps)).toBeCloseTo(0, 5);
  });
});

describe('smoothLatLng', () => {
  it('snaps to next when there is no previous position', () => {
    const next = { lat: 1, lng: 2, accuracy: 5 };
    expect(smoothLatLng(null, next)).toEqual(next);
  });

  it('blends only a fraction of the way toward next (low-accuracy weighting)', () => {
    const prev = { lat: 0, lng: 0 };
    const next = { lat: 1, lng: 0 };
    const blended = smoothLatLng(prev, next, 0.08);
    expect(blended.lat).toBeCloseTo(0.08, 5);
    expect(blended.lat).toBeGreaterThan(prev.lat);
    expect(blended.lat).toBeLessThan(next.lat);
  });

  it('GPS_SOFT_ACCURACY_M is stricter than GPS_MAX_ACCURACY_M (soft/hard cut ordering)', () => {
    expect(GPS_SOFT_ACCURACY_M).toBeLessThan(GPS_MAX_ACCURACY_M);
  });
});
