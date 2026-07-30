import { create } from 'zustand';
import { playBase64Audio, playBase64AudioQueue, preloadAudioMap } from '../utils/audio';
import { clearSession, loadSession, saveSession } from '../utils/session';
import { ensureStepDistances } from '../utils/geo';
import { normalizeGuideStates } from '../utils/guideStates';

const emptyTicket = {
  trainName: '',
  travelDate: '',
  departureStation: '',
  arrivalStation: '',
  departureTime: '',
  arrivalTime: '',
  platform: '',
  carNumber: '',
  seatNumber: '',
  seatClass: '',
  ticketNumber: '',
};

function stepToDestination(step) {
  if (!step) return null;
  return {
    lat: step.lat,
    lng: step.lng,
    label: step.name ?? '',
  };
}

const _saved = loadSession();

const useFlowStore = create((set, get) => ({
  step: (_saved?.step && _saved.step !== 'SMS' ? _saved.step : null) ?? 'S1',
  mapInstance: null,
  voiceGuide: _saved?.voiceGuide ?? true,

  reservationId: _saved?.reservationId ?? null,
  ticketInfo: _saved?.ticketInfo ?? { ...emptyTicket },
  fromNode: _saved?.fromNode ?? null,
  toNode: _saved?.toNode ?? null,

  routeId: _saved?.routeId ?? null,
  routeSteps: _saved?.routeSteps ?? [],
  totalDistanceM: _saved?.totalDistanceM ?? null,
  currentStepIndex: _saved?.currentStepIndex ?? 0,
  /** 통과선(cum)까지 음성으로 따라잡은 마지막 노드 인덱스 */
  announcedPassIndex: _saved?.announcedPassIndex ?? 0,
  /** 경로상 진행거리 s(m) */
  progressM: _saved?.progressM ?? 0,
  currentInstruction: _saved?.currentInstruction ?? '',
  routeLoading: false,
  routeError: null,
  audioMap: _saved?.audioMap ?? {},
  screenTextMap: _saved?.screenTextMap ?? {},
  /** guide/steps.states — OFF_ROUTE / DESTINATION_PASSED / DEPARTURE_TIME_PASSED / ARRIVED */
  guideStateMap: {},
  /** 현재 재생한 예외 상태 (같은 상태 반복 재생 방지, 복귀 시 클리어) */
  lastPlayedGuideState: null,

  destination: (() => {
    if (!_saved?.routeSteps?.length) return null;
    return stepToDestination(_saved.routeSteps[_saved.currentStepIndex ?? 0]);
  })(),
  position: null,
  heading: 0,
  headingReady: _saved?.headingReady ?? false,
  bearing: null,
  distanceM: null,
  destinationAngle: 0,
  isTracking: false,
  geoError: null,
  overshoot: false,
  altRoute: false,

  setStep: (nextStep) => {
    set({ step: nextStep });
    saveSession({ ...get(), step: nextStep });
  },

  setReservation: (id, info, fromNode = null, toNode = null) => {
    set({
      reservationId: id,
      ticketInfo: { ...emptyTicket, ...info },
      fromNode,
      toNode,
    });
    saveSession({ ...get() });
  },

  setRouteLoading: (routeLoading) => set({ routeLoading }),
  setRouteError: (routeError) => set({ routeError }),

  setAudioMap: (audioMap) => {
    set({ audioMap });
    preloadAudioMap(audioMap);
  },

  setScreenTextMap: (screenTextMap) => set({ screenTextMap }),

  setGuideStateMap: (statesOrMap) => {
    const guideStateMap = Array.isArray(statesOrMap)
      ? normalizeGuideStates(statesOrMap)
      : statesOrMap || {};
    set({ guideStateMap, lastPlayedGuideState: null });
    const preload = {};
    Object.entries(guideStateMap).forEach(([key, entry]) => {
      if (entry?.audioBase64) preload[key] = entry.audioBase64;
    });
    if (Object.keys(preload).length) {
      preloadAudioMap(preload);
      console.log('[TTS] guide states 프리로드', Object.keys(preload));
    }
  },

  /**
   * 예외 상태 TTS — 진입 시에만 1회 재생 (동일 state 유지 중 재호출 무시)
   * @param {string | null} stateKey GUIDE_STATE.*
   */
  playGuideState: (stateKey) => {
    const { guideStateMap, voiceGuide, lastPlayedGuideState } = get();
    if (!stateKey || !voiceGuide) return;
    if (lastPlayedGuideState === stateKey) return;

    const entry = guideStateMap?.[stateKey];
    set({ lastPlayedGuideState: stateKey });

    if (!entry?.audioBase64) {
      console.warn('[TTS] guide state audio 없음:', stateKey, entry);
      return;
    }
    console.log('[TTS] guide state play:', stateKey);
    playBase64Audio(entry.audioBase64);
  },

  clearGuideStateAnnounce: () => set({ lastPlayedGuideState: null }),

  setRoute: (route) => {
    const steps = ensureStepDistances(route?.steps ?? []);
    const first = steps[0] ?? null;
    const { screenTextMap } = get();

    const firstInstruction =
      (first?.nodeId && screenTextMap[first.nodeId]) ?? first?.instruction ?? '';

    // 출발 시 화살표는 다음 노드(있으면)를 향함
    const target = steps.length > 1 ? steps[1] : first;

    set({
      routeId: route?.routeId ?? null,
      routeSteps: steps,
      totalDistanceM: route?.totalDistanceM ?? null,
      currentStepIndex: steps.length > 1 ? 1 : 0,
      announcedPassIndex: 0,
      progressM: 0,
      currentInstruction: firstInstruction,
      destination: stepToDestination(target),
      routeError: null,
      // GPS 확보 전 null — S5 opacity / "위치 확인 중" 장치
      distanceM: null,
      bearing: null,
      destinationAngle: 0,
      headingReady: false,
      overshoot: false,
      altRoute: false,
    });
    saveSession(get());
  },

  getCurrentStep: () => {
    const { routeSteps, currentStepIndex } = get();
    return routeSteps[currentStepIndex] ?? null;
  },

  /**
   * 경로 진행거리 s로 목표 노드·안내·음성을 동기화한다.
   * - 인덱스를 +1씩만 올리지 않고, s로 역산한 노드를 바로 반영
   * - 통과선을 여러 개 건너뛰면 밀린 음성을 순서대로 큐 재생
   * - 되돌아갔다가 재진입하면 announced를 되감아 다시 안내
   *
   * @param {{ progressM: number, passedIndex: number, targetIndex: number, guideIndex: number }} payload
   * @param {{ playAudio?: boolean }} [options]
   */
  syncFromProgress: (payload, { playAudio = true } = {}) => {
    const {
      routeSteps,
      announcedPassIndex,
      audioMap,
      screenTextMap,
      voiceGuide,
      currentStepIndex,
      currentInstruction,
    } = get();
    if (!routeSteps.length) return false;

    const lastIdx = routeSteps.length - 1;
    const passedIndex = Math.max(0, Math.min(lastIdx, Number(payload.passedIndex) || 0));
    const targetIndex = Math.max(0, Math.min(lastIdx, Number(payload.targetIndex) || 0));
    const guideIndex = Math.max(
      0,
      Math.min(lastIdx, Number(payload.guideIndex ?? passedIndex) || 0),
    );
    const progressM = Math.max(0, Number(payload.progressM) || 0);

    const guide = routeSteps[guideIndex];
    const target = routeSteps[targetIndex];
    const instruction =
      (guide?.nodeId && screenTextMap[guide.nodeId]) ?? guide?.instruction ?? '';

    let nextAnnounced = announcedPassIndex;

    // 되돌아감 → 안내 포인터 되감아 재진입 시 다시 울리게
    if (passedIndex < announcedPassIndex) {
      nextAnnounced = passedIndex;
      console.log('[TTS] 되돌아감 — announcedPassIndex', announcedPassIndex, '→', nextAnnounced);
      set({ _stepAudioDedup: null });
    }

    // 통과선을 새로 지남 → 최신 안내 음성 (사전 로드된 base64, 실시간 TTS API 아님)
    const newlyPassed = [];
    if (playAudio && voiceGuide && passedIndex > nextAnnounced) {
      let mapHasAny = false;
      for (let i = 0; i < routeSteps.length; i += 1) {
        if (audioMap[routeSteps[i]?.nodeId]) {
          mapHasAny = true;
          break;
        }
      }
      if (!mapHasAny) {
        console.warn('[TTS] audioMap 미준비 — 음성만 보류, 화면 안내는 갱신');
      } else {
        for (let i = nextAnnounced + 1; i <= passedIndex; i += 1) {
          const nodeId = routeSteps[i]?.nodeId;
          const audio = nodeId ? audioMap[nodeId] : null;
          if (audio) newlyPassed.push(audio);
          console.log('[TTS] pass', i, nodeId, audio ? 'OK' : 'NO_AUDIO');
        }
      }
      // 화면/인덱스는 audio와 무관하게 통과선까지 진행
      nextAnnounced = passedIndex;
    }

    const indexChanged = targetIndex !== currentStepIndex;
    const announcedChanged = nextAnnounced !== announcedPassIndex;
    const instructionChanged = instruction !== currentInstruction;

    // 화면 문구·목표를 먼저 갱신 (음성과 분리 — 안내가 n02에 멈추는 문제 방지)
    if (indexChanged || announcedChanged || instructionChanged || progressM !== get().progressM) {
      set({
        currentStepIndex: targetIndex,
        announcedPassIndex: nextAnnounced,
        progressM,
        currentInstruction: instruction,
        destination: stepToDestination(target),
      });
    }

    if (newlyPassed.length) {
      playBase64AudioQueue(newlyPassed);
    }

    return indexChanged || newlyPassed.length > 0;
  },

  /**
   * GPS 재계산 결과로 현재 목표 노드를 설정 (앞/뒤 모두 가능)
   * @deprecated syncFromProgress 사용 권장
   * @param {number} nextIndex
   * @param {{ playAudio?: boolean }} [options]
   * @returns {boolean} 인덱스가 바뀌었으면 true
   */
  setActiveStepIndex: (nextIndex, { playAudio = true } = {}) => {
    const { routeSteps, currentStepIndex, audioMap, screenTextMap, voiceGuide } = get();
    if (!routeSteps.length) return false;

    const clamped = Math.max(0, Math.min(routeSteps.length - 1, Number(nextIndex) || 0));
    if (clamped === currentStepIndex) return false;

    const target = routeSteps[clamped];
    const instruction =
      (target?.nodeId && screenTextMap[target.nodeId]) ?? target?.instruction ?? '';

    set({
      currentStepIndex: clamped,
      announcedPassIndex: Math.max(0, clamped - 1),
      currentInstruction: instruction,
      destination: stepToDestination(target),
    });

    if (playAudio && voiceGuide) {
      const audio = audioMap[target?.nodeId];
      console.log(
        '[TTS] setActiveStepIndex',
        currentStepIndex,
        '→',
        clamped,
        '| nodeId:',
        target?.nodeId,
        '| audio 있음:',
        !!audio,
      );
      if (audio) playBase64Audio(audio);
    }

    saveSession(get());
    return true;
  },

  advanceStep: () => {
    const { currentStepIndex, setActiveStepIndex } = get();
    return setActiveStepIndex(currentStepIndex + 1, { playAudio: true });
  },

  playCurrentStepAudio: () => {
    const { routeSteps, announcedPassIndex, audioMap, voiceGuide, _stepAudioDedup } = get();
    if (!voiceGuide) return;
    // 출발 안내는 통과 노드(보통 0번) 음성
    const idx = Math.max(0, Math.min(routeSteps.length - 1, announcedPassIndex));
    const nodeId = routeSteps[idx]?.nodeId;
    const audio = audioMap[nodeId];
    console.log(
      '[TTS] playCurrentStepAudio nodeId:',
      nodeId,
      '| audio 있음:',
      !!audio,
      '| audioMap keys:',
      Object.keys(audioMap),
    );
    if (!audio || !nodeId) return;

    // StrictMode 이중 mount / 연속 호출로 같은 출발 안내가 두 번 재생되는 것 방지
    const now = Date.now();
    if (
      _stepAudioDedup?.nodeId === nodeId &&
      now - (_stepAudioDedup.at || 0) < 2500
    ) {
      console.log('[TTS] playCurrentStepAudio skip duplicate', nodeId);
      return;
    }
    set({ _stepAudioDedup: { nodeId, at: now } });
    playBase64Audio(audio);
  },

  toggleVoiceGuide: () => set((state) => ({ voiceGuide: !state.voiceGuide })),

  setMapInstance: (map) => set({ mapInstance: map }),

  setNavigation: (payload) => set((state) => ({ ...state, ...payload })),

  setGeoError: (geoError) => set({ geoError }),

  moveToLocation: (lat, lng) => {
    const map = get().mapInstance;
    if (map) {
      map.panTo?.({ lat, lng });
    }
  },

  resetFlow: () => {
    clearSession();
    set({
      step: 'S1',
      reservationId: null,
      ticketInfo: { ...emptyTicket },
      fromNode: null,
      toNode: null,
      routeId: null,
      routeSteps: [],
      totalDistanceM: null,
      currentStepIndex: 0,
      announcedPassIndex: 0,
      progressM: 0,
      currentInstruction: '',
      routeLoading: false,
      routeError: null,
      audioMap: {},
      screenTextMap: {},
      guideStateMap: {},
      lastPlayedGuideState: null,
      _stepAudioDedup: null,
      destination: null,
      position: null,
      heading: 0,
      headingReady: false,
      bearing: null,
      distanceM: null,
      destinationAngle: 0,
      isTracking: false,
      geoError: null,
      overshoot: false,
      altRoute: false,
    });
  },
}));

export default useFlowStore;
