import { useEffect, useRef, useState } from 'react';
import { ARROW_HALF_LIFE_MS, normalizeAngle, shortestAngleDelta } from '../utils/geo';

/**
 * 목적지 각도 추종 — 단일 필터 계층 (시간 기반 반감기).
 * rAF는 setState 밖에서만 스케줄 (Strict Mode 이중 호출·누수 방지).
 */
export default function useFollowAngle(
  target = 0,
  { halfLifeMs = ARROW_HALF_LIFE_MS } = {},
) {
  const [angle, setAngle] = useState(target);
  const angleRef = useRef(target);
  const targetRef = useRef(target);
  const lastTsRef = useRef(null);
  targetRef.current = target;

  useEffect(() => {
    let raf = 0;
    let active = true;

    const tick = (now) => {
      if (!active) return;

      const prevTs = lastTsRef.current;
      lastTsRef.current = now;
      const dtMs = prevTs == null ? 0 : Math.min(64, Math.max(0, now - prevTs));

      const goal = targetRef.current;
      const prev = angleRef.current;
      const delta = shortestAngleDelta(prev, goal);

      let next;
      if (Math.abs(delta) < 0.35 || dtMs <= 0) {
        next = Math.abs(delta) < 0.35 ? goal : prev;
      } else {
        const decay = 1 - 2 ** (-dtMs / halfLifeMs);
        next = normalizeAngle(prev + delta * decay);
      }

      angleRef.current = next;
      setAngle(next);

      if (Math.abs(shortestAngleDelta(next, goal)) >= 0.35) {
        raf = requestAnimationFrame(tick);
      }
    };

    lastTsRef.current = null;
    raf = requestAnimationFrame(tick);

    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [target, halfLifeMs]);

  return angle;
}
