import { useEffect, useState } from 'react';
import { ARROW_FOLLOW, normalizeAngle, shortestAngleDelta } from '../utils/geo';

/** 목적지 각도에 화살표가 부드럽게 따라가도록 보간 */
export default function useFollowAngle(target = 0, { follow = ARROW_FOLLOW } = {}) {
  const [angle, setAngle] = useState(target);

  useEffect(() => {
    let raf;
    let active = true;

    const tick = () => {
      if (!active) return;

      setAngle((prev) => {
        const delta = shortestAngleDelta(prev, target);
        // 목표에 거의 도달하면 스냅하고 루프 종료
        if (Math.abs(delta) < 0.8) return target;
        raf = requestAnimationFrame(tick);
        return normalizeAngle(prev + delta * follow);
      });
    };

    raf = requestAnimationFrame(tick);

    return () => {
      active = false;
      cancelAnimationFrame(raf);
    };
  }, [target, follow]);

  return angle;
}
