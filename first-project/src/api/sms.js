import { API_BASE } from './config';
import { ApiError } from './client';

/**
 * 탑승 안내 문자 즉시 발송 (테스트)
 * POST /sms/test/{ticketId}
 *
 * 15분 조건·중복 방지와 무관하게 해당 승차권 유저 전화번호로 1건 발송.
 * @param {number} ticketId
 * @returns {Promise<object>}
 * @see http://43.201.30.167:8080/swagger-ui/index.html#/SMS/sendTest
 */
export async function sendTestSms(ticketId) {
  if (!ticketId) throw new Error('ticketId가 없습니다.');

  const response = await fetch(`${API_BASE}/sms/test/${encodeURIComponent(ticketId)}`, {
    method: 'POST',
    headers: { Accept: '*/*' },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ApiError(text || `SMS 발송 실패: ${response.status}`, response.status);
  }

  const ct = response.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return response.json().catch(() => ({ ok: true }));
  }
  const text = await response.text().catch(() => '');
  return text ? { message: text } : { ok: true };
}
