/** guide/steps.states — 예외/도착 상태 코드 (BE GuideStateMessage.state) */
export const GUIDE_STATE = {
  DEPARTURE_TIME_PASSED: 'DEPARTURE_TIME_PASSED',
  DESTINATION_PASSED: 'DESTINATION_PASSED',
  OFF_ROUTE: 'OFF_ROUTE',
  ARRIVED: 'ARRIVED',
};

/** UI 폴백 (states 미로드 시) */
export const GUIDE_STATE_FALLBACK = {
  [GUIDE_STATE.DEPARTURE_TIME_PASSED]: '출발 시간이 지났습니다.',
  [GUIDE_STATE.DESTINATION_PASSED]: '도착지를 지나쳤습니다.',
  [GUIDE_STATE.OFF_ROUTE]: '경로를 이탈했습니다.',
  [GUIDE_STATE.ARRIVED]: '탑승 승강장에 도착했습니다.',
};

/**
 * @param {Array<{ state?: string, screenText?: string, voiceText?: string, audioBase64?: string, hasAudio?: boolean }>|null|undefined} states
 * @returns {Record<string, { screenText: string, voiceText: string, audioBase64: string|null, hasAudio: boolean }>}
 */
export function normalizeGuideStates(states) {
  const map = {};
  if (!Array.isArray(states)) return map;
  for (const s of states) {
    if (!s?.state) continue;
    const audioBase64 = s.audioBase64 || null;
    map[String(s.state)] = {
      screenText: String(s.screenText ?? ''),
      voiceText: String(s.voiceText ?? s.screenText ?? ''),
      audioBase64,
      hasAudio: s.hasAudio ?? Boolean(audioBase64),
    };
  }
  return map;
}

/**
 * @param {Record<string, { screenText?: string }>|null|undefined} guideStateMap
 * @param {string} stateKey
 * @returns {string}
 */
export function getGuideStateScreenText(guideStateMap, stateKey) {
  const fromBe = guideStateMap?.[stateKey]?.screenText;
  if (fromBe) return fromBe;
  return GUIDE_STATE_FALLBACK[stateKey] || '';
}
