import { describe, expect, it } from 'vitest';
import { getDeviceHeading } from './useDeviceOrientation';

describe('getDeviceHeading', () => {
  it('uses webkitCompassHeading when present', () => {
    const result = getDeviceHeading({ webkitCompassHeading: 90, alpha: 10 });
    expect(result).not.toBeNull();
    expect(result.source).toBe('webkit');
    expect(result.heading).toBeCloseTo(90, 5);
  });

  it('treats deviceorientationabsolute as absolute even if absolute flag is false', () => {
    const result = getDeviceHeading({
      type: 'deviceorientationabsolute',
      absolute: false,
      alpha: 90,
    });
    expect(result).not.toBeNull();
    expect(result.source).toBe('absolute');
    expect(result.heading).toBeCloseTo(-90, 5); // 360-90 → normalize −180..180
  });

  it('uses relative alpha instead of returning null (Android-only relative sensors)', () => {
    const result = getDeviceHeading({
      type: 'deviceorientation',
      absolute: false,
      alpha: 45,
    });
    expect(result).not.toBeNull();
    expect(result.source).toBe('relative');
    expect(result.heading).toBeCloseTo(-45, 5); // 360-45 → normalize
  });

  it('returns null when alpha is missing', () => {
    expect(getDeviceHeading({ absolute: true })).toBeNull();
    expect(getDeviceHeading(null)).toBeNull();
  });
});
