import arrowStationImg from '../assets/arrow-station.png';
import useFlowStore from '../store/useFlowStore';
import FigmaHeader from './common/FigmaHeader';
import FigmaPrimaryButton from './common/FigmaPrimaryButton';
import { typography } from '../styles/theme';

const FF = typography.fontFamily;

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function formatKoreanDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_NAMES[d.getDay()]})`;
}

function extractTrainNumber(trainNo, trainName) {
  if (!trainNo) return '';
  const num = trainNo.replace(/^[A-Za-z]+/, '');
  return num ? `${trainName} ${num}` : trainName;
}

function E1_StaticGuide() {
  const { ticketInfo, routeSteps, setStep } = useFlowStore();
  const info = ticketInfo;

  const dateLabel = formatKoreanDate(info.depTimeRaw) || info.travelDate;
  const trainLabel = extractTrainNumber(info.trainNo, info.trainName) || info.trainName;
  const hasRoute = routeSteps.length > 0;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#FFFFFF', overflow: 'hidden' }}>
      <FigmaHeader />

      {/* 카드 배경 */}
      <div style={{
        position: 'absolute', top: 195, left: 27, width: 348, height: 479,
        borderRadius: 10, background: '#FAFAFB',
        boxShadow: '0px 5px 15px 0px #00000059',
      }} />

      {/* 파란 헤더 바 */}
      <div style={{
        position: 'absolute', top: 195, left: 27, width: 348, height: 54,
        borderTopLeftRadius: 10, borderTopRightRadius: 10,
        background: '#286EF0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: FF, fontSize: 24, fontWeight: 700,
          lineHeight: '140%', color: '#FFFFFF', letterSpacing: 0,
        }}>
          {dateLabel}
        </span>
      </div>

      {/* 출발역 */}
      <p style={{
        position: 'absolute', top: 274, left: 81, width: 70, height: 56, margin: 0,
        fontFamily: FF, fontSize: 40, fontWeight: 700, lineHeight: '140%',
        color: '#000000', textAlign: 'center',
      }}>
        {info.departureStation}
      </p>

      {/* 출발 시간 */}
      <p style={{
        position: 'absolute', top: 332, left: 63, width: 106, height: 56, margin: 0,
        fontFamily: FF, fontSize: 40, fontWeight: 600, lineHeight: '140%',
        color: 'rgba(0,0,0,0.7)', textAlign: 'center',
      }}>
        {info.departureTime}
      </p>

      {/* 화살표 */}
      <img
        src={arrowStationImg}
        alt=""
        aria-hidden
        style={{ position: 'absolute', top: 272, left: 175 }}
      />

      {/* 도착역 */}
      <p style={{
        position: 'absolute', top: 274, left: 251, width: 70, height: 56, margin: 0,
        fontFamily: FF, fontSize: 40, fontWeight: 700, lineHeight: '140%',
        color: '#000000', textAlign: 'center', whiteSpace: 'nowrap',
      }}>
        {info.arrivalStation}
      </p>

      {/* 도착 시간 */}
      <p style={{
        position: 'absolute', top: 332, left: 229, width: 112, height: 56, margin: 0,
        fontFamily: FF, fontSize: 40, fontWeight: 600, lineHeight: '140%',
        color: 'rgba(0,0,0,0.7)', textAlign: 'center',
      }}>
        {info.arrivalTime}
      </p>

      {/* 구분선 위아래 */}
      <div style={{
        position: 'absolute', top: 404, left: 34,
        width: 334, height: 50,
        borderTop: '1px solid #44444480',
        borderBottom: '1px solid #44444480',
      }} />

      {/* KTX 열차 밴드 */}
      <div style={{
        position: 'absolute', top: 404, left: 34, width: 334, height: 50,
        background: '#286EF01A',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: FF, fontSize: 24, fontWeight: 700,
          lineHeight: '140%', color: '#000000',
        }}>
          {trainLabel}
        </span>
      </div>

      {/* 타는곳/호차번호/좌석번호 통합 컨테이너 */}
      <div style={{
        position: 'absolute', top: 472, left: 34, width: 334, height: 131,
        borderTop: '1px solid #44444480',
        borderBottom: '1px solid #44444480',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* 레이블 행 — 53px, #D0DEF9 배경 */}
        <div style={{
          height: 53, background: '#D0DEF9',
          display: 'flex', alignItems: 'center',
          borderBottom: '1px solid #44444480',
        }}>
          <div style={{ width: 107, textAlign: 'center' }}>
            <span style={{ fontFamily: FF, fontSize: 24, fontWeight: 700, color: '#0D111D' }}>타는곳</span>
          </div>
          <div style={{ width: 0, height: '100%', borderLeft: '1px solid #44444480' }} />
          <div style={{ width: 120, textAlign: 'center' }}>
            <span style={{ fontFamily: FF, fontSize: 24, fontWeight: 700, color: '#0D111D' }}>호차번호</span>
          </div>
          <div style={{ width: 0, height: '100%', borderLeft: '1px solid #44444480' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontFamily: FF, fontSize: 24, fontWeight: 700, color: '#0D111D' }}>좌석번호</span>
          </div>
        </div>

        {/* 값 행 — 나머지 높이 */}
        <div style={{
          flex: 1,
          display: 'flex', alignItems: 'center',
        }}>
          <div style={{ width: 107, textAlign: 'center' }}>
            <span style={{ fontFamily: FF, fontSize: 32, fontWeight: 700, color: '#286EF0' }}>{info.platform}번</span>
          </div>
          <div style={{ width: 0, height: '100%', borderLeft: '1px solid #44444480' }} />
          <div style={{ width: 120, textAlign: 'center' }}>
            <span style={{ fontFamily: FF, fontSize: 32, fontWeight: 700, color: '#286EF0' }}>{info.carNumber}호차</span>
          </div>
          <div style={{ width: 0, height: '100%', borderLeft: '1px solid #44444480' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontFamily: FF, fontSize: 32, fontWeight: 700, color: '#286EF0' }}>{info.seatNumber}</span>
          </div>
        </div>
      </div>

      {/* 일반실 | 순방향 | 경로할인 */}
      <p style={{
        position: 'absolute', top: 615, left: 40, width: 154, height: 21, margin: 0,
        fontFamily: FF, fontSize: 15, fontWeight: 500, lineHeight: '140%',
        color: '#818181',
      }}>
        {info.seatClass || '일반실'}
      </p>

      {/* 승차권번호 레이블 */}
      <p style={{
        position: 'absolute', top: 642, left: 40, width: 65, height: 21, margin: 0,
        fontFamily: FF, fontSize: 15, fontWeight: 500, lineHeight: '140%',
        color: '#818181',
      }}>
        승차권번호
      </p>

      {/* 승차권번호 값 */}
      <p style={{
        position: 'absolute', top: 642, left: 194, width: 168, height: 21, margin: 0,
        fontFamily: FF, fontSize: 15, fontWeight: 500, lineHeight: '140%',
        color: '#818181', textAlign: 'right',
      }}>
        {info.ticketNumber}
      </p>

      {/* 면책 문구 */}
      <p style={{
        position: 'absolute', top: 701, left: 87, width: 228, height: 34, margin: 0,
        fontFamily: FF, fontSize: 12, fontWeight: 500, lineHeight: '140%',
        color: '#818181', textAlign: 'center', whiteSpace: 'pre-line',
        letterSpacing: '-0.02em',
      }}>
        {'*본 정보는 실제 티켓을 대신할 수 없습니다.\n검표 시, 실물 티켓 및 모바일 티켓을 확인해주세요.'}
      </p>

      {/* 안내 시작 버튼 */}
      {hasRoute && (
        <FigmaPrimaryButton onClick={() => setStep('S4')}>안내 시작</FigmaPrimaryButton>
      )}
    </div>
  );
}

export default E1_StaticGuide;
