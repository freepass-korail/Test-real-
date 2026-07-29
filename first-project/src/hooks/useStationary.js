import { useCallback, useEffect, useRef, useState } from 'react';
import { STATIONARY_ACCEL_M_S2, STATIONARY_HIT_COUNT } from '../utils/geo';

/** iOS 13+ DeviceMotion 권한 */
export async function requestMotionPermission() {
  if (
    typeof DeviceMotionEvent !== 'undefined' &&
    typeof DeviceMotionEvent.requestPermission === 'function'
  ) {
    const state = await DeviceMotionEvent.requestPermission();
    if (state !== 'granted') {
      throw new Error('모션 센서 권한이 거부되었습니다.');
    }
  }
  return true;
}

/**
 * 가속도 기반 정지 판정 (추천 Step3)
 * — 정지일 때 화살표 heading 고정을 위해 사용
 */
function useStationary() {
  const [isStationary, setIsStationary] = useState(false);
  const hitsRef = useRef(0);
  const handlerRef = useRef(null);

  const stop = useCallback(() => {
    if (handlerRef.current) {
      window.removeEventListener('devicemotion', handlerRef.current, true);
      handlerRef.current = null;
    }
    hitsRef.current = 0;
    setIsStationary(false);
  }, []);

  const start = useCallback(() => {
    stop();

    const handler = (event) => {
      const a = event.acceleration;
      const ag = event.accelerationIncludingGravity;
      let motionMag;

      if (a && a.x != null && a.y != null && a.z != null) {
        motionMag = Math.hypot(a.x, a.y, a.z);
      } else if (ag && ag.x != null && ag.y != null && ag.z != null) {
        // 중력 포함이면 9.8에서 벗어난 정도를 움직임으로 봄
        motionMag = Math.abs(Math.hypot(ag.x, ag.y, ag.z) - 9.81);
      } else {
        return;
      }

      if (motionMag <= STATIONARY_ACCEL_M_S2) {
        hitsRef.current += 1;
        if (hitsRef.current >= STATIONARY_HIT_COUNT) {
          setIsStationary(true);
        }
      } else {
        hitsRef.current = 0;
        setIsStationary(false);
      }
    };

    handlerRef.current = handler;
    window.addEventListener('devicemotion', handler, true);
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return { isStationary, start, stop, requestPermission: requestMotionPermission };
}

export default useStationary;
