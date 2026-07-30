import { useState } from 'react';
import styled from 'styled-components';
import useFlowStore from '../store/useFlowStore';
import S1_Join from './S1_Join';
import PermissionModal from './common/PermissionModal';
import GeolocationDeniedModal from './common/GeolocationDeniedModal';
import SystemLocationPrompt from './common/SystemLocationPrompt';
import { requestGeolocationPermission } from '../hooks/useGeolocation';
import {
  needsIOSOrientationPermission,
  requestOrientationPermission,
} from '../hooks/useDeviceOrientation';
import { requestMotionPermission } from '../hooks/useStationary';
import { STATION_START } from '../constants/station';

const OverlayRoot = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
`;

const SAFARI_LOCATION_RESET = `Safari에 '거부'가 저장되어 있으면
팝업 없이 계속 실패합니다.

① 주소창 왼쪽 aA → 웹사이트 설정
② 위치 → '허용' 또는 '묻기'
③ 페이지 새로고침 후 '위치 허용' 다시 누르기`;

const INAPP_HINT =
  '카카오톡 등 앱 안 브라우저에서는 위치 권한이 동작하지 않을 수 있습니다. Safari에서 직접 열어 주세요.';

/** E2E에서는 OS 권한 팝업이 안 뜨므로, 허용 직후 뜨는 시스템 알림을 시뮬레이션 */
function shouldSimulateSystemPrompt() {
  try {
    return new URLSearchParams(window.location.search).get('e2e') === '1';
  } catch {
    return false;
  }
}

function S2_Permission() {
  const { setStep, mapInstance } = useFlowStore();
  const isIOS = needsIOSOrientationPermission();
  const [orientationGranted, setOrientationGranted] = useState(!isIOS);
  const [isRequesting, setIsRequesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [systemPromptOpen, setSystemPromptOpen] = useState(false);

  const handlePermissionSuccess = (coords) => {
    const lat = Number(coords?.latitude);
    const lng = Number(coords?.longitude);
    const hasFix = Number.isFinite(lat) && Number.isFinite(lng);
    const center = hasFix ? { lat, lng } : STATION_START;

    useFlowStore.getState().setNavigation({
      position: { lat: center.lat, lng: center.lng },
    });
    if (mapInstance) {
      mapInstance.panTo({ lat: center.lat, lng: center.lng });
    }
    setIsRequesting(false);
    setOrientationGranted(!isIOS);
    setErrorMessage(null);
    setSystemPromptOpen(false);
    setStep('S3');
  };

  const handleLocationRequest = () => {
    setIsRequesting(true);
    setErrorMessage(null);

    requestGeolocationPermission()
      .then((pos) => handlePermissionSuccess(pos?.coords))
      .catch((error) => {
        console.error('위치 권한 실패', error);
        setIsRequesting(false);
        setErrorMessage(
          isIOS
            ? `방향 센서는 허용되었습니다.\n${error.message}\n\n아래 설정에서 위치를 '허용'으로 바꾼 뒤\n「위치 허용」을 다시 눌러 주세요.\n\n${SAFARI_LOCATION_RESET}\n\n${INAPP_HINT}`
            : `${error.message}\n\n${SAFARI_LOCATION_RESET}\n\n${INAPP_HINT}`
        );
      });
  };

  const handleOrientationRequest = () => {
    setIsRequesting(true);
    setErrorMessage(null);

    requestOrientationPermission()
      .then(() => requestMotionPermission().catch(() => true))
      .then(() => {
        setOrientationGranted(true);
        // 방향 센서 허용 후 자동으로 위치 권한도 연달아 요청
        return requestGeolocationPermission();
      })
      .then((pos) => handlePermissionSuccess(pos?.coords))
      .catch((error) => {
        console.error('권한 요청 실패', error);
        setIsRequesting(false);
        setErrorMessage(`${error.message}\n\n${INAPP_HINT}`);
      });
  };

  const handleAndroidPermissions = () => {
    setIsRequesting(true);
    setErrorMessage(null);

    const geoPromise = requestGeolocationPermission();
    const orientPromise = requestOrientationPermission();
    const motionPromise = requestMotionPermission().catch(() => true);

    Promise.allSettled([geoPromise, orientPromise, motionPromise]).then(([geoResult, orientResult]) => {
      const geoError = geoResult.status === 'rejected' ? geoResult.reason : null;
      const orientError = orientResult.status === 'rejected' ? orientResult.reason : null;

      if (!geoError && !orientError) {
        handlePermissionSuccess(geoResult.value?.coords);
        return;
      }

      setIsRequesting(false);
      const parts = [geoError?.message, orientError?.message].filter(Boolean);
      setErrorMessage(`${parts.join('\n')}\n\n${SAFARI_LOCATION_RESET}\n\n${INAPP_HINT}`);
    });
  };

  const runNativePermissionFlow = () => {
    if (isIOS) {
      if (!orientationGranted) {
        handleOrientationRequest();
        return;
      }
      handleLocationRequest();
      return;
    }

    handleAndroidPermissions();
  };

  const handleAllow = () => {
    if (isRequesting) return;

    // E2E: 앱 「위치 허용」 → (시뮬레이션) OS 위치 알림 → 「허용」
    if (shouldSimulateSystemPrompt()) {
      setIsRequesting(true);
      setErrorMessage(null);
      setSystemPromptOpen(true);
      return;
    }

    runNativePermissionFlow();
  };

  const handleSystemAllow = () => {
    setSystemPromptOpen(false);
    runNativePermissionFlow();
  };

  const handleSystemDeny = () => {
    setSystemPromptOpen(false);
    setIsRequesting(false);
    setStep('E1');
  };

  return (
    <OverlayRoot>
      <S1_Join dimmed />
      <PermissionModal
        isRequesting={isRequesting}
        onAllow={handleAllow}
        onDeny={() => setStep('E1')}
      />
      {systemPromptOpen && (
        <SystemLocationPrompt onAllow={handleSystemAllow} onDeny={handleSystemDeny} />
      )}
      {errorMessage && (
        <GeolocationDeniedModal
          message={errorMessage}
          onRetry={() => {
            setErrorMessage(null);
            handleAllow();
          }}
          onFallback={() => setStep('E1')}
        />
      )}
    </OverlayRoot>
  );
}

export default S2_Permission;
