import { useEffect, useState } from 'react';
import { typography } from '../../styles/theme';

const FF = typography.fontFamily;

export default function NetworkOfflineOverlay() {
  const [offline, setOffline] = useState(() => !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline  = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online',  goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 9999,
      background: '#00000080',
    }}>
      {/* 중앙 카드 */}
      <div style={{
        position: 'absolute',
        top: 337, left: 43,
        width: 320, height: 179,
        borderRadius: 20,
        background: '#FFFFFFCC',
      }}>
        {/* 안내 문구 */}
        <p style={{
          position: 'absolute',
          top: 364 - 337, left: 118 - 43,
          width: 169, height: 54, margin: 0,
          fontFamily: FF, fontSize: 18, fontWeight: 700,
          lineHeight: '150%', letterSpacing: 0,
          color: '#000000', textAlign: 'center',
          whiteSpace: 'pre-line',
        }}>
          {'연결이 잠시 끊겼어요.\n다시 연결 중이에요.'}
        </p>

        {/* 스피너 */}
        <div style={{
          position: 'absolute',
          top: 434 - 337, left: 177 - 43,
          width: 49, height: 49,
        }}>
          <Spinner />
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  const size = 49;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // 원 둘레의 약 1/4만 보이게 고정 → 한 방향으로만 회전
  const arc = c * 0.25;

  return (
    <>
      <style>{`
        @keyframes spinRing {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
        {/* 회색 트랙 */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="#C6C6C6" strokeWidth={stroke}
        />
        {/* 파란 호 — 한 방향으로 계속 한 바퀴 */}
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="#286EF0" strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${c - arc}`}
          style={{
            transformOrigin: 'center',
            animation: 'spinRing 1s linear infinite',
          }}
        />
      </svg>
    </>
  );
}
