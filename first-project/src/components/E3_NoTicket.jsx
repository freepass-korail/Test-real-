/**
 * E3 — 승차권 확인 불가 (hasTicketToday: false 또는 API 오류)
 */
import useFlowStore from '../store/useFlowStore';
import FigmaHeader from './common/FigmaHeader';
import { typography } from '../styles/theme';

const FF = typography.fontFamily;

function E3_NoTicket() {
  const resetFlow = useFlowStore((s) => s.resetFlow);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#FFFFFF', overflow: 'hidden' }}>
      <FigmaHeader />

      {/* 리플 링 */}
      <div style={{
        position: 'absolute', top: 208, left: 20,
        width: 362, height: 362, borderRadius: 180,
        background: '#EF4C5680',
      }} />
      <div style={{
        position: 'absolute', top: 247, left: 59,
        width: 283, height: 283, borderRadius: 180,
        background: '#EF4C5680',
      }} />
      <div style={{
        position: 'absolute', top: 294, left: 109,
        width: 184, height: 184, borderRadius: 180,
        background: '#EF4C56',
      }} />

      {/* ? 아이콘 */}
      <div style={{
        position: 'absolute', top: 260, left: 151,
        width: 103, height: 267,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: FF, fontSize: 190.93, fontWeight: 700,
          color: '#FFFFFF', lineHeight: '140%', letterSpacing: 0,
          textAlign: 'center', userSelect: 'none',
        }}>
          ?
        </span>
      </div>

      {/* 승차권을 확인할 수 없습니다. */}
      <p style={{
        position: 'absolute', top: 594, left: 77, width: 246, height: 90,
        fontFamily: FF, fontSize: 32, fontWeight: 700,
        lineHeight: '140%', letterSpacing: 0,
        color: '#000000', textAlign: 'center', margin: 0,
        whiteSpace: 'pre-line',
      }}>
        {'승차권을\n확인할 수 없습니다.'}
      </p>

      {/* 이용해 주셔서 감사합니다. */}
      <p style={{
        position: 'absolute', top: 688, left: 81, width: 240, height: 34,
        fontFamily: FF, fontSize: 24, fontWeight: 600,
        lineHeight: '140%', letterSpacing: '-0.02em',
        color: '#818181', textAlign: 'center', margin: 0,
      }}>
        이용해 주셔서 감사합니다.
      </p>

      {/* 닫기 버튼 */}
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

export default E3_NoTicket;
