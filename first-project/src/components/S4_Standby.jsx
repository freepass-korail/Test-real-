import { useState } from 'react';
import styled from 'styled-components';
import useFlowStore from '../store/useFlowStore';
import FigmaHeader from './common/FigmaHeader';
import FigmaPrimaryButton from './common/FigmaPrimaryButton';
import { fetchRoute } from '../api/guide';
import { fetchPath } from '../api/tickets';
import { typography } from '../styles/theme';
import {
  logoKtx,
  logoMugunghwa,
  logoItx,
  logoNuriro,
  logoItxCheong,
  logoItxSaemaul,
} from '../utils/preloadTrainLogos';

const TRAIN_LOGO_MAP = [
  { keys: ['ktx'],            logo: logoKtx },
  { keys: ['무궁화'],          logo: logoMugunghwa },
  { keys: ['itx-청춘', 'itx 청춘', '청춘'], logo: logoItxCheong },
  { keys: ['itx-새마을', 'itx 새마을', '새마을'], logo: logoItxSaemaul },
  { keys: ['itx'],            logo: logoItx },
  { keys: ['누리로', '누리호'], logo: logoNuriro },
];

function getTrainLogo(trainName) {
  if (!trainName) return logoKtx;
  const lower = trainName.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const { keys, logo } of TRAIN_LOGO_MAP) {
    if (keys.some((k) => lower.includes(k))) return logo;
  }
  return logoKtx;
}

const FF = typography.fontFamily;

const ErrorToast = styled.div`
  position: absolute;
  bottom: 100px;
  left: 16px;
  right: 16px;
  background: #FEE2E2;
  border: 1px solid #FECACA;
  border-radius: 12px;
  padding: 12px 16px;
  font-family: ${FF};
  font-size: 14px;
  font-weight: 500;
  color: #B91C1C;
  text-align: center;
  z-index: 10;
  line-height: 1.5;
`;

function parsePlatformNumber(platform) {
  return platform.replace(/[^0-9]/g, '') || '5';
}

function S4_Standby() {
  const {
    ticketInfo,
    reservationId,
    fromNode,
    toNode,
    routeSteps,
    position,
    setStep,
    setRoute,
    routeLoading,
    setRouteLoading,
    routeError,
    setRouteError,
  } = useFlowStore();
  const [localLoading, setLocalLoading] = useState(false);
  const info = ticketInfo;
  const platformNum = parsePlatformNumber(info.platform);
  const trainLogo = getTrainLogo(info.trainName);
  const loading = localLoading || routeLoading;
  const noRoute = !fromNode && !toNode && routeSteps.length === 0;

  const handleStartNavigation = () => {
    if (routeSteps.length > 0) { setStep('S5'); return; }

    setLocalLoading(true);
    setRouteLoading(true);
    setRouteError(null);

    const pathPromise = fromNode && toNode
      ? fetchPath({ from: fromNode, to: toNode })
      : (() => {
          const effectiveId = reservationId || ticketInfo?.ticketNumber || String(ticketInfo?.ticketId ?? '');
          if (!effectiveId) return Promise.reject(new Error('경로 정보가 없습니다.'));
          return fetchRoute({
            reservationId: effectiveId,
            ...(position ? { lat: position.lat, lng: position.lng } : {}),
          });
        })();

    pathPromise
      .then((route) => { setRoute(route); setStep('S5'); })
      .catch((error) => { console.error('[route]', error); setStep('E1'); })
      .finally(() => { setLocalLoading(false); setRouteLoading(false); });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#FFFFFF', overflow: 'hidden' }}>
      <FigmaHeader />

      {/* ── 카드 1: 타는 곳 ── */}
      {/* 카드 배경 */}
      <div style={{
        position: 'absolute', top: 199, left: 48, width: 306, height: 235,
        borderRadius: 10, background: '#FAFAFB',
        boxShadow: '0px 5px 15px 0px #00000059',
      }} />

      {/* 파란 헤더 */}
      <div style={{
        position: 'absolute', top: 199, left: 48, width: 306, height: 60,
        borderTopLeftRadius: 10, borderTopRightRadius: 10,
        background: '#286EF0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: FF, fontSize: 36, fontWeight: 700, color: '#FFFFFF', lineHeight: '140%' }}>
          타는 곳
        </span>
      </div>

      {/* 플랫폼 번호 */}
      <div style={{
        position: 'absolute', top: 278, left: 48, width: 306, height: 156,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
        <span style={{ fontFamily: FF, fontSize: 96, fontWeight: 700, color: '#286EF0', lineHeight: '140%' }}>
          {platformNum}
        </span>
        <span style={{ fontFamily: FF, fontSize: 36, fontWeight: 700, color: '#44444499', lineHeight: '140%', alignSelf: 'flex-end', marginBottom: 28 }}>
          번
        </span>
      </div>

      {/* ── 카드 2: 호차번호 ── */}
      {/* 카드 배경 */}
      <div style={{
        position: 'absolute', top: 474, left: 48, width: 306, height: 235,
        borderRadius: 10, background: '#FAFAFB',
        boxShadow: '0px 5px 15px 0px #00000059',
      }} />

      {/* 파란 헤더 */}
      <div style={{
        position: 'absolute', top: 474, left: 48, width: 306, height: 60,
        borderTopLeftRadius: 10, borderTopRightRadius: 10,
        background: '#286EF0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: FF, fontSize: 36, fontWeight: 700, color: '#FFFFFF', lineHeight: '140%', letterSpacing: 2 }}>
          호차번호
        </span>
      </div>

      {/* 열차 로고 */}
      <img
        src={trainLogo}
        alt={info.trainName}
        draggable={false}
        fetchPriority="high"
        decoding="sync"
        style={{
          position: 'absolute', top: 566, left: 75,
          width: 160, height: 90, objectFit: 'contain',
          imageRendering: '-webkit-optimize-contrast',
          filter: 'contrast(1.15) saturate(1.1)',
        }}
      />

      {/* 호차 번호 원형 뱃지 */}
      <div style={{
        position: 'absolute', top: 577, left: 243,
        width: 65, height: 64, borderRadius: 32.5,
        background: '#144999',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: FF, fontSize: 36, fontWeight: 700, color: '#FFFFFF' }}>
          {info.carNumber}
        </span>
      </div>

      {routeError && <ErrorToast role="alert">{routeError}</ErrorToast>}

      {/* 길찾기 시작 버튼 */}
      <FigmaPrimaryButton onClick={handleStartNavigation} disabled={loading || noRoute}>
        {loading ? '경로 불러오는 중…' : noRoute ? '승강장 경로 정보 없음' : '길찾기 시작'}
      </FigmaPrimaryButton>

    </div>
  );
}

export default S4_Standby;
