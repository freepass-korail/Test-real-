const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

/** Haversine — 두 GPS 좌표 간 거리(m) */
export function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 목적지 방위각(0°=북, 시계방향) */
export function getBearing(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeAngle(toDeg(Math.atan2(y, x)));
}

/** 각도를 -180~180 범위로 정규화 */
export function normalizeAngle(deg) {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/** 최단 각도 차이 (-180~180) */
export function shortestAngleDelta(from, to) {
  return normalizeAngle(to - from);
}

/** 화살표 회전각 = 목적지 방위각 - 기기 heading (-180~180) */
export function getArrowRotation(bearing, heading) {
  return normalizeAngle(bearing - heading);
}

/**
 * 나침반/화살표용 각도 EMA
 * @param {number | null | undefined} prev
 * @param {number} next
 * @param {number} [alpha]
 */
export function smoothAngle(prev, next, alpha = 0.2) {
  if (prev == null || Number.isNaN(prev)) return next;
  const delta = shortestAngleDelta(prev, next);
  return normalizeAngle(prev + delta * alpha);
}

/** 나침반 데드밴드(°) — 1단 필터 전 초미세 노이즈만 (0이면 전부 통과) */
export const HEADING_DEADBAND_DEG = 0.75;

/** @deprecated 표시 추종은 useFollowAngle(시간 기반) 단일 계층 — 레거시 상수 */
export const ARROW_FOLLOW = 0.45;

/**
 * 화살표 추종 반감기(ms) — useFollowAngle 단일 필터.
 * 작을수록 네이버지도처럼 즉시 반응.
 */
export const ARROW_HALF_LIFE_MS = 90;

/** @deprecated stepAngleTowards 제거됨 — 테스트 호환용으로만 유지 */
export const MAX_TURN_DEG_PER_SEC = 540;

/**
 * @deprecated 화살표는 useFollowAngle만 사용. 호출부에서 제거됨.
 */
export function stepAngleTowards(
  prev,
  target,
  dtMs,
  { halfLifeMs = ARROW_HALF_LIFE_MS, maxDegPerSec = MAX_TURN_DEG_PER_SEC } = {},
) {
  if (dtMs == null || dtMs <= 0) return prev;
  const delta = shortestAngleDelta(prev, target);
  const decay = 1 - 2 ** (-dtMs / halfLifeMs);
  let step = delta * decay;
  const maxStep = maxDegPerSec * (dtMs / 1000);
  if (Math.abs(step) > maxStep) {
    step = Math.sign(step) * maxStep;
  }
  return normalizeAngle(prev + step);
}

/**
 * 목표 노드에 이 거리(m) 안으로 들어오면, 화살표가 가리키는 지점을 다음 노드 쪽으로
 * 서서히 옮겨 계산한다 (turn-by-turn 내비게이션의 "회전 예고"와 동일한 방식).
 * 노드가 촘촘할 때(예: n06↔n07≈6m) 통과 직후 목표가 바뀌며 방위각이 급변하는 걸 막는다.
 */
export const DEST_LOOKAHEAD_M = 4;

/**
 * 화살표가 실제로 겨냥할 지점. 목표 노드에 근접할수록 다음 노드 방향으로 선형 보간한다.
 * (도착/이탈 판정용 거리 계산에는 쓰지 않음 — 오직 화살표 방향 계산 전용)
 * @param {{ lat: number, lng: number }} pos
 * @param {Array<{ lat: number, lng: number }>} steps
 * @param {number} targetIndex
 * @returns {{ lat: number, lng: number } | null}
 */
export function getArrowAimPoint(pos, steps = [], targetIndex = 0) {
  const lastIdx = steps.length - 1;
  const dest = steps[targetIndex];
  if (!dest?.lat || !dest?.lng) return dest ?? null;
  if (targetIndex >= lastIdx) return dest; // 마지막 노드는 그대로 겨냥

  const next = steps[targetIndex + 1];
  if (!next?.lat || !next?.lng) return dest;

  const distToTarget = getDistanceMeters(pos.lat, pos.lng, dest.lat, dest.lng);
  if (distToTarget >= DEST_LOOKAHEAD_M) return dest;

  const blend = 1 - distToTarget / DEST_LOOKAHEAD_M; // 0(반경 밖)~1(노드 위)
  return {
    lat: dest.lat + (next.lat - dest.lat) * blend,
    lng: dest.lng + (next.lng - dest.lng) * blend,
  };
}

/** 나침반 링 위 목적지 점 좌표 (0°=위, 시계방향) */
export function getCompassDotPosition(cx, cy, radius, angleDeg, dotWidth, dotHeight) {
  const rad = (angleDeg * Math.PI) / 180;
  const x = cx + radius * Math.sin(rad);
  const y = cy - radius * Math.cos(rad);
  return {
    left: x - dotWidth / 2,
    top: y - dotHeight / 2,
  };
}

export const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 10000,
};

/**
 * accuracy 컷 (노드 간격 6~22m + 실내 보고값 고려)
 * - soft 초과 ~ hard 이하: 수락하되 EMA 가중 낮춤
 * - hard 초과: 샘플 무시
 */
export const GPS_SOFT_ACCURACY_M = 25;
export const GPS_MAX_ACCURACY_M = 50;

/** soft~hard accuracy 구간에서 쓰는 낮은 EMA 가중 */
export const GPS_POS_SMOOTH_ALPHA_LOW_ACC = 0.08;

/** 보행 이상치: 샘플 간 이 속도(m/s) 초과면 무시 (≈빠르게 뛰는 수준) */
export const GPS_MAX_SPEED_MPS = 3;

/** 한 샘플 점프 절대 상한(m) — dt가 짧아도 이 이상은 튐으로 봄 */
export const GPS_SOFT_SPIKE_M = 10;

/** 명백한 이상치 */
export const GPS_HARD_SPIKE_M = 150;

/** 테스트용 원격 점프 허용 하한 */
export const GPS_TELEPORT_M = 10000;

/**
 * accuracy/점프 이상치여도 샘플을 버리지 않고 이 비중으로만 반영.
 * (버리기만 하면 1Hz GPS가 와도 예전 좌표에 고정되어 튐처럼 보임)
 */
export const GPS_POS_SMOOTH_ALPHA_REJECT = 0.05;

/** 위치 EMA 계수 (작을수록 더 부드러움) */
export const GPS_POS_SMOOTH_ALPHA = 0.2;

/** 화면 남은거리 EMA */
export const GPS_DISTANCE_SMOOTH_ALPHA = 0.2;

/** 화면 남은거리가 한 번에 변할 수 있는 최대치(m) */
export const GPS_DISTANCE_MAX_STEP_M = 8;

/**
 * 이 거리(m) 미만으로만 움직이면 "제자리"로 보고 남은거리 숫자를 갱신하지 않음.
 * 실내 GPS 미세 흔들림·손 움직임에 숫자가 튀는 걸 막기 위함.
 * ※ 최종 목적지 근처(ARRIVAL_APPROACH_M)에서는 적용하지 않음.
 */
export const GPS_MOVE_DEADBAND_M = 5;

/** 나침반 EMA 반영 비율 (새 각도 가중치) — 클수록 실시간 반응 */
export const HEADING_SMOOTH_ALPHA = 0.5;

/** 정지 판정: 가속도 크기(m/s²)가 이하면 정지 후보 */
export const STATIONARY_ACCEL_M_S2 = 0.85;

/** 정지 확정에 필요한 연속 모션 샘플 수 */
export const STATIONARY_HIT_COUNT = 4;

/** 최종 노드까지 이 거리 이하면 deadband 해제·거리를 적극 갱신 */
export const ARRIVAL_APPROACH_M = 40;

/** 최종 도착 반경(m) — 마지막 구간 UI 남은거리(BE remain)가 이 값 이하면 S5_1 후보 */
export const ARRIVAL_RADIUS_M = 20;

/** 경로 중간 waypoint 기본 도착 반경(m). 실제로는 인접 노드 간격에 맞게 줄어듦 */
export const STEP_ARRIVAL_RADIUS_M = 8;

/**
 * 마지막 구간 도착 여부.
 * - 긴 마지막 구간(>20m): remain ≤ 20m 이면 도착
 * - 짧은 마지막 구간(≤20m, 예: n11→n12≈19m): 구간 진입만으로 remain≤20이 되어
 *   직전 노드(n11) 안내가 스킵되므로, 최종 노드 스냅 반경 안·통과·remain≈0 일 때만 도착
 */
export function shouldArriveByRemain({
  onFinalStep,
  distanceM,
  distToLastNode = Infinity,
  passedIndex = 0,
  lastIdx = 0,
  lastSegLenM = Infinity,
}) {
  if (!onFinalStep) return false;
  if (passedIndex >= lastIdx || distanceM <= 0.5) return true;
  if (!(distanceM <= ARRIVAL_RADIUS_M)) return false;
  if (lastSegLenM > ARRIVAL_RADIUS_M) return true;
  // 짧은 마지막 구간: 최종 노드 스냅 반경 안에서만 (진입 직후 조기 도착 방지)
  // → progress 스냅으로 최종 노드 통과 안내 후 remain≈0 도착과 맞춤
  return distToLastNode <= ROUTE_FINAL_NODE_SNAP_M;
}

/**
 * 촘촘한 노드(n06↔n07≈6m)에서도 스킵되지 않게,
 * 현재→다음 구간 길이의 일부로 도착 반경을 줄인다.
 */
export function getStepArrivalRadiusM(fromStep, toStep) {
  if (!fromStep || !toStep) return STEP_ARRIVAL_RADIUS_M;
  const spacing = getDistanceMeters(fromStep.lat, fromStep.lng, toStep.lat, toStep.lng);
  if (!(spacing > 0)) return STEP_ARRIVAL_RADIUS_M;
  // 구간 길이의 35%, 최소 2m ~ 기본 STEP_ARRIVAL 이하
  return Math.min(STEP_ARRIVAL_RADIUS_M, Math.max(2, spacing * 0.35));
}

/**
 * GPS 좌표 EMA 스무딩 — 제자리 흔들림·손 움직임으로 인한 숫자 튀김 완화
 * @param {{ lat: number, lng: number, accuracy?: number, timestamp?: number } | null} prev
 * @param {{ lat: number, lng: number, accuracy?: number, timestamp?: number }} next
 */
export function smoothLatLng(prev, next, alpha = GPS_POS_SMOOTH_ALPHA) {
  if (!prev) return { ...next };
  return {
    ...next,
    lat: prev.lat + (next.lat - prev.lat) * alpha,
    lng: prev.lng + (next.lng - prev.lng) * alpha,
  };
}

/**
 * 남은 거리 표시용 EMA + 1회 변화량 제한
 * @param {number | null | undefined} prev
 * @param {number} next
 */
export function smoothDistanceM(
  prev,
  next,
  {
    alpha = GPS_DISTANCE_SMOOTH_ALPHA,
    maxStepM = GPS_DISTANCE_MAX_STEP_M,
  } = {},
) {
  if (next == null || Number.isNaN(next)) return prev ?? null;
  if (prev == null || Number.isNaN(prev)) return next;

  const blended = prev + (next - prev) * alpha;
  const delta = blended - prev;
  if (Math.abs(delta) > maxStepM) {
    return prev + Math.sign(delta) * maxStepM;
  }
  return blended;
}

/** S5 UI용 거리 표시 — 역 안내는 m, 먼 경우 km */
export function formatGuideDistance(distanceM) {
  if (distanceM == null || Number.isNaN(distanceM)) {
    return { value: '…', unit: 'm', fontSize: 48, isReady: false };
  }

  const safe = Math.max(0, distanceM);

  if (safe >= 1000) {
    const km = safe / 1000;
    const value = km >= 100 ? String(Math.round(km)) : km.toFixed(1).replace(/\.0$/, '');
    return { value, unit: 'km', fontSize: value.length > 3 ? 36 : 42, isReady: true };
  }

  const meters = Math.round(safe);
  const value = String(meters);
  let fontSize = 48;
  if (value.length >= 3) fontSize = 40;
  if (value.length >= 4) fontSize = 32;

  return { value, unit: 'm', fontSize, isReady: true };
}

/** API instruction + GPS 대기 fallback */
export function getNavigationInstruction(distanceM, instruction) {
  if (distanceM == null) return '현재 위치를 확인하고 있어요.';
  return instruction || '안내 방향으로\n이동해 주세요.';
}

/** 마지막 노드를 지나쳤다고 볼 최소 거리(m) */
export const OVERSHOOT_THRESHOLD_M = 15;

/**
 * 안내 시작: 첫 GPS fix로 경로 위 진입점을 찾는다.
 * 경로(폴리라인)에 이 거리(m) 이내면 그 투영점을 진입 progress로 채택.
 */
export const LOCALIZE_MAX_ROUTE_DIST_M = 35;

/**
 * 출발 노드 근접 반경 — localize 보조 (경로에서 멀지만 출발 근처일 때)
 * @deprecated LOCALIZE_MAX_ROUTE_DIST_M 우선. 하위 호환·테스트용.
 */
export const START_ENGAGE_RADIUS_M = 30;

/** 출발 잠금 해제 후(초반 구간 이후), 한 GPS 샘플에서 허용하는 최대 진행 점프(m) */
export const MAX_PROGRESS_JUMP_M = 45;

/**
 * 초반 노드(n01·n02) 구간에서는 점프를 더 작게 — 한 틱에 두 노드를 건너뛰지 않게.
 * (실내 GPS가 n03 쪽으로 튀면 18+19 < 45 로 n01·n02가 스킵되던 문제)
 */
export const EARLY_PROGRESS_JUMP_M = 12;

/** 순서 통과를 강제할 초반 노드 개수 (index 0..count-1) */
export const EARLY_NODE_COUNT = 2;

/**
 * GPS 출렁임으로 progress가 살짝 줄어도 안내가 되감기지 않게.
 * 이 거리(m) 이상 뒤로 밀릴 때만 progress 감소를 허용.
 */
export const PROGRESS_BACKTRACK_HYSTERESIS_M = 12;

/**
 * 첫 fix localization + 전방 점프 제한 + 초반 노드 스킵 방지 + 뒤로가기 히스테리시스.
 * @returns {{
 *   progressM: number,
 *   startEngaged: boolean,
 *   lockedAtStart: boolean,
 *   distToStartM: number,
 *   distToRouteM: number,
 * }}
 */
export function gateProgressFromStart({
  pos,
  steps = [],
  rawProgressM = 0,
  prevProgressM = 0,
  startEngaged = false,
  localizeMaxRouteDistM = LOCALIZE_MAX_ROUTE_DIST_M,
  startEngageRadiusM = START_ENGAGE_RADIUS_M,
  maxJumpM = MAX_PROGRESS_JUMP_M,
  earlyJumpM = EARLY_PROGRESS_JUMP_M,
  earlyNodeCount = EARLY_NODE_COUNT,
  backtrackHysteresisM = PROGRESS_BACKTRACK_HYSTERESIS_M,
}) {
  const start = steps[0];
  if (!pos || !start?.lat || !start?.lng) {
    return {
      progressM: Math.max(0, Number(rawProgressM) || 0),
      startEngaged: true,
      lockedAtStart: false,
      distToStartM: Infinity,
      distToRouteM: Infinity,
    };
  }

  const distToStartM = getDistanceMeters(pos.lat, pos.lng, start.lat, start.lng);
  const distToRouteM = getDistanceToRouteMeters(pos, steps);

  // 미진입: 경로 위(또는 출발 근처)면 첫 fix로 진입 노드/구간 확정
  if (!startEngaged) {
    const onRoute = distToRouteM <= localizeMaxRouteDistM;
    const nearStart = distToStartM <= startEngageRadiusM;
    if (!onRoute && !nearStart) {
      return {
        progressM: 0,
        startEngaged: false,
        lockedAtStart: true,
        distToStartM,
        distToRouteM,
      };
    }
    // 진입: 투영 progress를 시작점으로 (출발만 가까우면 raw≈0에 가깝게 유지됨)
    const entry = Math.max(0, Number(rawProgressM) || 0);
    return {
      progressM: nearStart && !onRoute ? 0 : entry,
      startEngaged: true,
      lockedAtStart: false,
      distToStartM,
      distToRouteM,
    };
  }

  const raw = Math.max(0, Number(rawProgressM) || 0);
  const prev = Math.max(0, Number(prevProgressM) || 0);

  const earlyLastIdx = Math.min(
    Math.max(0, earlyNodeCount - 1),
    Math.max(0, steps.length - 1),
  );
  const earlyEndCum = Math.max(0, Number(steps[earlyLastIdx]?.cumulativeDistanceM) || 0);
  const inEarlyZone = prev < earlyEndCum;
  const jumpLimit = inEarlyZone ? Math.min(maxJumpM, earlyJumpM) : maxJumpM;

  let progressM = raw;
  if (raw > prev + jumpLimit) {
    progressM = prev + jumpLimit;
  } else if (raw < prev && prev - raw < backtrackHysteresisM) {
    progressM = prev;
  }

  if (inEarlyZone && steps.length > 1) {
    progressM = Math.min(progressM, earlyEndCum);
    for (let i = 1; i <= earlyLastIdx; i += 1) {
      const cum = Number(steps[i].cumulativeDistanceM) || 0;
      if (prev < cum) {
        progressM = Math.min(progressM, cum);
        break;
      }
    }
  }

  return {
    progressM,
    startEngaged: true,
    lockedAtStart: false,
    distToStartM,
    distToRouteM,
  };
}

/**
 * 목표 대비 이동/시선이 이 각도(°) 이상 어긋나면 반대 방향
 * (destinationAngle = bearing - heading 의 절댓값)
 */
export const WRONG_DIRECTION_ANGLE_DEG = 90;

/** 목표에서 이만큼(m) 이상 멀어지면 반대 방향 이동으로 카운트 */
export const WRONG_DIRECTION_AWAY_M = 3;

/** 경로 폴리라인에서 이 거리 이상 벗어나면 다른 통로(이탈)로 판정 */
export const OFF_ROUTE_THRESHOLD_M = 20;

/** 이탈/복귀 확정에 필요한 연속 GPS 샘플 수 */
export const OFF_ROUTE_HIT_COUNT = 3;
export const OFF_ROUTE_CLEAR_COUNT = 2;

/**
 * 현재 위치 → 경로 세그먼트(AB) 최단거리(m)
 * 역내 짧은 구간용 equirectangular 근사
 */
export function getDistanceToSegmentMeters(pos, a, b) {
  const metersPerDegLat = 110540;
  const metersPerDegLng = 111320 * Math.cos(toRad(pos.lat));

  const ax = (a.lng - pos.lng) * metersPerDegLng;
  const ay = (a.lat - pos.lat) * metersPerDegLat;
  const bx = (b.lng - pos.lng) * metersPerDegLng;
  const by = (b.lat - pos.lat) * metersPerDegLat;

  const abx = bx - ax;
  const aby = by - ay;
  const abLen2 = abx * abx + aby * aby;
  if (abLen2 < 1e-6) return Math.hypot(ax, ay);

  const t = Math.max(0, Math.min(1, (-ax * abx + -ay * aby) / abLen2));
  const px = ax + t * abx;
  const py = ay + t * aby;
  return Math.hypot(px, py);
}

/** 현재 GPS ↔ 전체 경로 폴리라인 최단거리(m) */
export function getDistanceToRouteMeters(pos, steps = []) {
  if (!pos || !steps.length) return Infinity;
  if (steps.length === 1) {
    return getDistanceMeters(pos.lat, pos.lng, steps[0].lat, steps[0].lng);
  }

  let min = Infinity;
  for (let i = 0; i < steps.length - 1; i += 1) {
    const d = getDistanceToSegmentMeters(pos, steps[i], steps[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

/**
 * 세그먼트 AB 위 투영점의 거리(m)와 t(0~1)
 * @returns {{ distanceM: number, t: number }}
 */
export function getProjectionOnSegment(pos, a, b) {
  const metersPerDegLat = 110540;
  const metersPerDegLng = 111320 * Math.cos(toRad(pos.lat));

  const ax = (a.lng - pos.lng) * metersPerDegLng;
  const ay = (a.lat - pos.lat) * metersPerDegLat;
  const bx = (b.lng - pos.lng) * metersPerDegLng;
  const by = (b.lat - pos.lat) * metersPerDegLat;

  const abx = bx - ax;
  const aby = by - ay;
  const abLen2 = abx * abx + aby * aby;
  if (abLen2 < 1e-6) {
    return { distanceM: Math.hypot(ax, ay), t: 0 };
  }

  const t = Math.max(0, Math.min(1, (-ax * abx + -ay * aby) / abLen2));
  const px = ax + t * abx;
  const py = ay + t * aby;
  return { distanceM: Math.hypot(px, py), t };
}

/**
 * 경로 폴리라인 위 최근접 투영
 * @returns {{ segmentIndex: number, t: number, distanceM: number }}
 */
export function getClosestPointOnRoute(pos, steps = []) {
  if (!pos || !steps.length) {
    return { segmentIndex: 0, t: 0, distanceM: Infinity };
  }
  if (steps.length === 1) {
    return {
      segmentIndex: 0,
      t: 0,
      distanceM: getDistanceMeters(pos.lat, pos.lng, steps[0].lat, steps[0].lng),
    };
  }

  let best = { segmentIndex: 0, t: 0, distanceM: Infinity };
  for (let i = 0; i < steps.length - 1; i += 1) {
    const { distanceM, t } = getProjectionOnSegment(pos, steps[i], steps[i + 1]);
    // 노드 위에서 동점이면 뒤 세그먼트 우선 (n06에서 n06→n07을 고르게)
    if (
      distanceM < best.distanceM - 1e-6 ||
      (Math.abs(distanceM - best.distanceM) <= 1e-6 && i >= best.segmentIndex)
    ) {
      best = { segmentIndex: i, t, distanceM };
    }
  }
  return best;
}

/**
 * steps에 cumulativeDistanceM / distanceToNextM이 없으면 Haversine으로 채운다.
 * (백엔드 값이 있으면 그대로 사용)
 */
export function ensureStepDistances(steps = []) {
  if (!steps.length) return steps;

  let cum = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step.cumulativeDistanceM == null || Number.isNaN(step.cumulativeDistanceM)) {
      step.cumulativeDistanceM = cum;
    } else {
      cum = Number(step.cumulativeDistanceM);
      step.cumulativeDistanceM = cum;
    }

    if (i >= steps.length - 1) {
      if (step.distanceToNextM == null) step.distanceToNextM = 0;
      continue;
    }

    const next = steps[i + 1];
    let toNext = step.distanceToNextM;
    if (toNext == null || Number.isNaN(toNext)) {
      toNext = getDistanceMeters(step.lat, step.lng, next.lat, next.lng);
      step.distanceToNextM = toNext;
    }

    if (next.cumulativeDistanceM == null || Number.isNaN(next.cumulativeDistanceM)) {
      next.cumulativeDistanceM = cum + toNext;
    }
    cum = Number(next.cumulativeDistanceM);
  }
  return steps;
}

/**
 * Sensors에서 중간 노드 좌표를 넣을 때 cum 스냅 반경.
 * n01↔n02 평면 ~9m라 mid(~4.5m)가 큰 스냅에 걸리면 s가 안 늘어남 → 기본은 작게 유지.
 */
export const ROUTE_NODE_SNAP_M = 3;

/**
 * 초반 노드(n01·n02) 스냅 상한(m).
 * 실제 반경은 인접 노드 간격에 비례해 더 줄어듦 —
 * n01↔n02 평면 ~10m인데 스냅이 2.5m+면 구간 20%만 걸어도 n01에 재스냅되어
 * progress=0 고정 → 초반 안내가 안 나가는 것처럼 보임.
 */
export const EARLY_NODE_SNAP_M = 2;

/**
 * 최종 목적지(마지막 노드) 평면 근접 시 s를 끝까지 스냅.
 * 도착 판정(remain ≤ 20m)보다 먼저 스냅되면 화면 40~50m → 한 틱에 remain=0 조기 도착이 남.
 * 스냅은 “이미 도착권(remain ≤ ARRIVAL_RADIUS_M)”일 때만 허용.
 */
export const ROUTE_FINAL_NODE_SNAP_M = 8;

/** 세그먼트 끝점(t≈0/1)이면 노드 cum으로 스냅 */
export const ROUTE_SEGMENT_END_SNAP_T = 0.12;

/** 초반 구간은 끝점 스냅을 더 작게 — 출발 직후에도 progress가 바로 증가하게 */
export const EARLY_SEGMENT_END_SNAP_T = 0.05;

function nodeSnapRadiusM(index, steps = []) {
  if (index >= EARLY_NODE_COUNT) return ROUTE_NODE_SNAP_M;
  const cur = steps[index];
  const next = steps[index + 1];
  if (!cur?.lat || !next?.lat) return Math.min(EARLY_NODE_SNAP_M, ROUTE_NODE_SNAP_M);
  const spacing = getDistanceMeters(cur.lat, cur.lng, next.lat, next.lng);
  if (!(spacing > 0)) return Math.min(EARLY_NODE_SNAP_M, ROUTE_NODE_SNAP_M);
  // 간격의 ~12%, 최소 1m ~ EARLY 상한 (n01↔n02 ~10m → ≈1.2m)
  return Math.min(EARLY_NODE_SNAP_M, Math.max(1, spacing * 0.12));
}

/**
 * GPS를 경로에 투영한 진행거리 s(m).
 * 남은거리 = totalDistanceM − s
 * @param {{ minSnapCumM?: number }} [options]
 *   minSnapCumM — 이 cum보다 뒤(작은 cum) 노드로는 스냅하지 않음
 *   (n02 통과 후 GPS가 n01 근처로 튀어도 출발 노드로 재스냅되지 않게)
 */
export function getProgressAlongRouteM(pos, steps = [], { minSnapCumM = 0 } = {}) {
  if (!pos || !steps.length) return 0;
  ensureStepDistances(steps);

  const lastIdx = steps.length - 1;
  const lastCum = Math.max(0, Number(steps[lastIdx].cumulativeDistanceM) || 0);
  const snapFloor = Math.max(0, Number(minSnapCumM) || 0);

  if (steps.length === 1) {
    return lastCum;
  }

  // 1) 가까운 중간 노드면 그 노드 cum (최종 노드 제외 — 아래에서 도착권일 때만 스냅)
  //    초반 노드는 간격 비례 스냅 (촘촘하면 더 작게)
  //    이미 지나온 cum보다 뒤 노드로는 스냅 금지
  let snapIdx = -1;
  let snapDist = Infinity;
  for (let i = 0; i < lastIdx; i += 1) {
    const cum = Math.max(0, Number(steps[i].cumulativeDistanceM) || 0);
    if (cum + 1e-6 < snapFloor) continue;
    const radius = nodeSnapRadiusM(i, steps);
    const d = getDistanceMeters(pos.lat, pos.lng, steps[i].lat, steps[i].lng);
    if (d > radius + 1e-6) continue;
    if (d < snapDist - 1e-6 || (Math.abs(d - snapDist) <= 1e-6 && i > snapIdx)) {
      snapDist = d;
      snapIdx = i;
    }
  }
  if (snapIdx >= 0) {
    return Math.max(snapFloor, Number(steps[snapIdx].cumulativeDistanceM) || 0);
  }

  // 2) 폴리라인 투영 — 구간 길이는 distanceToNextM 우선 (cum 차이 대신)
  const { segmentIndex, t } = getClosestPointOnRoute(pos, steps);
  const startCum = Number(steps[segmentIndex].cumulativeDistanceM) || 0;
  const distToNextRaw = steps[segmentIndex].distanceToNextM;
  const distToNext =
    distToNextRaw != null && !Number.isNaN(Number(distToNextRaw))
      ? Math.max(0, Number(distToNextRaw))
      : null;
  const endCum =
    Number(steps[segmentIndex + 1]?.cumulativeDistanceM) ||
    startCum +
      (distToNext != null
        ? distToNext
        : getDistanceMeters(
            steps[segmentIndex].lat,
            steps[segmentIndex].lng,
            steps[segmentIndex + 1].lat,
            steps[segmentIndex + 1].lng,
          ));
  const toNext = distToNext != null ? distToNext : Math.max(0, endCum - startCum);
  const clampedT = Math.max(0, Math.min(1, t));
  const projected = Math.max(0, startCum + clampedT * toNext);
  const remainToEnd = Math.max(0, lastCum - projected);

  const finish = (value) => Math.max(snapFloor, Math.max(0, value));

  // 0') 최종 노드 평면 근접 스냅 — BE remain이 이미 도착권(≤20m)일 때만
  const distLast = getDistanceMeters(
    pos.lat,
    pos.lng,
    steps[lastIdx].lat,
    steps[lastIdx].lng,
  );
  if (distLast <= ROUTE_FINAL_NODE_SNAP_M && remainToEnd <= ARRIVAL_RADIUS_M) {
    return finish(lastCum);
  }

  const endSnapT =
    segmentIndex < EARLY_NODE_COUNT ? EARLY_SEGMENT_END_SNAP_T : ROUTE_SEGMENT_END_SNAP_T;

  if (clampedT <= endSnapT) return finish(startCum);

  // 마지막 구간 끝 스냅도 remain이 도착권일 때만 (40→0 점프 방지)
  if (clampedT >= 1 - endSnapT) {
    const remainOnSeg = (1 - clampedT) * toNext;
    const onLastSeg = segmentIndex >= lastIdx - 1;
    if (onLastSeg && remainOnSeg > ARRIVAL_RADIUS_M) {
      return finish(projected);
    }
    return finish(endCum);
  }

  return finish(projected);
}

/**
 * 진행거리 s로 통과 노드·목표 노드를 역산한다.
 * - passedIndex: cumulativeDistanceM <= s 인 마지막 노드 (통과선)
 * - targetIndex: 다음에 향할 노드 (화살표 목적지)
 * - guideIndex: 현재 구간 안내 문구 노드 (= passedIndex)
 */
export function resolveStepIndexFromProgress(s, steps = []) {
  if (!steps.length) {
    return { passedIndex: 0, targetIndex: 0, guideIndex: 0 };
  }
  ensureStepDistances(steps);

  const lastIdx = steps.length - 1;
  const progress = Math.max(0, Number(s) || 0);

  let passedIndex = 0;
  for (let i = 0; i <= lastIdx; i += 1) {
    const cum = Number(steps[i].cumulativeDistanceM) || 0;
    if (cum <= progress) passedIndex = i;
    else break;
  }

  const targetIndex = passedIndex >= lastIdx ? lastIdx : passedIndex + 1;
  return {
    passedIndex,
    targetIndex,
    guideIndex: passedIndex,
  };
}

/**
 * 남은 거리(m) = totalDistanceM - s
 * total이 없으면 마지막 노드 cumulative로 대체.
 */
export function getRemainingDistanceM(progressM, steps = [], totalDistanceM = null) {
  const s = Math.max(0, Number(progressM) || 0);
  ensureStepDistances(steps);
  const total =
    totalDistanceM != null && !Number.isNaN(Number(totalDistanceM))
      ? Number(totalDistanceM)
      : Number(steps[steps.length - 1]?.cumulativeDistanceM) || 0;
  return Math.max(0, total - s);
}

/**
 * UI용: 현재 목표 노드까지 남은 거리(m).
 * 구간 길이는 출발 노드(guide)의 distanceToNextM을 쓴다.
 * (cumulativeDistanceM 차이로 구하지 않음 — BE screenText의 "23m 직진"과 동일 필드)
 */
export function getRemainingToTargetM(progressM, targetIndex, steps = []) {
  if (!steps.length) return 0;
  ensureStepDistances(steps);
  const lastIdx = steps.length - 1;
  const targetIdx = Math.max(0, Math.min(lastIdx, Number(targetIndex) || 0));
  const s = Math.max(0, Number(progressM) || 0);

  if (targetIdx <= 0) return 0;

  const from = steps[targetIdx - 1];
  const fromCum = Number(from?.cumulativeDistanceM) || 0;
  const toCum = Number(steps[targetIdx]?.cumulativeDistanceM) || 0;
  const segLen =
    from?.distanceToNextM != null && !Number.isNaN(Number(from.distanceToNextM))
      ? Math.max(0, Number(from.distanceToNextM))
      : Math.max(0, toCum - fromCum);

  const traveledOnSeg = Math.max(0, s - fromCum);
  return Math.max(0, segLen - traveledOnSeg);
}

/**
 * UI용 남은거리: 경로 폴리라인 위 현재 투영점 → 끝까지 Haversine 합.
 * BE cum(에스컬레이터 n10→n14 등)과 무관 → 312→113 같은 단위 전환 점프 없음.
 */
export function getPlanarRemainingAlongRouteM(pos, steps = []) {
  if (!pos || !steps.length) return 0;
  if (steps.length === 1) {
    return getDistanceMeters(pos.lat, pos.lng, steps[0].lat, steps[0].lng);
  }

  const { segmentIndex, t } = getClosestPointOnRoute(pos, steps);
  const clampedT = Math.max(0, Math.min(1, t));
  let remain = 0;

  const a = steps[segmentIndex];
  const b = steps[segmentIndex + 1];
  if (a && b) {
    const segLen = getDistanceMeters(a.lat, a.lng, b.lat, b.lng);
    remain += (1 - clampedT) * segLen;
  }

  for (let i = segmentIndex + 1; i < steps.length - 1; i += 1) {
    const from = steps[i];
    const to = steps[i + 1];
    if (!from || !to) continue;
    remain += getDistanceMeters(from.lat, from.lng, to.lat, to.lng);
  }

  return Math.max(0, remain);
}

/** 경로 전체 평면 길이 (노드 간 Haversine 합) — UI 초기 남은거리용 */
export function getPlanarRouteLengthM(steps = []) {
  if (!steps?.length || steps.length === 1) return 0;
  let len = 0;
  for (let i = 0; i < steps.length - 1; i += 1) {
    const a = steps[i];
    const b = steps[i + 1];
    if (!a || !b) continue;
    len += getDistanceMeters(a.lat, a.lng, b.lat, b.lng);
  }
  return Math.max(0, len);
}

export function getGeolocationErrorMessage(code) {
  switch (code) {
    case 1:
      return '위치 권한이 거부되었습니다.';
    case 2:
      return '위치 정보를 사용할 수 없습니다.';
    case 3:
      return '위치 요청 시간이 초과되었습니다.';
    default:
      return '위치 정보를 가져오지 못했습니다.';
  }
}

/** Safari 등 — 이미 거부된 경우 팝업 없이 바로 실패함 */
export async function queryGeolocationPermission() {
  if (!navigator.permissions?.query) return 'unknown';

  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    return result.state;
  } catch {
    return 'unknown';
  }
}

export const PERMISSION_REQUEST_OPTIONS = {
  ...GEOLOCATION_OPTIONS,
  timeout: 30000,
};

