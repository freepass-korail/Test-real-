let currentAudio = null;
/** 따라잡기용 순차 재생 큐 */
let audioQueue = [];
let queuePlaying = false;

/** base64 → 미리 로드된 Audio 엘리먼트 */
const preloadedAudioByBase64 = new Map();

function buildAudioElement(base64) {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.load();
    return audio;
  } catch (err) {
    console.warn('[TTS] 프리로드 실패:', err);
    return null;
  }
}

/**
 * guide/steps 로드 직후 — Audio 엘리먼트를 미리 만들어 재생 지연 제거
 * @param {Record<string, string>} audioMap
 */
export function preloadAudioMap(audioMap = {}) {
  Object.values(audioMap).forEach((base64) => {
    if (!base64 || preloadedAudioByBase64.has(base64)) return;
    const el = buildAudioElement(base64);
    if (el) preloadedAudioByBase64.set(base64, el);
  });
  console.log('[TTS] 오디오 프리로드', preloadedAudioByBase64.size, '개');
}

function stopCurrentAudioSync() {
  const prev = currentAudio;
  currentAudio = null;
  if (!prev) return;
  try {
    prev.onended = null;
    prev.pause();
    prev.currentTime = 0;
  } catch {
    /* ignore */
  }
}

function playOneBase64(base64, { onEnded } = {}) {
  if (!base64) {
    onEnded?.();
    return;
  }

  stopCurrentAudioSync();

  try {
    let audio = preloadedAudioByBase64.get(base64);
    if (audio) {
      // 프리로드된 엘리먼트 재사용
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        /* ignore */
      }
    } else {
      audio = buildAudioElement(base64) ?? new Audio(`data:audio/mpeg;base64,${base64}`);
      if (base64) preloadedAudioByBase64.set(base64, audio);
    }

    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      onEnded?.();
    };

    currentAudio = audio;
    const playResult = audio.play();
    if (playResult?.catch) {
      playResult.catch((err) => {
        if (err.name === 'NotAllowedError') {
          console.warn('[TTS] 자동재생 차단 — S5 화면을 한 번 탭하세요');
        } else if (err.name !== 'AbortError') {
          console.warn('[TTS] 오디오 재생 실패:', err);
        }
        onEnded?.();
      });
    }
  } catch (err) {
    console.warn('[TTS] 오디오 생성 실패:', err);
    onEnded?.();
  }
}

function drainAudioQueue() {
  if (queuePlaying) return;
  if (!audioQueue.length) return;

  queuePlaying = true;
  const next = audioQueue.shift();
  playOneBase64(next, {
    onEnded: () => {
      queuePlaying = false;
      drainAudioQueue();
    },
  });
}

/**
 * base64 MP3 — 이전 재생·큐 중단 후 즉시 재생
 * @param {string | null | undefined} base64
 */
export function playBase64Audio(base64) {
  if (!base64) return;
  audioQueue = [];
  queuePlaying = false;
  playOneBase64(base64);
}

/**
 * 통과 안내 재생.
 * 체감 지연 방지를 위해 항상 **최신 1개만** 즉시 재생한다.
 * (밀린 안내는 화면 문구·거리로 따라잡고, 음성은 현재 위치 안내만)
 * @param {Array<string | null | undefined>} base64List
 */
export function playBase64AudioQueue(base64List = []) {
  const items = base64List.filter(Boolean);
  if (!items.length) return;

  const latest = items[items.length - 1];
  if (items.length > 1) {
    console.info(`[TTS] 밀린 ${items.length}개 → 최신 1개만 즉시 재생`);
  }

  audioQueue = [];
  queuePlaying = false;
  playOneBase64(latest);
}

/** 현재 재생 중인 오디오·큐를 중단합니다. */
export function stopAudio() {
  audioQueue = [];
  queuePlaying = false;
  stopCurrentAudioSync();
}
