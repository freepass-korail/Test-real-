import { useEffect, useMemo } from 'react';
import closeIconSvg from '../assets/close.svg';
import checkArrivedImg from '../assets/check-arrived.png';
import useFlowStore from '../store/useFlowStore';
import useDepartureUrgent from '../hooks/useDepartureUrgent';
import { vibrateOnArrival } from '../utils/haptics';
import { DEPARTURE_URGENT_COLOR } from '../utils/time';
import { typography } from '../styles/theme';
import { abs, figma, figmaText } from '../styles/figmaLayout';
import { GUIDE_STATE, getGuideStateScreenText } from '../utils/guideStates';

const ARRIVAL_MOTION_CSS = `
@keyframes s51RipplePulse {
  0%   { transform: scale(0.95); opacity: 0.35; }
  50%  { transform: scale(1.03); opacity: 0.85; }
  100% { transform: scale(0.95); opacity: 0.35; }
}
@keyframes s51CheckPop {
  0%   { transform: scale(0.86); opacity: 0.6; }
  60%  { transform: scale(1.04); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .s51-ripple, .s51-check {
    animation: none !important;
  }
}
`;

function S5_1_Arrived() {
  const ticketInfo = useFlowStore((s) => s.ticketInfo);
  const resetFlow = useFlowStore((s) => s.resetFlow);
  const guideStateMap = useFlowStore((s) => s.guideStateMap);
  const playGuideState = useFlowStore((s) => s.playGuideState);

  const s5 = figma.s5;
  const s51 = figma.s5_1;
  const info = ticketInfo;
  const departureUrgent = useDepartureUrgent(info.departureTime);
  const text = (spec) => figmaText(spec, typography.fontFamily);
  const leftText = (spec) => ({
    ...text(spec),
    textAlign: 'left',
    justifyContent: 'flex-start',
  });

  const carLabel = useMemo(() => {
    const car = info.carNumber?.trim();
    if (!car) return '';
    return /호차/.test(car) ? car : `${car}호차`;
  }, [info.carNumber]);

  const arrivalTitle = carLabel ? `${carLabel} 도착` : '도착';

  const arrivalMessage = useMemo(() => {
    const fromBe = getGuideStateScreenText(guideStateMap, GUIDE_STATE.ARRIVED);
    if (fromBe) return fromBe;
    return carLabel
      ? `여기서 ${carLabel}를\n기다리세요.`
      : '여기서 열차를\n기다리세요.';
  }, [carLabel, guideStateMap]);

  useEffect(() => {
    vibrateOnArrival();
    playGuideState(GUIDE_STATE.ARRIVED);
  }, [playGuideState]);

  const handleClose = () => {
    resetFlow();
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: s51.background,
        overflow: 'hidden',
      }}
    >
      <style>{ARRIVAL_MOTION_CSS}</style>

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
      <p style={{ ...text(s5.platformValue), whiteSpace: 'nowrap' }}>
        {info.platform?.trim()
          ? /번/.test(info.platform)
            ? info.platform
            : `${info.platform}번`
          : ''}
      </p>
      <p style={{ ...text(s5.carValue), whiteSpace: 'nowrap' }}>
        {info.carNumber?.trim()
          ? /호차/.test(info.carNumber)
            ? info.carNumber
            : `${info.carNumber}호차`
          : ''}
      </p>
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

      {/* 도착 리플 링 — 바깥→안쪽 시차 펄스 */}
      {s51.rippleRings.map((ring, i) => (
        <div
          key={i}
          aria-hidden
          className="s51-ripple"
          style={{
            ...abs(ring),
            borderRadius: ring.radius,
            background: ring.background,
            transformOrigin: 'center center',
            willChange: 'transform, opacity',
            animation: `s51RipplePulse 2.4s ease-in-out ${i * 0.35}s infinite`,
          }}
        />
      ))}

      {/* 흰색 원 + 체크 — 진입 시 한 번 팝 */}
      <div
        aria-hidden
        className="s51-check"
        style={{
          ...abs(s51.checkCircle),
          borderRadius: s51.checkCircle.radius,
          background: s51.checkCircle.background,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transformOrigin: 'center center',
          animation: 's51CheckPop 0.55s cubic-bezier(0.22, 1, 0.36, 1) both',
        }}
      >
        <img
          src={checkArrivedImg}
          alt=""
          style={{
            width: s51.checkIcon.width,
            height: s51.checkIcon.height,
            objectFit: 'contain',
          }}
        />
      </div>

      <p
        style={{
          ...leftText(s51.arrivalTitle),
          width: 'auto',
          maxWidth: 320,
          whiteSpace: 'nowrap',
        }}
      >
        {arrivalTitle}
      </p>
      <p style={{ ...leftText(s51.arrivalMessage), whiteSpace: 'pre-line' }}>{arrivalMessage}</p>

      {/* 닫기 */}
      <button
        type="button"
        aria-label="안내 종료"
        onClick={handleClose}
        style={{
          ...abs(s51.closeButton),
          borderRadius: s51.closeButton.radius,
          background: s51.closeButton.background,
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
            width: s51.closeIcon.width,
            height: s51.closeIcon.height,
          }}
        />
      </button>
    </div>
  );
}

export default S5_1_Arrived;
