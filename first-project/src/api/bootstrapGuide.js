import {
  fetchUserGuide,
  fetchUserGuideSteps,
  fetchTicketGuide,
  fetchTicketGuideSteps,
  fetchTts,
} from './tickets';
import useFlowStore from '../store/useFlowStore';
import { clearSession } from '../utils/session';
import { resolveStepIndexFromProgress } from '../utils/geo';

/**
 * BE guide/steps가 route 첫 노드(출발)를 빼먹는 경우 —
 * route directions 문구로 화면/음성을 채운다. (현재 BE는 steps가 n02부터)
 */
function fillMissingStartGuide(audioMap, screenTextMap, routeSteps) {
  if (!routeSteps?.length) return { audioMap, screenTextMap, startId: null, startText: null };

  for (const step of routeSteps) {
    const id = step?.nodeId;
    if (!id) continue;
    if (!screenTextMap[id] && step.instruction) {
      screenTextMap[id] = step.instruction;
    }
  }

  const startId = routeSteps[0]?.nodeId || null;
  const startText =
    (startId && screenTextMap[startId]) || routeSteps[0]?.instruction || null;
  return { audioMap, screenTextMap, startId, startText };
}

/** 출발 노드 음성이 없으면 /api/tts 로 합성 후 audioMap에 합친다 */
function synthesizeStartAudioIfNeeded(startId, startText) {
  if (!startId || !startText) return;
  const { audioMap } = useFlowStore.getState();
  if (audioMap[startId]) return;

  fetchTts(startText)
    .then((audioBase64) => {
      if (!audioBase64 || typeof audioBase64 !== 'string') return;
      const state = useFlowStore.getState();
      if (state.audioMap[startId]) return;
      state.setAudioMap({ ...state.audioMap, [startId]: audioBase64 });
      console.log('[TTS] start fallback synthesized', startId);

      // S5에서 출발 안내를 이미 시도했는데 음성이 없었던 경우 재시도
      const onNav = state.step === 'S5' || state.step === 'S5_1';
      if (
        onNav &&
        state.announcedPassIndex === 0 &&
        state.routeSteps[0]?.nodeId === startId
      ) {
        state.playCurrentStepAudio();
      }
    })
    .catch((err) => {
      console.warn('[TTS] start fallback 합성 실패:', err);
    });
}

/**
 * URL에서 ticketId 추출 (?ticketId=19 또는 ?ticket=19)
 * 문자 링크 진입용
 * @returns {number | null}
 */
export function getTicketIdFromUrl(search = window.location.search) {
  const params = new URLSearchParams(search);
  const raw = params.get('ticketId') ?? params.get('ticket');
  if (!raw) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

/**
 * URL에서 userId 추출 (?userId=1 또는 ?user=1) — 레거시/디버그
 * @returns {number | null}
 */
export function getUserIdFromUrl(search = window.location.search) {
  const params = new URLSearchParams(search);
  const raw = params.get('userId') ?? params.get('user');
  if (!raw) return null;
  const id = Number(raw);
  return id > 0 ? id : null;
}

export function applyGuideSteps(stepsRes) {
  const {
    setAudioMap,
    setScreenTextMap,
    setGuideStateMap,
    routeSteps,
    step: uiStep,
    isTracking,
    screenTextMap: prevScreenText,
  } = useFlowStore.getState();

  // 예외 상태 카탈로그는 steps와 독립 — 빈 steps여도 적용
  if (Array.isArray(stepsRes?.states)) {
    setGuideStateMap(stepsRes.states);
  }

  if (!stepsRes?.steps?.length) {
    console.warn('[TTS] guide/steps 응답 없음 또는 steps 빈 배열', stepsRes);
    return;
  }

  const audioMap = {};
  const screenTextMap = {};
  stepsRes.steps.forEach((s) => {
    if (!s.nodeId) return;
    if (s.audioBase64) audioMap[s.nodeId] = s.audioBase64;
    if (s.screenText) screenTextMap[s.nodeId] = s.screenText;
  });

  const filled = fillMissingStartGuide(audioMap, screenTextMap, routeSteps);

  console.log(
    '[TTS] guide/steps 로드 완료 | steps:',
    stepsRes.steps.length,
    '| audioMap keys:',
    Object.keys(filled.audioMap),
    '| screenTextMap keys:',
    Object.keys(filled.screenTextMap),
    '| states:',
    (stepsRes.states || []).map((s) => s.state),
    filled.startId && !audioMap[filled.startId]
      ? `| startFallback=${filled.startId}`
      : '',
  );

  setAudioMap(filled.audioMap);
  setScreenTextMap(filled.screenTextMap);
  synthesizeStartAudioIfNeeded(filled.startId, filled.startText);

  if (!routeSteps?.length) {
    return;
  }

  // S5 추적 중이 아니면 항상 출발(n01) 문구로 — 세션/비동기 로드로 중간 구간이 끼는 것 방지
  const navigating = (uiStep === 'S5' || uiStep === 'S5_1') && isTracking;
  if (!navigating) {
    const firstId = routeSteps[0]?.nodeId;
    const firstText =
      (firstId && filled.screenTextMap[firstId]) ||
      (firstId && prevScreenText?.[firstId]) ||
      routeSteps[0]?.instruction ||
      '';
    useFlowStore.setState({
      progressM: 0,
      announcedPassIndex: 0,
      currentStepIndex: routeSteps.length > 1 ? 1 : 0,
      currentInstruction: firstText,
    });
    return;
  }

  const { progressM, syncFromProgress, routeSteps: stepsNow } = useFlowStore.getState();
  if (stepsNow?.length && progressM != null) {
    const { passedIndex, targetIndex, guideIndex } = resolveStepIndexFromProgress(
      progressM,
      stepsNow,
    );
    syncFromProgress(
      { progressM, passedIndex, targetIndex, guideIndex },
      { playAudio: false },
    );
  }
}

/**
 * guide 응답 반영 + steps(TTS) 백그라운드 로드
 * @param {object} guide normalizeUserGuide 결과
 * @param {() => Promise<object>} fetchSteps
 * @param {string} [audioFallbackUrl] routeFound=false 시 전체 안내 음성 URL
 * @returns {Promise<'S1' | 'E1' | 'E3'>}
 */
async function applyGuideBootstrap(guide, fetchSteps, audioFallbackUrl) {
  const { setReservation, setRoute } = useFlowStore.getState();

  if (guide.hasTicketToday === false) {
    return 'E3';
  }

  setReservation(guide.reservationId, guide.ticket, guide.fromNode, guide.toNode);

  if (guide.route) {
    setRoute(guide.route);
  }

  fetchSteps()
    .then(applyGuideSteps)
    .catch((err) => {
      console.warn('[guide/steps] 음성 데이터 로드 실패 (계속 진행):', err);
    });

  if (!guide.routeFound) {
    if (audioFallbackUrl) {
      try {
        const audio = new Audio(audioFallbackUrl);
        audio.play().catch((err) => console.warn('[TTS] 안내 음성 재생 실패:', err));
      } catch (err) {
        console.warn('[TTS] 안내 음성 생성 실패:', err);
      }
    }
    return 'E1';
  }

  console.log(
    '[bootstrap] 승차권 반영 완료',
    guide.ticket?.ticketNumber,
    guide.ticket?.departureStation,
    '→',
    guide.ticket?.arrivalStation,
    '| platform',
    guide.ticket?.platform,
    '| car',
    guide.ticket?.carNumber,
  );

  return 'S1';
}

/**
 * 문자 링크용 — 승차권 ID 기준
 * GET /api/tickets/{ticketId}/guide + /guide/steps
 * @param {number} ticketId
 * @returns {Promise<'S1' | 'E1' | 'E3'>}
 */
export async function bootstrapTicketGuide(ticketId) {
  clearSession();
  // sessionStorage만 지우면 메모리에 남은 progress/문구가 S5 시작 문구를 오염시킴
  useFlowStore.setState({
    progressM: 0,
    announcedPassIndex: 0,
    currentStepIndex: 0,
    currentInstruction: '',
    audioMap: {},
    screenTextMap: {},
    guideStateMap: {},
    lastPlayedGuideState: null,
    _stepAudioDedup: null,
  });
  const guide = await fetchTicketGuide(ticketId);
  return applyGuideBootstrap(
    guide,
    () => fetchTicketGuideSteps(ticketId),
    null, // tickets/{id}/guide/audio 는 BE에 없음
  );
}

/**
 * 유저 기준 (레거시) — 오늘 승차권 자동 선택
 * GET /api/users/{userId}/guide + /guide/steps
 * @param {number} userId
 * @returns {Promise<'S1' | 'E1' | 'E3'>}
 */
export async function bootstrapUserGuide(userId) {
  clearSession();
  useFlowStore.setState({
    progressM: 0,
    announcedPassIndex: 0,
    currentStepIndex: 0,
    currentInstruction: '',
    audioMap: {},
    screenTextMap: {},
    guideStateMap: {},
    lastPlayedGuideState: null,
    _stepAudioDedup: null,
  });
  const guide = await fetchUserGuide(userId);
  return applyGuideBootstrap(
    guide,
    () => fetchUserGuideSteps(userId),
    `/api/users/${userId}/guide/audio`,
  );
}

/**
 * URL 쿼리 우선순위: ticketId → userId
 * @returns {Promise<'S1' | 'E1' | 'E3' | null>} null = 쿼리 없음 (부트스트랩 스킵)
 */
export async function bootstrapFromUrl(search = window.location.search) {
  const ticketId = getTicketIdFromUrl(search);
  if (ticketId) {
    console.log('[bootstrap] ticketId=', ticketId, '→ /api/tickets/{id}/guide');
    return bootstrapTicketGuide(ticketId);
  }
  const userId = getUserIdFromUrl(search);
  if (userId) {
    console.log('[bootstrap] userId=', userId, '→ /api/users/{id}/guide (레거시)');
    return bootstrapUserGuide(userId);
  }
  return null;
}
