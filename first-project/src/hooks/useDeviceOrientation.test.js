import { describe, expect, it } from 'vitest';
import { getDeviceHeading } from './useDeviceOrientation';

describe('getDeviceHeading', () => {
  it('uses webkitCompassHeading when present', () => {
    const result = getDeviceHeading({
      webkitCompassHeading: 90,
      webkitCompassAccuracy: 5,
      alpha: 10,
    });
    expect(result).not.toBeNull();
    expect(result.source).toBe('webkit');
    expect(result.heading).toBeCloseTo(90, 5);
  });

  it('rejects webkit heading when accuracy is negative', () => {
    expect(
      getDeviceHeading({
        webkitCompassHeading: 90,
        webkitCompassAccuracy: -1,
      }),
    ).toBeNull();
  });

  it('accepts deviceorientationabsolute', () => {
    const result = getDeviceHeading({
      type: 'deviceorientationabsolute',
      absolute: false,
      alpha: 90,
    });
    expect(result).not.toBeNull();
    expect(result.source).toBe('absolute');
    expect(result.heading).toBeCloseTo(-90, 5);
  });

  it('returns null for relative Android orientation (no invented heading)', () => {
    expect(
      getDeviceHeading({
        type: 'deviceorientation',
        absolute: false,
        alpha: 45,
        beta: 10,
        gamma: 5,
      }),
    ).toBeNull();
  });

  it('returns null when alpha is missing', () => {
    expect(getDeviceHeading({ absolute: true })).toBeNull();
    expect(getDeviceHeading(null)).toBeNull();
  });
});
