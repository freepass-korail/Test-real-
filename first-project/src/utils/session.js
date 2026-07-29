const SESSION_KEY = 'korail_guide_session';

/** audioMap/screenTextMap은 base64라 수 MB — 네비 중 매 저장 시 UI/TTS가 멈춘 것처럼 느려짐. 제외.
 *  ticketInfo(승차권 개인정보)도 storage에 남기지 않음.
 *  progress/안내 문구는 재진입 시 출발부터 다시 (중간 구간 문구가 안내 시작에 뜨는 문제 방지). */
const PERSIST_KEYS = [
  'step',
  'reservationId',
  'fromNode',
  'toNode',
  'routeId',
  'routeSteps',
  'totalDistanceM',
  'voiceGuide',
];

/** S5_1(도착)은 종료 화면 — 복원하면 새로고침마다 도착부터 뜸. 저장·재개 대상에서 제외. */
const RESUMABLE_STEPS = new Set(['S3', 'S4', 'S5', 'E1', 'E2']);

export function saveSession(state) {
  if (!RESUMABLE_STEPS.has(state.step)) return;

  try {
    const snapshot = {};
    PERSIST_KEYS.forEach((k) => {
      snapshot[k] = state[k];
    });
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    /* 저장 실패 무시 */
  }
}

export function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // 예전에 저장된 도착 화면은 길찾기(S5)로 되돌림
    if (data.step === 'S5_1') {
      data.step = 'S5';
    }
    if (!RESUMABLE_STEPS.has(data.step)) return null;
    // 민감·진행 상태는 복원하지 않음
    delete data.ticketInfo;
    delete data.progressM;
    delete data.currentInstruction;
    delete data.announcedPassIndex;
    delete data.currentStepIndex;
    return data;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* 무시 */
  }
}
