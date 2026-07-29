/**
 * E5 — 안내 종료된 열차 (승차권 만료 / 이미 완료된 안내 재진입 시)
 */
import checkImg from '../assets/check-arrived.png';
import useFlowStore from '../store/useFlowStore';
import FigmaHeader from './common/FigmaHeader';
import { typography } from '../styles/theme';

const FF = typography.fontFamily;
const BLUE = '#286EF0';
const RED = '#EF4C56';

function E5_GuideDone() {
  const resetFlow = useFlowStore((s) => s.resetFlow);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#FFFFFF', overflow: 'hidden' }}>
      <FigmaHeader />

      {/* 리플 링 */}
      <div style={{
        position: 'absolute', top: 208, left: 20,
        width: 362, height: 362, borderRadius: 180,
        background: '#286EF080',
      }} />
      <div style={{
        position: 'absolute', top: 247, left: 59,
        width: 283, height: 283, borderRadius: 180,
        background: '#286EF080',
      }} />

      {/* 파란 원 + 흰 체크 정중앙 */}
      <div style={{
        position: 'absolute', top: 294, left: 109,
        width: 184, height: 184, borderRadius: 180,
        background: BLUE,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <img
          src={checkImg}
          alt=""
          style={{
            width: 99, height: 91, objectFit: 'contain',
            filter: 'brightness(0) invert(1)',
          }}
        />
      </div>

      {/* 안내가 종료된 열차예요. 새로 확인해 주세요. */}
      <p style={{
        position: 'absolute', top: 594, left: 47, width: 307, height: 90,
        fontFamily: FF, fontSize: 32, fontWeight: 700,
        lineHeight: '140%', letterSpacing: 0,
        color: '#000000', textAlign: 'center', margin: 0,
        whiteSpace: 'pre-line',
      }}>
        안내가 <span style={{ color: RED }}>종료된 열차</span>예요.{'\n'}새로 확인해 주세요.
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

export default E5_GuideDone;
