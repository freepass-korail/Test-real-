import { useMemo, useEffect } from 'react';
import closeIconSvg from '../assets/close.svg';
import checkGreenImg from '../assets/check-green.png';
import useFlowStore from '../store/useFlowStore';
import GeolocationDeniedModal from './common/GeolocationDeniedModal';
import useNavigationTracking from '../hooks/useNavigationTracking';
import useFollowAngle from '../hooks/useFollowAngle';
import useDepartureUrgent from '../hooks/useDepartureUrgent';
import useDepartureExpired from '../hooks/useDepartureExpired';
import { DEPARTURE_URGENT_COLOR } from '../utils/time';
import S5NavigationArrow from './common/S5NavigationArrow';
import { ARRIVAL_RADIUS_M, formatGuideDistance, getCompassDotPosition, getNavigationInstruction } from '../utils/geo';
import { GUIDE_STATE, getGuideStateScreenText } from '../utils/guideStates';
import { typography } from '../styles/theme';
import { abs, figma, figmaText } from '../styles/figmaLayout';

const FF = typography.fontFamily;
const GREEN = '#00C35C';

function formatPlatformLabel(platform) {
  const raw = String(platform ?? '').trim();
  if (!raw) return '';
  return /번/.test(raw) ? raw : `${raw}번`;
}

function formatCarLabel(carNumber) {
  const raw = String(carNumber ?? '').trim();
  if (!raw) return '';
  return /호차/.test(raw) ? raw : `${raw}호차`;
}

function DepartureExpiredOverlay({ info, s5, text, message, onClose }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 60,
      background: GREEN, overflow: 'hidden',
    }}>
      {/* 상단 출발 시간 카드 */}
      <div style={{ ...abs(s5.timeCard), borderRadius: s5.timeCard.radius, background: s5.timeCard.background }} />
      <p style={text(s5.timeLabel)}>기차 출발 시간</p>
      <p style={text(s5.timeValue)}>{info.departureTime}</p>

      {/* 상단 승차 정보 카드 */}
      <div style={{ ...abs(s5.ticketCard), borderRadius: s5.ticketCard.radius, background: s5.ticketCard.background }} />
      <p style={{ ...text(s5.route), whiteSpace: 'nowrap' }}>{`${info.departureStation}→${info.arrivalStation}`}</p>
      <p style={text(s5.trainName)}>{info.trainName}</p>
      <p style={text(s5.platformLabel)}>타는곳</p>
      <p style={text(s5.carLabel)}>호차번호</p>
      <p style={text(s5.seatLabel)}>좌석번호</p>
      <p style={{ ...text(s5.platformValue), whiteSpace: 'nowrap' }}>{formatPlatformLabel(info.platform)}</p>
      <p style={{ ...text(s5.carValue), whiteSpace: 'nowrap' }}>{formatCarLabel(info.carNumber)}</p>
      <p style={{ ...text(s5.seatValue), whiteSpace: 'nowrap' }}>{info.seatNumber}</p>
      {s5.dividers.map((line, i) => (
        <div key={i} style={{ position: 'absolute', top: line.top, left: line.left, width: 0, height: line.height, borderLeft: line.border }} />
      ))}

      {/* 리플 링 */}
      {[
        { width: 362, height: 362, top: 208, left: 20 },
        { width: 283, height: 283, top: 247, left: 59 },
      ].map((ring, i) => (
        <div key={i} style={{
          position: 'absolute', top: ring.top, left: ring.left,
          width: ring.width, height: ring.height,
          borderRadius: '50%', background: '#FFFFFF26',
        }} />
      ))}

      {/* 흰 원 + 체크 아이콘 */}
      <div style={{
        position: 'absolute', top: 294, left: 109,
        width: 184, height: 184, borderRadius: '50%', background: '#FFFFFF',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <img
          src={checkGreenImg}
          alt=""
          style={{
            width: 99, height: 91,
            filter: 'brightness(0) saturate(100%) invert(44%) sepia(99%) saturate(420%) hue-rotate(107deg) brightness(95%) contrast(101%)',
          }}
        />
      </div>

      {/* 제목 */}
      <p style={{
        position: 'absolute', top: 590, left: 40, width: 177, height: 67,
        fontFamily: FF, fontSize: 48, fontWeight: 800, color: '#FFFFFF',
        lineHeight: '140%', letterSpacing: 0, margin: 0,
        display: 'flex', alignItems: 'center',
      }}>
        열차 출발
      </p>

      {/* 설명 — BE DEPARTURE_TIME_PASSED.screenText */}
      <p style={{
        position: 'absolute', top: 667, left: 40, width: 280, height: 90,
        fontFamily: FF, fontSize: 32, fontWeight: 600, color: '#FFFFFF',
        lineHeight: '140%', letterSpacing: 0, margin: 0, whiteSpace: 'pre-line',
        wordBreak: 'keep-all',
      }}>
        {message}
      </p>

      {/* 닫기 */}
      <button
        type="button"
        aria-label="안내 종료"
        onClick={onClose}
        style={{
          position: 'absolute', top: 765, left: 301,
          width: 70, height: 70, borderRadius: '50%',
          background: '#FFFFFF40', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <img src={closeIconSvg} alt="닫기" style={{ width: 28, height: 28 }} />
      </button>
    </div>
  );
}

function S5_Navigation() {
  const ticketInfo = useFlowStore((s) => s.ticketInfo);
  const currentInstruction = useFlowStore((s) => s.currentInstruction);
  const routeSteps = useFlowStore((s) => s.routeSteps);
  const setStep = useFlowStore((s) => s.setStep);
  const resetFlow = useFlowStore((s) => s.resetFlow);
  const distanceM = useFlowStore((s) => s.distanceM);
  const currentStepIndex = useFlowStore((s) => s.currentStepIndex);
  const destinationAngle = useFlowStore((s) => s.destinationAngle);
  const headingReady = useFlowStore((s) => s.headingReady);
  const geoError = useFlowStore((s) => s.geoError);
  const setGeoError = useFlowStore((s) => s.setGeoError);
  const isTracking = useFlowStore((s) => s.isTracking);
  const overshoot = useFlowStore((s) => s.overshoot);
  const altRoute = useFlowStore((s) => s.altRoute);
  const routeLoading = useFlowStore((s) => s.routeLoading);
  const guideStateMap = useFlowStore((s) => s.guideStateMap);
  const playGuideState = useFlowStore((s) => s.playGuideState);

  const playCurrentStepAudio = useFlowStore((s) => s.playCurrentStepAudio);

  const { stopTracking } = useNavigationTracking({ enabled: routeSteps.length > 0 });

  useEffect(() => {
    // 출발 안내(n01)는 1회만 — mount + pointerdown unlock이 겹치면 "3층에서 출발"이 두 번 들림
    playCurrentStepAudio();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s5 = figma.s5;
  const info = ticketInfo;
  const departureUrgent = useDepartureUrgent(info.departureTime);
  const departureExpired = useDepartureExpired(info.departureTime);

  useEffect(() => {
    if (!departureExpired) return;
    playGuideState(GUIDE_STATE.DEPARTURE_TIME_PASSED);
  }, [departureExpired, playGuideState]);

  const text = (spec) => figmaText(spec, typography.fontFamily);
  const leftText = (spec) => ({
    ...text(spec),
    textAlign: 'left',
    justifyContent: 'flex-start',
  });

  const distanceDisplay = useMemo(
    () => formatGuideDistance(distanceM),
    [distanceM]
  );

  const guideMessage = useMemo(() => {
    if (altRoute) {
      if (routeLoading) return '경로를 다시 찾는 중이에요.';
      return getGuideStateScreenText(guideStateMap, GUIDE_STATE.OFF_ROUTE);
    }
    if (overshoot) {
      return getGuideStateScreenText(guideStateMap, GUIDE_STATE.DESTINATION_PASSED);
    }
    // 마지막 구간 + 도착권 remain — 짧은 마지막 구간은 0m 근처만 ARRIVED 문구
    const lastIdx = routeSteps.length - 1;
    const onFinal = lastIdx >= 0 && currentStepIndex >= lastIdx;
    if (onFinal && distanceM != null && distanceM <= ARRIVAL_RADIUS_M) {
      const lastSegLen =
        lastIdx > 0
          ? Math.max(
              0,
              (Number(routeSteps[lastIdx]?.cumulativeDistanceM) || 0) -
                (Number(routeSteps[lastIdx - 1]?.cumulativeDistanceM) || 0),
            )
          : Infinity;
      if (lastSegLen > ARRIVAL_RADIUS_M || distanceM <= 0.5) {
        return getGuideStateScreenText(guideStateMap, GUIDE_STATE.ARRIVED);
      }
    }
    return getNavigationInstruction(distanceM, currentInstruction);
  }, [
    altRoute,
    currentInstruction,
    currentStepIndex,
    distanceM,
    guideStateMap,
    overshoot,
    routeLoading,
    routeSteps,
  ]);

  const departureExpiredMessage = useMemo(
    () => getGuideStateScreenText(guideStateMap, GUIDE_STATE.DEPARTURE_TIME_PASSED),
    [guideStateMap],
  );

  const screenBg = altRoute || overshoot ? '#EF4C56' : s5.background;
  const ringBg = altRoute || overshoot ? '#FFFFFF1A' : null;

  const compass = s5.compass;
  const arrow = s5.arrow;
  const innerLocalCenter = s5.innerRing.width / 2;
  const arrowMaxLength = compass.innerRadius - compass.arrowMargin;
  const arrowScale = arrowMaxLength / arrow.halfExtent;
  const arrowAngle = useFollowAngle(destinationAngle);

  const dotPosition = useMemo(
    () =>
      getCompassDotPosition(
        compass.centerX,
        compass.centerY,
        compass.dotOrbitRadius,
        destinationAngle,
        compass.dotSize,
        compass.dotSize
      ),
    [compass, destinationAngle]
  );

  const compassOpacity =
    isTracking && (distanceM == null || !headingReady) ? 0.45 : 1;

  const handleClose = () => {
    stopTracking();
    setGeoError(null);
    setStep('S4');
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: screenBg,
        overflow: 'hidden',
        transition: 'background 0.25s ease',
      }}
    >
      {/* 상단 출발 시간 카드 */}
      <div
        style={{
          ...abs(s5.timeCard),
          borderRadius: s5.timeCard.radius,
          background: s5.timeCard.background,
        }}
      />
      <p style={text(s5.timeLabel)}>기차 출발 시간</p>
      <p
        style={{
          ...text(s5.timeValue),
          color: departureUrgent ? DEPARTURE_URGENT_COLOR : s5.timeValue.color,
        }}
      >
        {info.departureTime}
      </p>

      {/* 상단 승차 정보 카드 */}
      <div
        style={{
          ...abs(s5.ticketCard),
          borderRadius: s5.ticketCard.radius,
          background: s5.ticketCard.background,
        }}
      />
      <p style={{ ...text(s5.route), whiteSpace: 'nowrap' }}>{`${info.departureStation}→${info.arrivalStation}`}</p>
      <p style={text(s5.trainName)}>{info.trainName}</p>
      <p style={text(s5.platformLabel)}>타는곳</p>
      <p style={text(s5.carLabel)}>호차번호</p>
      <p style={text(s5.seatLabel)}>좌석번호</p>
      <p style={{ ...text(s5.platformValue), whiteSpace: 'nowrap' }}>{formatPlatformLabel(info.platform)}</p>
      <p style={{ ...text(s5.carValue), whiteSpace: 'nowrap' }}>{formatCarLabel(info.carNumber)}</p>
      <p style={{ ...text(s5.seatValue), whiteSpace: 'nowrap' }}>{info.seatNumber}</p>

      {s5.dividers.map((line, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: line.top,
            left: line.left,
            width: 0,
            height: line.height,
            borderLeft: line.border,
          }}
        />
      ))}

      {/* 나침반 링 */}
      <div
        style={{
          ...abs(s5.outerRing),
          borderRadius: s5.outerRing.radius,
          background: ringBg ?? s5.outerRing.background,
        }}
      />
      <div
        style={{
          ...abs(s5.innerRing),
          borderRadius: s5.innerRing.radius,
          background: ringBg ?? s5.innerRing.background,
        }}
      />

      {/* 목적지 점 — 링 궤도에 먼저 표시 */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: dotPosition.left,
          top: dotPosition.top,
          width: compass.dotSize,
          height: compass.dotSize,
          borderRadius: s5.headingDot.radius,
          background: s5.headingDot.background,
          transition: 'left 0.06s linear, top 0.06s linear',
          opacity: compassOpacity,
          pointerEvents: 'none',
        }}
      />

      {/* 방향 화살표 — 원 중앙 고정, 제자리 회전 */}
      <div
        aria-hidden
        style={{
          ...abs(s5.innerRing),
          borderRadius: '50%',
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: innerLocalCenter,
            top: innerLocalCenter,
            width: 0,
            height: 0,
            transform: `rotate(${arrowAngle}deg)`,
            opacity: compassOpacity,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transform: `translate(-50%, -50%) scale(${arrowScale})`,
              transformOrigin: 'center center',
            }}
          >
            <S5NavigationArrow
              width={arrow.width}
              height={arrow.height}
              strokeWidth={arrow.strokeWidth}
              color={arrow.color}
            />
          </div>
        </div>
      </div>

      {/* 거리 · 안내 문구 */}
      <div
        style={{
          position: 'absolute',
          top: s5.distanceValue.top,
          left: s5.distanceValue.left,
          display: 'flex',
          alignItems: 'baseline',
          gap: 4,
        }}
      >
        <span
          style={{
            fontFamily: typography.fontFamily,
            fontSize: distanceDisplay.fontSize,
            fontWeight: s5.distanceValue.fontWeight,
            color: s5.distanceValue.color,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          {distanceDisplay.value}
        </span>
        <span
          style={{
            fontFamily: typography.fontFamily,
            fontSize: s5.distanceUnit.fontSize,
            fontWeight: s5.distanceUnit.fontWeight,
            color: s5.distanceUnit.color,
            lineHeight: 1,
          }}
        >
          {distanceDisplay.unit}
        </span>
      </div>
      <p style={
        altRoute
          ? {
              position: 'absolute', top: 667, left: 40, width: 301, height: 90,
              fontFamily: typography.fontFamily, fontSize: 32, fontWeight: 600,
              lineHeight: '140%', letterSpacing: 0, textAlign: 'left',
              color: '#FFFFFF', margin: 0, whiteSpace: 'pre-line',
            }
          : overshoot
            ? {
                position: 'absolute', top: 667, left: 40, width: 217, height: 90,
                fontFamily: typography.fontFamily, fontSize: 32, fontWeight: 600,
                lineHeight: '140%', letterSpacing: 0, textAlign: 'left',
                color: '#FFFFFF', margin: 0, whiteSpace: 'pre-line',
              }
            : {
                ...leftText(s5.guideText),
                whiteSpace: 'pre-line',
                wordBreak: 'keep-all',
                alignItems: 'flex-start',
              }
      }>{guideMessage}</p>

      {/* 닫기 */}
      <button
        type="button"
        aria-label="길찾기 종료"
        onClick={handleClose}
        style={{
          ...abs(s5.closeButton),
          borderRadius: s5.closeButton.radius,
          background: s5.closeButton.background,
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={closeIconSvg}
          alt="닫기"
          style={{
            width: s5.closeIcon.width,
            height: s5.closeIcon.height,
          }}
        />
      </button>

      {geoError && (
        <GeolocationDeniedModal
          message={geoError}
          onRetry={() => {
            setGeoError(null);
            window.location.reload();
          }}
          onFallback={() => {
            stopTracking();
            setGeoError(null);
            setStep('E1');
          }}
        />
      )}

      {departureExpired && (
        <DepartureExpiredOverlay
          info={info}
          s5={s5}
          text={text}
          message={departureExpiredMessage}
          onClose={() => { stopTracking(); resetFlow(); }}
        />
      )}
    </div>
  );
}

export default S5_Navigation;
