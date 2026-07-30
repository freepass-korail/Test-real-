import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HEADING_SMOOTH_ALPHA,
  normalizeAngle,
  smoothAngle,
} from '../utils/geo';
import useStationary from './useStationary';

/** 화면 위쪽이 향하는 쪽 기준 보정 (세로/가로 회전) */
function getScreenOrientationDeg() {
  if (typeof window === 'undefined') return 0;
  const so = window.screen?.orientation;
  if (so && typeof so.angle === 'number' && !Number.isNaN(so.angle)) {
    return so.angle;
  }
  if (typeof window.orientation === 'number') {
    return window.orientation;
  }
  return 0;
}

/**
 * alpha(요) + beta(앞뒤 기울기) + gamma(좌우 기울기)로
 * "화면 위쪽이 가리키는 나침반 방위"를 계산 (tilt compensation).
 * 폰을 세우거나 기울여도 앞방향 방위가 유지되게 함.
 * @returns {number} 0~360 (북=0, 시계방향)
 */
export function compassHeadingFromEuler(alpha, beta, gamma) {
  const a = Number(alpha);
  const b = Number(beta);
  const g = Number(gamma);
  if (Number.isNaN(a)) return null;

  // beta/gamma 없거나 거의 수평 → alpha만 (360−α)
  if (
    Number.isNaN(b) ||
    Number.isNaN(g) ||
    (Math.abs(b) < 5 && Math.abs(g) < 5)
  ) {
    return ((360 - a) % 360 + 360) % 360;
  }

  const toRad = Math.PI / 180;
  const x = b * toRad; // beta: 앞뒤 (pitch)
  const y = g * toRad; // gamma: 좌우 (roll)
  const z = a * toRad; // alpha: 요 (yaw)

  const cX = Math.cos(x);
  const cY = Math.cos(y);
  const cZ = Math.cos(z);
  const sX = Math.sin(x);
  const sY = Math.sin(y);
  const sZ = Math.sin(z);

  // 기기 좌표계 → 지평 나침반 성분 (화면 위쪽 방향)
  const vx = -cZ * sY - sZ * sX * cY;
  const vy = -sZ * sY + cZ * sX * cY;

  if (Math.abs(vx) < 1e-8 && Math.abs(vy) < 1e-8) {
    return ((360 - a) % 360 + 360) % 360;
  }

  let heading = Math.atan2(vx, vy) * (180 / Math.PI);
  if (heading < 0) heading += 360;
  return heading;
}

/**
 * 기기 나침반 heading (°) — 화면 위쪽 기준, 북=0 시계방향.
 *
 * @returns {{ heading: number, source: 'webkit'|'absolute'|'relative'|'alpha' } | null}
 */
export function getDeviceHeading(event) {
  if (!event) return null;

  let compass;
  let source;

  // iOS: webkitCompassHeading은 이미 기울기 보정된 화면 위쪽 방위
  if (event.webkitCompassHeading != null && !Number.isNaN(event.webkitCompassHeading)) {
    compass = Number(event.webkitCompassHeading);
    source = 'webkit';
  } else if (event.alpha == null || Number.isNaN(event.alpha)) {
    return null;
  } else {
    const isAbsoluteEvent =
      event.type === 'deviceorientationabsolute' || event.absolute === true;

    // Android 등: alpha만 쓰면 폰을 세울 때 앞뒤/좌우 기울기가 반영 안 됨
    // → beta(앞뒤)·gamma(좌우)로 tilt compensation
    const tilted = compassHeadingFromEuler(event.alpha, event.beta, event.gamma);
    if (tilted == null) return null;
    compass = tilted;

    if (isAbsoluteEvent) {
      source = 'absolute';
    } else if (event.absolute === false) {
      source = 'relative';
    } else {
      source = 'alpha';
    }
  }

  return {
    heading: normalizeAngle(compass - getScreenOrientationDeg()),
    source,
  };
}

/** 절대/웹킷 소스가 상대보다 우선 */
function isPreferredHeadingSource(source) {
  return source === 'webkit' || source === 'absolute';
}

/** iOS 13+ — DeviceOrientationEvent.requestPermission 필요 여부 */
export function needsIOSOrientationPermission() {
  return (
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function'
  );
}

/** iOS 13+ 방향 센서 권한 */
export async function requestOrientationPermission() {
  if (needsIOSOrientationPermission()) {
    const state = await DeviceOrientationEvent.requestPermission();
    if (state !== 'granted') {
      throw new Error('방향 센서 권한이 거부되었습니다.');
    }
    return true;
  }
  return true;
}

function useDeviceOrientation() {
  const [heading, setHeading] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const handlerRef = useRef(null);
  const smoothHeadingRef = useRef(null);
  const publishedHeadingRef = useRef(null);
  const hasPreferredSourceRef = useRef(false);

  const { isStationary, start: startStationary, stop: stopStationary } = useStationary();

  const stopListening = useCallback(() => {
    if (handlerRef.current) {
      window.removeEventListener('deviceorientationabsolute', handlerRef.current, true);
      window.removeEventListener('deviceorientation', handlerRef.current, true);
    }
    handlerRef.current = null;
    stopStationary();
    smoothHeadingRef.current = null;
    publishedHeadingRef.current = null;
    hasPreferredSourceRef.current = false;
    setIsListening(false);
  }, [stopStationary]);

  const startListening = useCallback(
    (onUpdate) => {
      stopListening();
      startStationary();

      const handler = (event) => {
        const parsed = getDeviceHeading(event);
        if (parsed == null) return;

        if (parsed.source === 'relative' && hasPreferredSourceRef.current) {
          return;
        }
        if (isPreferredHeadingSource(parsed.source)) {
          hasPreferredSourceRef.current = true;
        }

        const raw = parsed.heading;
        const smoothed = smoothAngle(
          smoothHeadingRef.current,
          raw,
          HEADING_SMOOTH_ALPHA,
        );
        smoothHeadingRef.current = smoothed;
        publishedHeadingRef.current = smoothed;
        setHeading(smoothed);
        onUpdate?.(smoothed);
      };

      handlerRef.current = handler;
      const absSupported =
        typeof window !== 'undefined' && 'ondeviceorientationabsolute' in window;
      if (absSupported) {
        window.addEventListener('deviceorientationabsolute', handler, true);
        window.addEventListener('deviceorientation', handler, true);
      } else {
        window.addEventListener('deviceorientation', handler, true);
      }
      setIsListening(true);
    },
    [startStationary, stopListening]
  );

  useEffect(() => () => stopListening(), [stopListening]);

  return {
    heading,
    isListening,
    isStationary,
    startListening,
    stopListening,
    requestPermission: requestOrientationPermission,
  };
}

export default useDeviceOrientation;
