import { describe, expect, it } from 'vitest';
import { normalizePath, normalizeRoute, normalizeRouteStep } from './normalize';

describe('normalizeRouteStep — 구간 안내 필드 보존', () => {
  it('keeps headingBearing / maneuver / distances (v1 경로에서 복도 방위 유실 방지)', () => {
    const step = normalizeRouteStep({
      order: 0,
      nodeId: 'n01',
      name: '1번 출입구',
      lat: 37.1279929,
      lng: 128.2056833,
      instruction: '직진하세요',
      maneuver: 'straight',
      headingBearing: 351.26,
      distanceToNextM: 9.9,
      cumulativeDistanceM: 0,
    });

    expect(step.headingBearing).toBeCloseTo(351.26, 5);
    expect(step.maneuver).toBe('straight');
    expect(step.distanceToNextM).toBeCloseTo(9.9, 5);
    expect(step.cumulativeDistanceM).toBe(0);
  });

  it('accepts snake_case heading_bearing', () => {
    const step = normalizeRouteStep({
      node_id: 'n02',
      lat: 37.128,
      lng: 128.2056,
      heading_bearing: 12.5,
      distance_to_next_m: 26,
    });

    expect(step.headingBearing).toBeCloseTo(12.5, 5);
    expect(step.distanceToNextM).toBe(26);
  });

  it('leaves headingBearing null when BE omits it', () => {
    const step = normalizeRouteStep({ nodeId: 'n03', lat: 37.128, lng: 128.2056 });
    expect(step.headingBearing).toBeNull();
  });

  it('normalizeRoute carries headingBearing through to steps', () => {
    const route = normalizeRoute({
      routeId: 'r-1',
      steps: [
        { order: 0, nodeId: 'n01', lat: 37.1279929, lng: 128.2056833, headingBearing: 351.26 },
        { order: 1, nodeId: 'n02', lat: 37.1280816, lng: 128.2056662 },
      ],
    });

    expect(route.steps[0].headingBearing).toBeCloseTo(351.26, 5);
    expect(route.steps[1].headingBearing).toBeNull();
  });
});

describe('normalizePath — directions의 headingBearing 매핑', () => {
  it('maps directions[].headingBearing onto the matching node', () => {
    const { steps } = normalizePath({
      from: 'n01',
      to: 'n03',
      route: [
        { nodeId: 'n01', name: '출입구', lat: 37.1279929, lng: 128.2056833 },
        { nodeId: 'n02', name: '대합실', lat: 37.1280816, lng: 128.2056662 },
      ],
      directions: [{ nodeId: 'n01', text: '직진', headingBearing: 351.26, distanceToNextM: 9.9 }],
    });

    expect(steps[0].headingBearing).toBeCloseTo(351.26, 5);
    expect(steps[1].headingBearing).toBeNull();
  });
});
