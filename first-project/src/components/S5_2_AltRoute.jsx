/**
 * S5_2 — 다른 통로(경로 이탈) UI
 *
 * 실제 분기는 S5_Navigation + useNavigationTracking 의 altRoute 상태로 처리한다.
 * (백엔드에 altRoute 필드 없음 → GPS↔경로 polyline 거리로 프론트 판정)
 * 이 화면으로 직접 진입하면 S5로 돌려보낸다.
 */
import { useEffect } from 'react';
import useFlowStore from '../store/useFlowStore';

function S5_2_AltRoute() {
  const setStep = useFlowStore((s) => s.setStep);
  const setNavigation = useFlowStore((s) => s.setNavigation);

  useEffect(() => {
    setNavigation({ altRoute: true });
    setStep('S5');
  }, [setNavigation, setStep]);

  return null;
}

export default S5_2_AltRoute;
