import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HEADING_DEADBAND_DEG,
  HEADING_SMOOTH_ALPHA,
  normalizeAngle,
  shortestAngleDelta,
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
 * 기기 나침반 heading (°) — 화면 위쪽 기준, 북=0 시계방향.
 *
 * @returns {{ heading: number, source: 'webkit'|'absolute'|'relative'|'alpha' } | null}
 */
export function getDeviceHeading(event) {
  if (!event) return null;

  let compass;
  let source;

  // iOS: 기기 위쪽이 가리키는 방위 (북=0, 시계방향)
  if (event.webkitCompassHeading != null && !Number.isNaN(event.webkitCompassHeading)) {
    compass = Number(event.webkitCompassHeading);
    source = 'webkit';
  } else if (event.alpha == null || Number.isNaN(event.alpha)) {
    return null;
  } else {
    // deviceorientationabsolute 는 absolute 플래그가 빠지는 기기가 있음 → type 신뢰
    const isAbsoluteEvent =
      event.type === 'deviceorientationabsolute' || event.absolute === true;

    if (isAbsoluteEvent) {
      // W3C absolute: alpha는 반시계 → 나침반(시계)로 변환
      compass = 360 - Number(event.alpha);
      source = 'absolute';
    } else if (event.absolute === false) {
      // 상대 방위(임의 0점). 절대 이벤트가 없는 Android에서 이걸 버리면
      // heading이 영원히 0 → 화살표가 방향을 못 잡는 것처럼 보임.
      compass = 360 - Number(event.alpha);
      source = 'relative';
    } else {
      // absolute 미표기 — 다수 Android가 absolute처럼 alpha를 줌
      compass = 360 - Number(event.alpha);
      source = 'alpha';
    }
  }

  // 화면 위쪽 = 사용자가 보는 “앞”이 되도록 보정
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
  const isStationaryRef = useRef(false);

  const { isStationary, start: startStationary, stop: stopStationary } = useStationary();
  isStationaryRef.current = isStationary;

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

        // 절대 방위를 한 번이라도 받으면, 이후 상대 이벤트는 무시 (덮어쓰기 방지)
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

        // 정지 시 큰 deadband만 — 예전처럼 첫 샘플에 고정하면 역내 자기장 오차가 고착됨
        const deadband = isStationaryRef.current
          ? HEADING_DEADBAND_DEG * 2.5
          : HEADING_DEADBAND_DEG;

        const published = publishedHeadingRef.current;
        if (
          published != null &&
          Math.abs(shortestAngleDelta(published, smoothed)) < deadband
        ) {
          return;
        }

        publishedHeadingRef.current = smoothed;
        setHeading(smoothed);
        onUpdate?.(smoothed);
      };

      handlerRef.current = handler;
      const absSupported =
        typeof window !== 'undefined' && 'ondeviceorientationabsolute' in window;
      if (absSupported) {
        window.addEventListener('deviceorientationabsolute', handler, true);
        // 일부 기기는 absolute만으로는 이벤트가 안 와서 병행
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
