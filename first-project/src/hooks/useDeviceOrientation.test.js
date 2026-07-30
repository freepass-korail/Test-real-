import { describe, expect, it } from 'vitest';
import {
  compassHeadingFromEuler,
  getDeviceHeading,
} from './useDeviceOrientation';

describe('compassHeadingFromEuler', () => {
  it('uses 360-alpha when phone is nearly flat (no tilt)', () => {
    expect(compassHeadingFromEuler(90, 0, 0)).toBeCloseTo(270, 5);
    expect(compassHeadingFromEuler(0, 2, 1)).toBeCloseTo(0, 5);
  });

  it('changes heading when pitch/roll are significant (tilt compensation)', () => {
    const flat = compassHeadingFromEuler(0, 0, 0);
    const tilted = compassHeadingFromEuler(0, 45, 20);
    expect(tilted).not.toBeNull();
    expect(Math.abs(tilted - flat)).toBeGreaterThan(1);
  });
});

describe('getDeviceHeading', () => {
  it('uses webkitCompassHeading when present', () => {
    const result = getDeviceHeading({ webkitCompassHeading: 90, alpha: 10, beta: 40, gamma: 10 });
    expect(result).not.toBeNull();
    expect(result.source).toBe('webkit');
    expect(result.heading).toBeCloseTo(90, 5);
  });

  it('treats deviceorientationabsolute as absolute even if absolute flag is false', () => {
    const result = getDeviceHeading({
      type: 'deviceorientationabsolute',
      absolute: false,
      alpha: 90,
      beta: 0,
      gamma: 0,
    });
    expect(result).not.toBeNull();
    expect(result.source).toBe('absolute');
    expect(result.heading).toBeCloseTo(-90, 5);
  });

  it('uses relative alpha instead of returning null (Android-only relative sensors)', () => {
    const result = getDeviceHeading({
      type: 'deviceorientation',
      absolute: false,
      alpha: 45,
      beta: 0,
      gamma: 0,
    });
    expect(result).not.toBeNull();
    expect(result.source).toBe('relative');
    expect(result.heading).toBeCloseTo(-45, 5);
  });

  it('applies beta/gamma tilt compensation when phone is upright', () => {
    const flat = getDeviceHeading({
      type: 'deviceorientationabsolute',
      absolute: true,
      alpha: 30,
      beta: 0,
      gamma: 0,
    });
    const upright = getDeviceHeading({
      type: 'deviceorientationabsolute',
      absolute: true,
      alpha: 30,
      beta: 70,
      gamma: 5,
    });
    expect(flat).not.toBeNull();
    expect(upright).not.toBeNull();
    expect(upright.heading).not.toBeCloseTo(flat.heading, 0);
  });

  it('returns null when alpha is missing', () => {
    expect(getDeviceHeading({ absolute: true })).toBeNull();
    expect(getDeviceHeading(null)).toBeNull();
  });
});
