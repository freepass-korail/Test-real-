import { useCallback, useEffect, useRef, useState } from 'react';
import { HEADING_DEADBAND_DEG, normalizeAngle, shortestAngleDelta } from '../utils/geo';
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
 * 기기 나침반 heading (°) — 화면 위쪽 기준, 북=0 시계방향.
 * iOS 데모 우선: webkitCompassHeading + accuracy.
 * Android: absolute만 허용, 그 외는 null (틀린 값 대신 미확보).
 *
 * @returns {{ heading: number, source: 'webkit'|'absolute' } | null}
 */
export function getDeviceHeading(event) {
  if (!event) return null;

  // 1) iOS — 기울기 보정된 방위 + accuracy 검증
  if (event.webkitCompassHeading != null && !Number.isNaN(Number(event.webkitCompassHeading))) {
    // webkitCompassAccuracy < 0 → 헤딩 무효 (Apple)
    if (
      event.webkitCompassAccuracy != null &&
      !Number.isNaN(Number(event.webkitCompassAccuracy)) &&
      Number(event.webkitCompassAccuracy) < 0
    ) {
      return null;
    }
    return {
      heading: normalizeAngle(
        Number(event.webkitCompassHeading) - getScreenOrientationDeg(),
      ),
      source: 'webkit',
    };
  }

  // 2) Android absolute만 — 상대/미표기는 null (가드 3줄)
  if (event.alpha == null || Number.isNaN(Number(event.alpha))) return null;
  if (!(event.type === 'deviceorientationabsolute' || event.absolute === true)) {
    return null;
  }

  return {
    heading: normalizeAngle(360 - Number(event.alpha) - getScreenOrientationDeg()),
    source: 'absolute',
  };
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
  const [heading, setHeading] = useState(null);
  const [headingReady, setHeadingReady] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const handlerRef = useRef(null);
  const publishedHeadingRef = useRef(null);

  const { isStationary, start: startStationary, stop: stopStationary } = useStationary();

  const stopListening = useCallback(() => {
    if (handlerRef.current) {
      window.removeEventListener('deviceorientationabsolute', handlerRef.current, true);
      window.removeEventListener('deviceorientation', handlerRef.current, true);
    }
    handlerRef.current = null;
    stopStationary();
    publishedHeadingRef.current = null;
    setHeading(null);
    setHeadingReady(false);
    setIsListening(false);
  }, [stopStationary]);

  const startListening = useCallback(
    (onUpdate) => {
      stopListening();
      startStationary();

      const handler = (event) => {
        const parsed = getDeviceHeading(event);
        if (parsed == null) return;

        const raw = parsed.heading;
        const published = publishedHeadingRef.current;
        if (
          HEADING_DEADBAND_DEG > 0 &&
          published != null &&
          Math.abs(shortestAngleDelta(published, raw)) < HEADING_DEADBAND_DEG
        ) {
          return;
        }

        publishedHeadingRef.current = raw;
        setHeading(raw);
        setHeadingReady(true);
        onUpdate?.(raw);
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
    headingReady,
    isListening,
    isStationary,
    startListening,
    stopListening,
    requestPermission: requestOrientationPermission,
  };
}

export default useDeviceOrientation;
