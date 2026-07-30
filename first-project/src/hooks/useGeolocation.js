import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDistanceMeters,
  GEOLOCATION_OPTIONS,
  getGeolocationErrorMessage,
  GPS_MAX_ACCURACY_M,
  GPS_POS_SMOOTH_ALPHA_LOW_ACC,
  GPS_SOFT_ACCURACY_M,
  PERMISSION_REQUEST_OPTIONS,
  smoothLatLng,
} from '../utils/geo';

/** 이 거리(m) 미만 변화는 무시 (실GPS 미세 흔들림) */
const MOVE_EPS_M = 0.5;

/** S2 등에서 1회 권한 요청용 */
export function requestGeolocationPermission(options = PERMISSION_REQUEST_OPTIONS) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('이 브라우저는 위치 서비스를 지원하지 않습니다.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(new Error(getGeolocationErrorMessage(err.code))),
      options
    );
  });
}

function useGeolocation() {
  const watchIdRef = useRef(null);
  const lastRawPosRef = useRef(null);
  const lastSmoothedPosRef = useRef(null);
  const onUpdateRef = useRef(null);
  const watchOptionsRef = useRef(GEOLOCATION_OPTIONS);
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [isWatching, setIsWatching] = useState(false);

  const emitRaw = useCallback((pos) => {
    const accuracy = pos.coords.accuracy;
    const raw = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy,
      timestamp: pos.timestamp ?? performance.now(),
    };

    const prev = lastRawPosRef.current;
    if (prev) {
      const moved = getDistanceMeters(prev.lat, prev.lng, raw.lat, raw.lng);
      if (moved < MOVE_EPS_M) return;
    }
    lastRawPosRef.current = raw;

    if (accuracy != null && accuracy > GPS_MAX_ACCURACY_M) {
      console.warn(`[GPS] accuracy=${Math.round(accuracy)}m > ${GPS_MAX_ACCURACY_M}m — 샘플 무시`);
      return;
    }

    const prevSmoothed = lastSmoothedPosRef.current;
    const smoothed =
      accuracy != null && accuracy > GPS_SOFT_ACCURACY_M && prevSmoothed
        ? smoothLatLng(prevSmoothed, raw, GPS_POS_SMOOTH_ALPHA_LOW_ACC)
        : raw;
    lastSmoothedPosRef.current = smoothed;

    setPosition(smoothed);
    setError(null);
    onUpdateRef.current?.(smoothed, pos);
  }, []);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    lastRawPosRef.current = null;
    lastSmoothedPosRef.current = null;
    onUpdateRef.current = null;
    setIsWatching(false);
  }, []);

  const startWatch = useCallback(
    (onUpdate, options = GEOLOCATION_OPTIONS) => {
      if (!('geolocation' in navigator)) {
        setError('이 브라우저는 위치 서비스를 지원하지 않습니다.');
        return;
      }

      stopWatch();
      setError(null);
      setIsWatching(true);
      onUpdateRef.current = onUpdate;
      watchOptionsRef.current = { ...GEOLOCATION_OPTIONS, ...options, maximumAge: 0 };

      // watchPosition만 사용 (250ms 폴링·재바인딩 제거 — iOS 실측 기준)
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => emitRaw(pos),
        (err) => setError(getGeolocationErrorMessage(err.code)),
        watchOptionsRef.current,
      );

      // 시작 직후 1회 — 첫 fix 빠르게
      navigator.geolocation.getCurrentPosition(
        (pos) => emitRaw(pos),
        (err) => setError(getGeolocationErrorMessage(err.code)),
        { ...watchOptionsRef.current, timeout: 15000 },
      );
    },
    [emitRaw, stopWatch]
  );

  useEffect(() => () => stopWatch(), [stopWatch]);

  return {
    position,
    error,
    isWatching,
    startWatch,
    stopWatch,
    requestPermission: requestGeolocationPermission,
  };
}

export default useGeolocation;
