/**
 * E4 — 이미 출발한 열차 (departure expired, hasTicketToday true but train already left)
 */
import useFlowStore from '../store/useFlowStore';
import FigmaHeader from './common/FigmaHeader';
import trainImg from '../assets/train-image.png';
import { typography } from '../styles/theme';

const FF = typography.fontFamily;

function E4_Departed() {
  const resetFlow = useFlowStore((s) => s.resetFlow);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#FFFFFF', overflow: 'hidden' }}>
      <FigmaHeader />

      {/* ── 원형 그라데이션 배경 ── */}
      <div style={{
        position: 'absolute', top: 213, left: 31,
        width: 340, height: 340, borderRadius: '50%',
        background: 'linear-gradient(180deg, #EF4C56 0%, #FBE2E6 100%)',
      }} />

      {/* ── 기차 이미지 ── */}
      <img
        src={trainImg}
        alt="기차"
        draggable={false}
        style={{
          position: 'absolute', top: 245, left: -5,
          width: 412, height: 309, objectFit: 'contain',
        }}
      />

      {/* ── 이미 출발한 열차입니다. ── */}
      <p style={{
        position: 'absolute', top: 597, left: 50, width: 301, height: 45,
        fontFamily: FF, fontSize: 32, fontWeight: 700,
        lineHeight: '140%', letterSpacing: 0,
        color: '#000000', textAlign: 'center', margin: 0,
      }}>
        <span style={{ color: '#EF4C56' }}>이미 출발한 열차</span>입니다.
      </p>

      {/* ── 해당 열차는 이미 출발하였습니다. ── */}
      <p style={{
        position: 'absolute', top: 646, left: 48, width: 306, height: 68,
        fontFamily: FF, fontSize: 24, fontWeight: 600,
        lineHeight: '140%', letterSpacing: '-0.02em',
        color: '#818181', textAlign: 'center', margin: 0,
        whiteSpace: 'pre-line',
      }}>
        {'해당 열차는 이미 출발하였습니다.\n이용해 주셔서 감사합니다.'}
      </p>

      {/* ── 닫기 버튼 ── */}
      <button
        type="button"
        onClick={resetFlow}
        style={{
          position: 'absolute', top: 760, left: 20,
          width: 362, height: 80, borderRadius: 100,
          background: '#595959', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <span style={{
          fontFamily: FF, fontSize: 24, fontWeight: 700,
          color: '#FFFFFF', letterSpacing: 1, lineHeight: '150%',
        }}>
          닫기
        </span>
      </button>
    </div>
  );
}

export default E4_Departed;
