import { apiRequest } from './client';
import { normalizeApiTicket, normalizeUserGuide, normalizePath } from './normalize';

/**
 * 유저의 승차권 목록 조회 (출발 시각 내림차순)
 * GET /api/users/{userId}/tickets
 * @param {number} userId
 */
export async function fetchUserTickets(userId) {
  if (!userId) throw new Error('userId가 없습니다.');
  const data = await apiRequest(`/api/users/${userId}/tickets`);
  return Array.isArray(data) ? data.map(normalizeApiTicket) : [];
}

/**
 * guide API 쿼리 문자열
 * @param {{ fromNode?: string }} [opts]
 */
function buildGuideQuery(opts = {}) {
  const params = new URLSearchParams();
  if (opts.fromNode) params.set('fromNode', opts.fromNode);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * 오늘 승차권 승강장 안내 (유저 기준 — 레거시/디버그)
 * GET /api/users/{userId}/guide[?fromNode=n01]
 * @param {number} userId
 * @param {string | { fromNode?: string }} [fromNodeOrOpts]
 */
export async function fetchUserGuide(userId, fromNodeOrOpts) {
  if (!userId) throw new Error('userId가 없습니다.');
  const opts =
    typeof fromNodeOrOpts === 'string' || fromNodeOrOpts == null
      ? { fromNode: fromNodeOrOpts || undefined }
      : fromNodeOrOpts;
  const data = await apiRequest(`/api/users/${userId}/guide${buildGuideQuery(opts)}`);
  return normalizeUserGuide(data);
}

/**
 * 승차권 ID 기준 안내 (문자 링크 권장)
 * GET /api/tickets/{ticketId}/guide[?fromNode=]
 * @param {number} ticketId
 * @param {string | { fromNode?: string }} [fromNodeOrOpts]
 */
export async function fetchTicketGuide(ticketId, fromNodeOrOpts) {
  if (!ticketId) throw new Error('ticketId가 없습니다.');
  const opts =
    typeof fromNodeOrOpts === 'string' || fromNodeOrOpts == null
      ? { fromNode: fromNodeOrOpts || undefined }
      : fromNodeOrOpts;
  const data = await apiRequest(`/api/tickets/${ticketId}/guide${buildGuideQuery(opts)}`);
  return normalizeUserGuide(data);
}

/**
 * 승차권 목록 조회
 * GET /api/tickets[?userId={userId}]
 * @param {number} [userId] 생략 시 전체 조회
 */
export async function fetchAllTickets(userId) {
  const qs = userId ? `?userId=${userId}` : '';
  const data = await apiRequest(`/api/tickets${qs}`);
  return Array.isArray(data) ? data.map(normalizeApiTicket) : [];
}

/**
 * 승차권 단건 조회
 * GET /api/tickets/{ticketId}
 * @param {number} ticketId
 */
export async function fetchTicket(ticketId) {
  if (!ticketId) throw new Error('ticketId가 없습니다.');
  const data = await apiRequest(`/api/tickets/${ticketId}`);
  return normalizeApiTicket(data);
}

/**
 * 오늘 승차권 단계별 안내 (음성 포함) — 유저 기준 레거시
 * GET /api/users/{userId}/guide/steps[?fromNode=]
 * @param {number} userId
 * @param {string | { fromNode?: string }} [fromNodeOrOpts]
 */
export async function fetchUserGuideSteps(userId, fromNodeOrOpts) {
  if (!userId) throw new Error('userId가 없습니다.');
  const opts =
    typeof fromNodeOrOpts === 'string' || fromNodeOrOpts == null
      ? { fromNode: fromNodeOrOpts || undefined }
      : fromNodeOrOpts;
  return apiRequest(`/api/users/${userId}/guide/steps${buildGuideQuery(opts)}`);
}

/**
 * 승차권 ID 기준 단계별 안내 (음성 포함) — 문자 링크 권장
 * GET /api/tickets/{ticketId}/guide/steps[?fromNode=]
 * @param {number} ticketId
 * @param {string | { fromNode?: string }} [fromNodeOrOpts]
 */
export async function fetchTicketGuideSteps(ticketId, fromNodeOrOpts) {
  if (!ticketId) throw new Error('ticketId가 없습니다.');
  const opts =
    typeof fromNodeOrOpts === 'string' || fromNodeOrOpts == null
      ? { fromNode: fromNodeOrOpts || undefined }
      : fromNodeOrOpts;
  return apiRequest(`/api/tickets/${ticketId}/guide/steps${buildGuideQuery(opts)}`);
}

/**
 * 텍스트 → 음성 변환 (Google Cloud TTS)
 * POST /api/tts
 * @param {string} text
 * @returns {Promise<string>} base64 MP3
 */
export async function fetchTts(text) {
  if (!text) throw new Error('text가 없습니다.');
  const data = await apiRequest('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  // 서버가 { audioBase64: "..." } 또는 { audio: "..." } 형태로 반환
  return data.audioBase64 ?? data.audio ?? data;
}

/**
 * 두 노드 간 최적 경로 (Dijkstra)
 * GET /api/paths?from={from}&to={to}
 * @param {{ from: string, to: string }} params
 * @returns {Promise<import('./normalize').GuideRoute>}
 */
export async function fetchPath({ from, to }) {
  if (!from || !to) throw new Error('from/to 노드 ID가 필요합니다.');
  const data = await apiRequest(`/api/paths?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  if (!data.found) throw new Error('경로를 찾을 수 없습니다.');
  return normalizePath(data);
}

