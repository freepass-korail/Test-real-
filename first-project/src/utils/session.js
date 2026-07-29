const SESSION_KEY = 'korail_guide_session';

/** 재접속 시 항상 처음부터 새로 시작해야 함 — 남아있던 routeSteps 복원이 GPS와 맞물려
 *  곧장 "도착" 상태로 튀는 문제가 있어, 세션 저장·복원을 전면 비활성화. */
export function saveSession() {
  /* no-op: 더 이상 저장하지 않음 */
}

export function loadSession() {
  return null;
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* 무시 */
  }
}
