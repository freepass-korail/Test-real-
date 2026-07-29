/** 도착 시 햅틱 피드백 (Android Chrome 등 — iOS Safari 미지원) */
export function vibrateOnArrival() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([300, 100, 300]);
  }
}
