import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDistanceMeters,
  GEOLOCATION_OPTIONS,
  getGeolocationErrorMessage,
  PERMISSION_REQUEST_OPTIONS,
} from '../utils/geo';

/**
 * Chrome Sensors는 Location만 바꿔도 watchPosition이 안 불릴 때가 많다.
 * JS로는 watch를 "강제로 울릴" 수 없고, getCurrentPosition 폴링이 유일한 보완이다.
 */
const GEO_POLL_MS = 250;
/** 이 거리(m) 미만 변화는 무시 (실GPS 미세 흔들림) */
const MOVE_EPS_M = 0.5;
/** watch가 죽은 것처럼 보일 때 재구독 */
const WATCH_REBIND_MS = 3000;

const POLL_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 1500,
};

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
  const pollIdRef = useRef(null);
  const rebindIdRef = useRef(null);
  const lastRawPosRef = useRef(null);
  const onUpdateRef = useRef(null);
  const watchOptionsRef = useRef(GEOLOCATION_OPTIONS);
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [isWatching, setIsWatching] = useState(false);

  const emitRaw = useCallback((pos) => {
    const raw = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestamp: pos.timestamp ?? Date.now(),
    };

    const prev = lastRawPosRef.current;
    if (prev) {
      const moved = getDistanceMeters(prev.lat, prev.lng, raw.lat, raw.lng);
      if (moved < MOVE_EPS_M) return;
    }

    // accuracy·속도 게이트 없음. Sensors 순간이동·실GPS 모두 lat/lng 변화를 즉시 전달
    lastRawPosRef.current = raw;
    setPosition(raw);
    setError(null);
    onUpdateRef.current?.(raw, pos);
  }, []);

  const clearWatchOnly = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const bindWatch = useCallback(() => {
    clearWatchOnly();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => emitRaw(pos),
      (err) => {
        // watch 실패해도 폴링은 유지 (Sensors 테스트 계속)
        setError(getGeolocationErrorMessage(err.code));
      },
      watchOptionsRef.current,
    );
  }, [clearWatchOnly, emitRaw]);

  const stopWatch = useCallback(() => {
    clearWatchOnly();
    if (pollIdRef.current != null) {
      clearInterval(pollIdRef.current);
      pollIdRef.current = null;
    }
    if (rebindIdRef.current != null) {
      clearInterval(rebindIdRef.current);
      rebindIdRef.current = null;
    }
    lastRawPosRef.current = null;
    onUpdateRef.current = null;
    setIsWatching(false);
  }, [clearWatchOnly]);

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

      bindWatch();

      // Sensors 보완: 좌표 변경을 250ms마다 직접 읽음 (watch 미발화 대응)
      pollIdRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => emitRaw(pos),
          () => {},
          POLL_OPTIONS,
        );
      }, GEO_POLL_MS);

      // watch 구독이 먹통일 때 주기적으로 재바인딩
      rebindIdRef.current = setInterval(() => {
        bindWatch();
      }, WATCH_REBIND_MS);

      // 시작 직후 한 번 즉시 읽기
      navigator.geolocation.getCurrentPosition(
        (pos) => emitRaw(pos),
        (err) => setError(getGeolocationErrorMessage(err.code)),
        POLL_OPTIONS,
      );
    },
    [bindWatch, emitRaw, stopWatch]
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
