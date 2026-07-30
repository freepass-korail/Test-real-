import { useEffect, useRef, useState } from 'react';
import { ARROW_FOLLOW, normalizeAngle, shortestAngleDelta } from '../utils/geo';

/**
 * 목적지 각도에 화살표가 따라가도록 보간.
 * follow가 클수록 네이버지도처럼 즉시 반응.
 */
export default function useFollowAngle(target = 0, { follow = ARROW_FOLLOW } = {}) {
  const [angle, setAngle] = useState(target);
  const angleRef = useRef(target);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    let raf;
    let active = true;

    const tick = () => {
      if (!active) return;
      const goal = targetRef.current;
      const prev = angleRef.current;
      const delta = shortestAngleDelta(prev, goal);

      let next;
      if (Math.abs(delta) < 0.4) {
        next = goal;
      } else {
        next = normalizeAngle(prev + delta * follow);
        raf = requestAnimationFrame(tick);
      }

      angleRef.current = next;
      setAngle(next);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [target, follow]);

  return angle;
}
