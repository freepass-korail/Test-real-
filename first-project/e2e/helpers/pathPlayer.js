import { destinationPoint, haversineM, lerpLatLng, nodeMapFromGuide } from './geo.js';

/** UI와 동일: 다음 목표 노드 cum − s (안내 문구 구간 m) */
function remainToNextTarget(expectedS, orderedNodes, total) {
  const s = Math.max(0, Number(expectedS) || 0);
  let passed = 0;
  for (let i = 0; i < orderedNodes.length; i += 1) {
    const cum = Number(orderedNodes[i].cumulativeDistanceM) || 0;
    if (cum <= s) passed = i;
    else break;
  }
  const lastIdx = orderedNodes.length - 1;
  const targetIdx = passed >= lastIdx ? lastIdx : passed + 1;
  const targetCum =
    Number(orderedNodes[targetIdx]?.cumulativeDistanceM) || Number(total) || 0;
  return Math.max(0, targetCum - s);
}

/**
 * 시나리오 → 주입 좌표열 + 기대 remain/phase
 * phase: forward | deviate | backtrack | pause
 */
export function buildCoordinateTimeline(scenario, guide, { stepM = 4 } = {}) {
  const nodes = nodeMapFromGuide(guide);
  const total = Number(guide.totalDistanceM) || 411.636;
  const orderedNodes = (guide.route || []).map((n) => nodes[n.nodeId]).filter(Boolean);
  const speed = scenario.speedMps || 1.2;
  const samples = [];
  let forwardSeg = 0;

  const pushWalk = (fromId, toId, phase, expectedCumAtEnd) => {
    const a = nodes[fromId];
    const b = nodes[toId];
    if (!a || !b) throw new Error(`unknown node ${fromId}→${toId}`);
    const planar = Math.max(haversineM(a, b), 0.5);
    const steps = Math.max(1, Math.ceil(planar / stepM));
    const startCum = Number(a.cumulativeDistanceM) || 0;
    const endCum =
      expectedCumAtEnd != null
        ? expectedCumAtEnd
        : Number(b.cumulativeDistanceM) ?? startCum + planar;

    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const pos = lerpLatLng(a, b, t);
      const expectedS = startCum + t * (endCum - startCum);
      samples.push({
        ...pos,
        phase,
        forwardSeg,
        expectedS,
        expectedRemain: remainToNextTarget(expectedS, orderedNodes, total),
        atNode: i === steps ? toId : null,
        dtSec: stepM / speed,
      });
    }
  };

  const walkPath = (ids, phase = 'forward') => {
    for (let i = 0; i < ids.length - 1; i += 1) {
      pushWalk(ids[i], ids[i + 1], phase);
    }
  };

  // 시작점 고정
  const startId = scenario.path[0];
  const start = nodes[startId];
  samples.push({
    lat: start.lat,
    lng: start.lng,
    phase: 'forward',
    forwardSeg,
    expectedS: Number(start.cumulativeDistanceM) || 0,
    expectedRemain: remainToNextTarget(
      Number(start.cumulativeDistanceM) || 0,
      orderedNodes,
      total,
    ),
    atNode: startId,
    dtSec: 0.2,
  });

  walkPath(scenario.path, 'forward');

  if (scenario.deviate) {
    forwardSeg += 1;
    const lastId = scenario.path[scenario.path.length - 1];
    const last = nodes[lastId];
    const lastCum = Number(last.cumulativeDistanceM) || 0;
    const off = destinationPoint(last, scenario.deviate.bearingDeg, scenario.deviate.distanceM);
    // 한 스텝 증가량이 WRONG_DIRECTION_AWAY 미만이 되도록 잘게 이동
    const outSteps = Math.max(8, Math.ceil(scenario.deviate.distanceM / 2));
    for (let i = 1; i <= outSteps; i += 1) {
      const t = i / outSteps;
      const pos = lerpLatLng(last, off, t);
      samples.push({
        ...pos,
        phase: 'deviate',
        forwardSeg,
        expectedS: lastCum,
        expectedRemain: remainToNextTarget(lastCum, orderedNodes, total),
        atNode: null,
        dtSec: 0.2,
      });
    }
    // 이탈 지점에서 정지 유지 → movingAway 해제 후 OFF_ROUTE_HIT(3) 충족
    for (let i = 0; i < 12; i += 1) {
      samples.push({
        lat: off.lat,
        lng: off.lng,
        phase: 'deviate',
        forwardSeg,
        expectedS: lastCum,
        expectedRemain: remainToNextTarget(lastCum, orderedNodes, total),
        atNode: null,
        dtSec: 0.3,
      });
    }
    if (scenario.deviate.thenReturn) {
      for (let i = 1; i <= outSteps; i += 1) {
        const t = i / outSteps;
        const pos = lerpLatLng(off, last, t);
        samples.push({
          ...pos,
          phase: 'deviate',
          forwardSeg,
          expectedS: lastCum,
          expectedRemain: remainToNextTarget(lastCum, orderedNodes, total),
          atNode: i === outSteps ? lastId : null,
          dtSec: 0.2,
        });
      }
      // 복귀 후 on-route clear
      for (let i = 0; i < 6; i += 1) {
        samples.push({
          lat: last.lat,
          lng: last.lng,
          phase: 'deviate',
          forwardSeg,
          expectedS: lastCum,
          expectedRemain: remainToNextTarget(lastCum, orderedNodes, total),
          atNode: lastId,
          dtSec: 0.25,
        });
      }
    }
  }

  if (scenario.backtrackTo) {
    forwardSeg += 1;
    const fromId = scenario.path[scenario.path.length - 1];
    const toId = scenario.backtrackTo;
    const pathIds = scenario.path;
    const fromIdx = pathIds.indexOf(fromId);
    const toIdx = pathIds.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0 || toIdx >= fromIdx) {
      throw new Error(`backtrackTo invalid: ${fromId} → ${toId}`);
    }
    for (let i = fromIdx; i > toIdx; i -= 1) {
      pushWalk(pathIds[i], pathIds[i - 1], 'backtrack');
    }
  }

  if (scenario.pauseSec) {
    forwardSeg += 1;
    const last = samples[samples.length - 1];
    const pauseTicks = Math.max(8, Math.ceil(scenario.pauseSec / 0.25));
    for (let i = 0; i < pauseTicks; i += 1) {
      samples.push({
        lat: last.lat,
        lng: last.lng,
        phase: 'pause',
        forwardSeg,
        expectedS: last.expectedS,
        expectedRemain: last.expectedRemain,
        atNode: last.atNode,
        dtSec: 0.25,
      });
    }
  }

  if (scenario.continueAfter?.length) {
    forwardSeg += 1;
    const resumeFrom = samples[samples.length - 1].atNode || scenario.path[scenario.path.length - 1];
    const cont = [resumeFrom, ...scenario.continueAfter.filter((id) => id !== resumeFrom)];
    const uniq = [];
    for (const id of cont) {
      if (uniq[uniq.length - 1] !== id) uniq.push(id);
    }
    walkPath(uniq, 'forward');
  }

  return { samples, totalDistanceM: total, nodes };
}
