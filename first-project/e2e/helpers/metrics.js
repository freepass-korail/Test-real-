function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function evaluateTrace(trace, scenario, common, announcedNodes, ttsPlayCount = 0) {
  const expect = scenario.expect || {};
  const checks = [];
  const forward = trace.filter((t) => t.phase === 'forward');
  const pause = trace.filter((t) => t.phase === 'pause');
  const backtrack = trace.filter((t) => t.phase === 'backtrack');

  const errors = forward
    .filter((t) => t.remainM != null && t.expectedRemain != null)
    .map((t) => Math.abs(t.remainM - t.expectedRemain))
    .sort((a, b) => a - b);

  const p50 = percentile(errors, 50);
  const p95 = percentile(errors, 95);

  const distP50Limit = common.거리정확도?.distanceErrorP50M ?? 15;
  const distP95Limit = expect.distanceErrorP95M ?? common.거리정확도?.distanceErrorP95M ?? 30;

  if (errors.length) {
    checks.push({
      name: 'distanceErrorP50M',
      pass: p50 <= distP50Limit,
      actual: p50,
      limit: distP50Limit,
    });
    checks.push({
      name: 'distanceErrorP95M',
      pass: p95 <= distP95Limit,
      actual: p95,
      limit: distP95Limit,
    });
  }

  // 연속 forwardSeg 안에서만 단조 감소 검사
  // 다음 목표까지 거리 표시는 노드 통과 시 다음 구간 m으로 다시 올라감 → target 변경·expectedRemain 상승은 허용
  let monoViol = 0;
  for (let i = 1; i < forward.length; i += 1) {
    if (forward[i].forwardSeg !== forward[i - 1].forwardSeg) continue;
    if (
      forward[i].targetIndex != null &&
      forward[i - 1].targetIndex != null &&
      forward[i].targetIndex > forward[i - 1].targetIndex
    ) {
      continue; // 목표 노드가 바뀌면 remain이 다음 구간 길이로 리셋됨
    }
    const prev = forward[i - 1].remainM;
    const cur = forward[i].remainM;
    if (prev == null || cur == null) continue;
    if (cur > prev + 1.5) {
      const prevExp = forward[i - 1].expectedRemain;
      const curExp = forward[i].expectedRemain;
      if (prevExp != null && curExp != null && curExp > prevExp + 1) continue;
      monoViol += 1;
    }
  }
  // 공통 단조 검증은 순수 전진 시나리오에만. 후퇴/이탈은 expect.distanceMonotonic으로 명시할 때만.
  const checkMono =
    expect.distanceMonotonic === true ||
    (expect.distanceMonotonic == null && common.거리단조성 && !scenario.backtrackTo && !scenario.deviate);
  if (checkMono) {
    const limit = common.거리단조성?.monotonicViolations ?? 0;
    checks.push({
      name: 'distanceMonotonic',
      pass: monoViol <= limit,
      actual: monoViol,
      limit,
    });
  }

  const maxJump = common.화살표?.maxArrowJumpDeg ?? 90;
  let maxArrowJump = 0;
  for (let i = 1; i < forward.length; i += 1) {
    if (forward[i].targetIndex !== forward[i - 1].targetIndex) continue; // 목표 변경 시 점프 허용
    const a = forward[i - 1].arrowDeg;
    const b = forward[i].arrowDeg;
    if (a == null || b == null) continue;
    let d = Math.abs(b - a);
    if (d > 180) d = 360 - d;
    maxArrowJump = Math.max(maxArrowJump, d);
  }
  checks.push({
    name: 'maxArrowJumpDeg',
    pass: maxArrowJump <= maxJump,
    actual: maxArrowJump,
    limit: maxJump,
  });

  if (expect.distanceStableWhilePaused || expect.arrowStableWhilePaused) {
    const remainRange =
      pause.length > 1
        ? Math.max(...pause.map((p) => p.remainM ?? 0)) - Math.min(...pause.map((p) => p.remainM ?? 0))
        : 0;
    const arrowRange =
      pause.length > 1
        ? Math.max(...pause.map((p) => p.arrowDeg ?? 0)) - Math.min(...pause.map((p) => p.arrowDeg ?? 0))
        : 0;
    const arrowLimit = common.화살표?.arrowStableWhilePausedDeg ?? 10;
    if (expect.distanceStableWhilePaused) {
      checks.push({
        name: 'distanceStableWhilePaused',
        pass: remainRange <= 2,
        actual: remainRange,
        limit: 2,
      });
    }
    if (expect.arrowStableWhilePaused) {
      checks.push({
        name: 'arrowStableWhilePaused',
        pass: Math.abs(arrowRange) <= arrowLimit,
        actual: arrowRange,
        limit: arrowLimit,
      });
    }
  }

  if (expect.distanceIncreasesOnBacktrack) {
    let increased = false;
    for (let i = 1; i < backtrack.length; i += 1) {
      if (
        backtrack[i].remainM != null &&
        backtrack[i - 1].remainM != null &&
        backtrack[i].remainM > backtrack[i - 1].remainM + 0.5
      ) {
        increased = true;
        break;
      }
    }
    checks.push({
      name: 'distanceIncreasesOnBacktrack',
      pass: increased,
      actual: increased,
      limit: true,
    });
  }

  const reached = trace.some((t) => t.step === 'S5_1' || (t.remainM != null && t.remainM <= 1 && t.atEnd));
  if (expect.reachesEnd != null) {
    checks.push({
      name: 'reachesEnd',
      pass: !!reached,
      actual: !!reached,
      limit: true,
    });
  }

  const uniqueAnnounced = [...new Set(announcedNodes)];
  const startNodeId = scenario.path?.[0];
  const expectedTurns = (scenario.path || [])
    .concat(scenario.continueAfter || [])
    .filter((id, i, arr) => arr.indexOf(id) === i && id !== startNodeId);

  if (expect.announcesAllTurns) {
    const missed = expectedTurns.filter((id) => !uniqueAnnounced.includes(id));
    checks.push({
      name: 'announcesAllTurns',
      pass: missed.length === 0,
      actual: { missed, announced: uniqueAnnounced },
      limit: 0,
    });
  }

  if (expect.noDuplicateAnnounce) {
    const counts = {};
    for (const id of announcedNodes) counts[id] = (counts[id] || 0) + 1;
    const dups = Object.entries(counts).filter(([, c]) => c > 1);
    checks.push({
      name: 'noDuplicateAnnounce',
      pass: dups.length === 0,
      actual: dups,
      limit: 0,
    });
  }

  if (expect.offRouteDetected != null) {
    const hit = trace.some((t) => t.altRoute === true);
    checks.push({
      name: 'offRouteDetected',
      pass: hit === !!expect.offRouteDetected,
      actual: hit,
      limit: expect.offRouteDetected,
    });
  }

  if (expect.recoversAfterReturn != null) {
    const lastForward = [...trace].reverse().find((t) => t.phase === 'forward' && t.altRoute === false);
    const recovered = !!lastForward || trace.filter((t) => t.phase === 'forward').slice(-3).every((t) => !t.altRoute);
    checks.push({
      name: 'recoversAfterReturn',
      pass: recovered,
      actual: recovered,
      limit: true,
    });
  }

  if (expect.reAnnouncesOnReturn) {
    const counts = {};
    for (const id of announcedNodes) counts[id] = (counts[id] || 0) + 1;
    // 후퇴 후 재진입: 어떤 노드든 2회 이상 안내
    const re = Object.values(counts).some((c) => c >= 2);
    checks.push({
      name: 'reAnnouncesOnReturn',
      pass: re,
      actual: { announcedNodes, counts },
      limit: true,
    });
  }

  // 통과 안내마다 Audio.play가 호출됐는지 (실제 BE audioBase64 또는 fixture)
  if (expect.voicePlaysOnAnnounce) {
    const minPlays = Math.max(1, uniqueAnnounced.filter((id) => id !== startNodeId).length);
    const pass = ttsPlayCount >= Math.max(3, Math.ceil(minPlays * 0.5));
    checks.push({
      name: 'voicePlaysOnAnnounce',
      pass,
      actual: { ttsPlayCount, announced: uniqueAnnounced },
      limit: { minPlaysHint: minPlays },
    });
  }

  const passed = checks.every((c) => c.pass);
  return {
    passed,
    checks,
    summary: {
      samples: trace.length,
      distanceErrorP50M: p50,
      distanceErrorP95M: p95,
      monotonicViolations: monoViol,
      maxArrowJumpDeg: maxArrowJump,
      announcedNodes: uniqueAnnounced,
      reachedEnd: !!reached,
      ttsPlayCount,
    },
  };
}
