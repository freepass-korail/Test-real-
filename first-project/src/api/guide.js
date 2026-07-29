import { apiRequest } from './client';
import { normalizeRoute, normalizeSession } from './normalize';

/**
 * URL 쿼리에서 세션 토큰 추출
 * @returns {string | null}
 */
export function getSessionTokenFromUrl(search = window.location.search) {
  const params = new URLSearchParams(search);
  return params.get('token') ?? params.get('reservationId');
}

/**
 * SMS/URL 토큰으로 승차권 세션 조회
 * GET /api/v1/guide/sessions/{token}
 * @param {string} token
 */
export async function fetchSession(token) {
  if (!token?.trim()) {
    throw new Error('세션 토큰이 없습니다.');
  }

  const data = await apiRequest(`/api/v1/guide/sessions/${encodeURIComponent(token.trim())}`);
  return normalizeSession(data);
}

/**
 * reservationId 기준 최적 경로(steps) 조회
 * POST /api/v1/guide/routes
 * @param {{ reservationId: string, startNodeId?: string, lat?: number, lng?: number }} params
 */
export async function fetchRoute(params) {
  if (!params?.reservationId) {
    throw new Error('reservationId가 없습니다.');
  }

  const body = { reservationId: params.reservationId };
  if (params.startNodeId) body.startNodeId = params.startNodeId;
  if (params.lat != null) body.lat = params.lat;
  if (params.lng != null) body.lng = params.lng;

  const data = await apiRequest('/api/v1/guide/routes', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return normalizeRoute(data);
}

/**
 * 보호자 알림 — 길찾기 완료
 * POST /api/v1/guide/complete
 * @param {string} reservationId
 */
export async function completeGuide(reservationId) {
  if (!reservationId) {
    throw new Error('reservationId가 없습니다.');
  }

  return apiRequest('/api/v1/guide/complete', {
    method: 'POST',
    body: JSON.stringify({ reservationId }),
  });
}
